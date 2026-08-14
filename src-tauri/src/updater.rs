use serde::Serialize;
use std::sync::Mutex;
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterConfiguration {
    pub current_version: String,
    pub repository: Option<String>,
    pub configured: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    pub current_version: String,
    pub version: String,
    pub notes: Option<String>,
    pub published_at: Option<String>,
    pub repository: String,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
        downloaded: usize,
        content_length: Option<u64>,
    },
    Finished,
}

#[tauri::command]
pub fn get_updater_configuration(app: AppHandle) -> UpdaterConfiguration {
    let repository = compiled_repository();
    UpdaterConfiguration {
        current_version: app.package_info().version.to_string(),
        configured: repository.is_some(),
        repository,
    }
}

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<Option<UpdateMetadata>, String> {
    let repository = compiled_repository().ok_or_else(|| {
        "لم يتم تحديد مستودع GitHub. ابنِ النسخة من GitHub Actions أو عرّف RESTO_POS_UPDATE_REPOSITORY"
            .to_string()
    })?;
    validate_repository(&repository)?;
    let endpoint = format!("https://github.com/{repository}/releases/latest/download/latest.json")
        .parse()
        .map_err(|error| format!("عنوان تحديث GitHub غير صالح: {error}"))?;

    let update = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| error.to_string())?
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;

    let metadata = update.as_ref().map(|update| UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        notes: update.body.clone(),
        published_at: update.date.map(|date| date.to_string()),
        repository,
    });
    *pending_update
        .0
        .lock()
        .map_err(|_| "تعذر حفظ التحديث المنتظر".to_string())? = update;
    Ok(metadata)
}

#[tauri::command]
pub async fn install_pending_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let update = pending_update
        .0
        .lock()
        .map_err(|_| "تعذر الوصول إلى التحديث".to_string())?
        .take()
        .ok_or_else(|| "لا يوجد تحديث جاهز للتثبيت".to_string())?;

    let mut downloaded = 0usize;
    let mut started = false;
    let progress_channel = on_event.clone();
    let finished_channel = on_event;
    update
        .download_and_install(
            move |chunk_length, content_length| {
                if !started {
                    started = true;
                    let _ = progress_channel.send(DownloadEvent::Started { content_length });
                }
                downloaded += chunk_length;
                let _ = progress_channel.send(DownloadEvent::Progress {
                    chunk_length,
                    downloaded,
                    content_length,
                });
            },
            move || {
                let _ = finished_channel.send(DownloadEvent::Finished);
            },
        )
        .await
        .map_err(|error| error.to_string())?;

    app.restart();
}

fn compiled_repository() -> Option<String> {
    option_env!("RESTO_POS_UPDATE_REPOSITORY")
        .or(option_env!("GITHUB_REPOSITORY"))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| Some("fadlyousry/Resto_pos".to_string()))
}

fn validate_repository(repository: &str) -> Result<(), String> {
    let parts = repository.split('/').collect::<Vec<_>>();
    if parts.len() != 2
        || parts.iter().any(|part| {
            part.is_empty()
                || !part
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
        })
    {
        return Err("اسم مستودع التحديث يجب أن يكون بالصيغة owner/repository".into());
    }
    Ok(())
}
