use std::{
    collections::HashMap,
    net::{SocketAddr, UdpSocket},
    path::PathBuf,
    str::FromStr,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, DefaultBodyLimit, Query, State,
    },
    http::{header, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Row, SqlitePool,
};
use tokio::sync::{broadcast, RwLock};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use uuid::Uuid;

pub const SERVER_PORT: u16 = 4312;

#[derive(Clone)]
struct ServerState {
    pool: SqlitePool,
    events: broadcast::Sender<String>,
    devices: Arc<RwLock<HashMap<String, ConnectedDevice>>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectedDevice {
    connection_id: String,
    source_id: String,
    machine_id: String,
    device_name: String,
    role: String,
    ip_address: String,
    app_version: String,
    connected_at: u64,
    last_seen: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceQuery {
    source_id: Option<String>,
    machine_id: Option<String>,
    device_name: Option<String>,
    role: Option<String>,
    app_version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveStateRequest {
    state: Value,
    base_revision: Option<String>,
    source_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionedState {
    state: Value,
    revision: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveStateResponse {
    revision: String,
}

#[derive(Debug, Serialize)]
pub struct ServerInfo {
    pub port: u16,
    pub local_url: String,
    pub network_url: Option<String>,
}

struct ApiError {
    status: StatusCode,
    message: String,
    payload: Option<Value>,
}

impl ApiError {
    fn internal(error: impl std::fmt::Display) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: error.to_string(),
            payload: None,
        }
    }

    fn conflict(current: VersionedState) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            message: "state_revision_conflict".into(),
            payload: Some(json!({
                "error": "state_revision_conflict",
                "state": current.state,
                "revision": current.revision
            })),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let payload = self
            .payload
            .unwrap_or_else(|| json!({ "error": self.message }));
        (self.status, Json(payload)).into_response()
    }
}

pub async fn run(database_path: PathBuf) -> Result<(), String> {
    let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", database_path.display()))
        .map_err(|error| error.to_string())?
        .create_if_missing(true)
        .busy_timeout(std::time::Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|error| error.to_string())?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS central_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            state_json TEXT NOT NULL,
            revision TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await
    .map_err(|error| error.to_string())?;

    let (events, _) = broadcast::channel(128);
    let state = ServerState {
        pool,
        events,
        devices: Arc::new(RwLock::new(HashMap::new())),
    };
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE]);

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/devices", get(get_devices))
        .route("/api/state", get(get_state).put(put_state))
        .route("/api/state/bootstrap", post(bootstrap_state))
        .route("/ws", get(websocket))
        .layer(DefaultBodyLimit::max(32 * 1024 * 1024))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", SERVER_PORT))
        .await
        .map_err(|error| error.to_string())?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .map_err(|error| error.to_string())
}

async fn get_devices(State(state): State<ServerState>) -> Json<Vec<ConnectedDevice>> {
    Json(connected_devices(&state).await)
}

async fn health(State(state): State<ServerState>) -> Result<Json<Value>, ApiError> {
    let revision =
        sqlx::query_scalar::<_, String>("SELECT revision FROM central_state WHERE id = 1")
            .fetch_optional(&state.pool)
            .await
            .map_err(ApiError::internal)?;
    Ok(Json(json!({
        "status": "ok",
        "service": "beitna-pos-server",
        "revision": revision
    })))
}

async fn get_state(State(state): State<ServerState>) -> Result<Json<VersionedState>, ApiError> {
    match read_current_state(&state.pool).await? {
        Some(current) => Ok(Json(current)),
        None => Err(ApiError {
            status: StatusCode::NOT_FOUND,
            message: "state_not_initialized".into(),
            payload: None,
        }),
    }
}

async fn bootstrap_state(
    State(state): State<ServerState>,
    Json(request): Json<SaveStateRequest>,
) -> Result<Json<VersionedState>, ApiError> {
    let mut transaction = state.pool.begin().await.map_err(ApiError::internal)?;
    if let Some(current) = read_current_state_in_transaction(&mut transaction).await? {
        transaction.commit().await.map_err(ApiError::internal)?;
        return Ok(Json(current));
    }

    let revision = Uuid::new_v4().to_string();
    let serialized = serde_json::to_string(&request.state).map_err(ApiError::internal)?;
    sqlx::query(
        "INSERT INTO central_state (id, state_json, revision, updated_at)
         VALUES (1, ?, ?, CURRENT_TIMESTAMP)",
    )
    .bind(serialized)
    .bind(&revision)
    .execute(&mut *transaction)
    .await
    .map_err(ApiError::internal)?;
    transaction.commit().await.map_err(ApiError::internal)?;
    broadcast_revision(&state, &request.source_id, &revision);
    Ok(Json(VersionedState {
        state: request.state,
        revision,
    }))
}

async fn put_state(
    State(state): State<ServerState>,
    Json(request): Json<SaveStateRequest>,
) -> Result<Json<SaveStateResponse>, ApiError> {
    let mut transaction = state.pool.begin().await.map_err(ApiError::internal)?;
    let current = read_current_state_in_transaction(&mut transaction).await?;
    let Some(current) = current else {
        return Err(ApiError {
            status: StatusCode::PRECONDITION_REQUIRED,
            message: "state_not_initialized".into(),
            payload: None,
        });
    };

    if request.base_revision.as_deref() != Some(current.revision.as_str()) {
        transaction.rollback().await.map_err(ApiError::internal)?;
        return Err(ApiError::conflict(current));
    }

    let revision = Uuid::new_v4().to_string();
    let serialized = serde_json::to_string(&request.state).map_err(ApiError::internal)?;
    let result = sqlx::query(
        "UPDATE central_state
         SET state_json = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = 1 AND revision = ?",
    )
    .bind(serialized)
    .bind(&revision)
    .bind(&current.revision)
    .execute(&mut *transaction)
    .await
    .map_err(ApiError::internal)?;

    if result.rows_affected() != 1 {
        transaction.rollback().await.map_err(ApiError::internal)?;
        let latest = read_current_state(&state.pool)
            .await?
            .ok_or_else(|| ApiError::internal("central state disappeared"))?;
        return Err(ApiError::conflict(latest));
    }

    transaction.commit().await.map_err(ApiError::internal)?;
    broadcast_revision(&state, &request.source_id, &revision);
    Ok(Json(SaveStateResponse { revision }))
}

