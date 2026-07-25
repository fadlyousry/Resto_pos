import Database from "@tauri-apps/plugin-sql";
import { initialState } from "./seed";
import type { AppState, CashTransaction, Customer, Driver, DriverSettlement, Order, Product } from "./types";

const STORAGE_KEY = "beitna-pos-state-v1";
let database: Database | null = null;

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function initDatabase() {
  if (!database) database = await Database.load("sqlite:beitna.db");

  await database.execute(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, section TEXT NOT NULL,
    unit TEXT NOT NULL, price REAL NOT NULL, cost REAL NOT NULL, available INTEGER NOT NULL,
    accent TEXT NOT NULL
  )`);
  await database.execute(`CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
    zone TEXT NOT NULL, notes TEXT, orders_count INTEGER NOT NULL, total_spent REAL NOT NULL,
    last_order TEXT
  )`);
  await database.execute(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, customer_id TEXT NOT NULL,
    customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, address TEXT NOT NULL,
    items_json TEXT NOT NULL, subtotal REAL NOT NULL, delivery_fee REAL NOT NULL,
    discount REAL NOT NULL, total REAL NOT NULL, payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL, stage TEXT NOT NULL, created_at TEXT NOT NULL,
    scheduled_for TEXT, note TEXT, driver TEXT
  )`);
  await database.execute(`CREATE TABLE IF NOT EXISTS cash_transactions (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, method TEXT NOT NULL, amount REAL NOT NULL,
    direction TEXT NOT NULL, description TEXT NOT NULL, order_id TEXT, created_at TEXT NOT NULL
  )`);
  await database.execute(`CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, active INTEGER NOT NULL,
    vehicle TEXT, created_at TEXT NOT NULL
  )`);
  await database.execute(`CREATE TABLE IF NOT EXISTS driver_settlements (
    id TEXT PRIMARY KEY, driver_id TEXT NOT NULL, driver_name TEXT NOT NULL,
    order_ids_json TEXT NOT NULL, gross_collected REAL NOT NULL, delivery_fees REAL NOT NULL,
    expenses REAL NOT NULL, amount_received REAL NOT NULL, difference REAL NOT NULL,
    note TEXT, created_at TEXT NOT NULL
  )`);
  for (const migration of [
    "ALTER TABLE orders ADD COLUMN driver_id TEXT",
    "ALTER TABLE orders ADD COLUMN settlement_id TEXT"
  ]) {
    try { await database.execute(migration); } catch { /* column already exists */ }
  }
  await database.execute(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
  )`);
  return database;
}

export async function loadState(): Promise<AppState> {
  if (!isTauri()) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(initialState);
    const parsed = JSON.parse(saved) as Partial<AppState>;
    return {
      ...structuredClone(initialState),
      ...parsed,
      drivers: parsed.drivers ?? structuredClone(initialState.drivers),
      driverSettlements: parsed.driverSettlements ?? []
    };
  }

  const db = await initDatabase();
  const products = await db.select<Product[]>("SELECT id, name, category, section, unit, price, cost, available, accent FROM products");
  if (!products.length) {
    await saveState(initialState);
    return structuredClone(initialState);
  }

  const customersRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM customers");
  const ordersRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM orders ORDER BY created_at DESC");
  const cashRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM cash_transactions ORDER BY created_at DESC");
  const driversRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM drivers ORDER BY name");
  const settlementsRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM driver_settlements ORDER BY created_at DESC");
  const settings = await db.select<Array<{ key: string; value: string }>>("SELECT key, value FROM app_settings");
  const setting = Object.fromEntries(settings.map((row) => [row.key, row.value]));

  const customers: Customer[] = customersRaw.map((row) => ({
    id: String(row.id), name: String(row.name), phone: String(row.phone),
    address: String(row.address), zone: String(row.zone), notes: row.notes ? String(row.notes) : undefined,
    ordersCount: Number(row.orders_count), totalSpent: Number(row.total_spent),
    lastOrder: row.last_order ? String(row.last_order) : undefined
  }));
  const orders: Order[] = ordersRaw.map((row) => ({
    id: String(row.id), number: Number(row.number), customerId: String(row.customer_id),
    customerName: String(row.customer_name), customerPhone: String(row.customer_phone),
    address: String(row.address), items: JSON.parse(String(row.items_json)),
    subtotal: Number(row.subtotal), deliveryFee: Number(row.delivery_fee),
    discount: Number(row.discount), total: Number(row.total),
    paymentMethod: row.payment_method as Order["paymentMethod"],
    paymentStatus: row.payment_status as Order["paymentStatus"],
    stage: row.stage as Order["stage"], createdAt: String(row.created_at),
    scheduledFor: row.scheduled_for ? String(row.scheduled_for) : undefined,
    note: row.note ? String(row.note) : undefined,
    driverId: row.driver_id ? String(row.driver_id) : undefined,
    driver: row.driver ? String(row.driver) : undefined,
    settlementId: row.settlement_id ? String(row.settlement_id) : undefined
  }));
  const cashTransactions: CashTransaction[] = cashRaw.map((row) => ({
    id: String(row.id), type: row.type as CashTransaction["type"],
    method: row.method as CashTransaction["method"], amount: Number(row.amount),
    direction: row.direction as CashTransaction["direction"], description: String(row.description),
    orderId: row.order_id ? String(row.order_id) : undefined, createdAt: String(row.created_at)
  }));
  const drivers: Driver[] = driversRaw.map((row) => ({
    id: String(row.id), name: String(row.name), phone: String(row.phone),
    active: Boolean(row.active), vehicle: row.vehicle ? String(row.vehicle) : undefined,
    createdAt: String(row.created_at)
  }));
  const driverSettlements: DriverSettlement[] = settlementsRaw.map((row) => ({
    id: String(row.id), driverId: String(row.driver_id), driverName: String(row.driver_name),
    orderIds: JSON.parse(String(row.order_ids_json)), grossCollected: Number(row.gross_collected),
    deliveryFees: Number(row.delivery_fees), expenses: Number(row.expenses),
    amountReceived: Number(row.amount_received), difference: Number(row.difference),
    note: row.note ? String(row.note) : undefined, createdAt: String(row.created_at)
  }));

  return {
    products: products.map((product) => ({ ...product, available: Boolean(product.available) })),
    customers, orders, drivers: drivers.length ? drivers : structuredClone(initialState.drivers),
    driverSettlements, cashTransactions,
    shiftOpeningBalance: Number(setting.shiftOpeningBalance ?? 500),
    shiftOpenedAt: setting.shiftOpenedAt ?? new Date().toISOString(),
    nextOrderNumber: Number(setting.nextOrderNumber ?? 1001)
  };
}

export async function saveState(state: AppState) {
  if (!isTauri()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return;
  }

  const db = await initDatabase();
  for (const product of state.products) {
    await db.execute(
      `INSERT INTO products (id,name,category,section,unit,price,cost,available,accent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET name=$2,category=$3,section=$4,unit=$5,price=$6,cost=$7,available=$8,accent=$9`,
      [product.id, product.name, product.category, product.section, product.unit, product.price, product.cost, product.available ? 1 : 0, product.accent]
    );
  }
  for (const customer of state.customers) {
    await db.execute(
      `INSERT INTO customers (id,name,phone,address,zone,notes,orders_count,total_spent,last_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET name=$2,phone=$3,address=$4,zone=$5,notes=$6,orders_count=$7,total_spent=$8,last_order=$9`,
      [customer.id, customer.name, customer.phone, customer.address, customer.zone, customer.notes ?? null, customer.ordersCount, customer.totalSpent, customer.lastOrder ?? null]
    );
  }
  for (const order of state.orders) {
    await db.execute(
      `INSERT INTO orders (id,number,customer_id,customer_name,customer_phone,address,items_json,subtotal,delivery_fee,discount,total,payment_method,payment_status,stage,created_at,scheduled_for,note,driver,driver_id,settlement_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT(id) DO UPDATE SET payment_status=$13,stage=$14,driver=$18,driver_id=$19,settlement_id=$20`,
      [order.id, order.number, order.customerId, order.customerName, order.customerPhone, order.address, JSON.stringify(order.items), order.subtotal, order.deliveryFee, order.discount, order.total, order.paymentMethod, order.paymentStatus, order.stage, order.createdAt, order.scheduledFor ?? null, order.note ?? null, order.driver ?? null, order.driverId ?? null, order.settlementId ?? null]
    );
  }
  for (const driver of state.drivers) {
    await db.execute(
      `INSERT INTO drivers (id,name,phone,active,vehicle,created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT(id) DO UPDATE SET name=$2,phone=$3,active=$4,vehicle=$5`,
      [driver.id, driver.name, driver.phone, driver.active ? 1 : 0, driver.vehicle ?? null, driver.createdAt]
    );
  }
  for (const settlement of state.driverSettlements) {
    await db.execute(
      `INSERT INTO driver_settlements (id,driver_id,driver_name,order_ids_json,gross_collected,delivery_fees,expenses,amount_received,difference,note,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(id) DO NOTHING`,
      [settlement.id, settlement.driverId, settlement.driverName, JSON.stringify(settlement.orderIds), settlement.grossCollected, settlement.deliveryFees, settlement.expenses, settlement.amountReceived, settlement.difference, settlement.note ?? null, settlement.createdAt]
    );
  }
  for (const transaction of state.cashTransactions) {
    await db.execute(
      `INSERT INTO cash_transactions (id,type,method,amount,direction,description,order_id,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO NOTHING`,
      [transaction.id, transaction.type, transaction.method, transaction.amount, transaction.direction, transaction.description, transaction.orderId ?? null, transaction.createdAt]
    );
  }
  for (const [key, value] of Object.entries({
    shiftOpeningBalance: String(state.shiftOpeningBalance),
    shiftOpenedAt: state.shiftOpenedAt,
    nextOrderNumber: String(state.nextOrderNumber)
  })) {
    await db.execute(
      "INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2",
      [key, value]
    );
  }
}