async fn websocket(
    ws: WebSocketUpgrade,
    State(state): State<ServerState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Query(device): Query<DeviceQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| websocket_client(socket, state, address, device))
}

async fn websocket_client(
    socket: WebSocket,
    state: ServerState,
    address: SocketAddr,
    device: DeviceQuery,
) {
    let connection_id = Uuid::new_v4().to_string();
    let source_id = device.source_id.unwrap_or_else(|| connection_id.clone());
    let machine_id = device.machine_id.unwrap_or_else(|| source_id.clone());
    let now = unix_timestamp();
    let connected_device = ConnectedDevice {
        connection_id: connection_id.clone(),
        source_id: source_id.clone(),
        machine_id,
        device_name: device
            .device_name
            .unwrap_or_else(|| "جهاز Resto POS".to_string()),
        role: device.role.unwrap_or_else(|| "terminal".to_string()),
        ip_address: address.ip().to_string(),
        app_version: device.app_version.unwrap_or_default(),
        connected_at: now,
        last_seen: now,
    };
    state
        .devices
        .write()
        .await
        .insert(source_id.clone(), connected_device);
    broadcast_devices(&state).await;

    let (mut sender, mut receiver) = socket.split();
    let mut events = state.events.subscribe();
    let mut heartbeat_check = tokio::time::interval(Duration::from_secs(15));
    let revision =
        sqlx::query_scalar::<_, String>("SELECT revision FROM central_state WHERE id = 1")
            .fetch_optional(&state.pool)
            .await
            .ok()
            .flatten();
    let connected = json!({
        "type": "connected",
        "revision": revision,
        "devices": connected_devices(&state).await
    })
    .to_string();
    if sender.send(Message::Text(connected.into())).await.is_err() {
        remove_device(&state, &source_id, &connection_id).await;
        return;
    }

    loop {
        tokio::select! {
            message = events.recv() => {
                match message {
                    Ok(message) => {
                        if sender.send(Message::Text(message.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            incoming = receiver.next() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    Some(Ok(Message::Text(message))) => {
                        if message.contains("presence") {
                            if let Some(connected) = state.devices.write().await.get_mut(&source_id) {
                                if connected.connection_id == connection_id {
                                    connected.last_seen = unix_timestamp();
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ = heartbeat_check.tick() => {
                let is_stale = state.devices.read().await
                    .get(&source_id)
                    .map(|connected| connected.connection_id == connection_id
                        && unix_timestamp().saturating_sub(connected.last_seen) > 45)
                    .unwrap_or(true);
                if is_stale {
                    break;
                }
            }
        }
    }
    remove_device(&state, &source_id, &connection_id).await;
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

async fn connected_devices(state: &ServerState) -> Vec<ConnectedDevice> {
    let mut devices = state
        .devices
        .read()
        .await
        .values()
        .cloned()
        .collect::<Vec<_>>();
    devices.sort_by(|left, right| left.device_name.cmp(&right.device_name));
    devices
}

async fn broadcast_devices(state: &ServerState) {
    let _ = state.events.send(
        json!({ "type": "devices.updated", "devices": connected_devices(state).await }).to_string(),
    );
}

async fn remove_device(state: &ServerState, source_id: &str, connection_id: &str) {
    let removed = {
        let mut devices = state.devices.write().await;
        let matches = devices
            .get(source_id)
            .map(|device| device.connection_id == connection_id)
            .unwrap_or(false);
        if matches {
            devices.remove(source_id).is_some()
        } else {
            false
        }
    };
    if removed {
        broadcast_devices(state).await;
    }
}

async fn read_current_state(pool: &SqlitePool) -> Result<Option<VersionedState>, ApiError> {
    let row = sqlx::query("SELECT state_json, revision FROM central_state WHERE id = 1")
        .fetch_optional(pool)
        .await
        .map_err(ApiError::internal)?;
    row.map(parse_state_row).transpose()
}

async fn read_current_state_in_transaction(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<Option<VersionedState>, ApiError> {
    let row = sqlx::query("SELECT state_json, revision FROM central_state WHERE id = 1")
        .fetch_optional(&mut **transaction)
        .await
        .map_err(ApiError::internal)?;
    row.map(parse_state_row).transpose()
}

fn parse_state_row(row: sqlx::sqlite::SqliteRow) -> Result<VersionedState, ApiError> {
    let serialized: String = row.try_get("state_json").map_err(ApiError::internal)?;
    let revision: String = row.try_get("revision").map_err(ApiError::internal)?;
    let state = serde_json::from_str(&serialized).map_err(ApiError::internal)?;
    Ok(VersionedState { state, revision })
}

fn broadcast_revision(state: &ServerState, source_id: &str, revision: &str) {
    let _ = state.events.send(
        json!({
            "type": "state.updated",
            "sourceId": source_id,
            "revision": revision
        })
        .to_string(),
    );
}

pub fn server_info() -> ServerInfo {
    let network_url = UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr()
        })
        .ok()
        .map(|address| format!("http://{}:{}", address.ip(), SERVER_PORT));
    ServerInfo {
        port: SERVER_PORT,
        local_url: format!("http://127.0.0.1:{SERVER_PORT}"),
        network_url,
    }
}
