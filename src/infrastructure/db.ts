import Database from "@tauri-apps/plugin-sql";
import { initialState } from "./seed";
import type {
  AppState, CashTransaction, Customer, DeliveryCompany, Driver, DriverSettlement, Ingredient,
  Order, Product, ProductCategory, RecipeItem, StockMovement
} from "../domain/types";
import { normalizeAppState } from "../shared/state";

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
  await database.execute(`CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL, stock_qty REAL NOT NULL,
    min_stock REAL NOT NULL, unit_cost REAL NOT NULL, active INTEGER NOT NULL
  )`);
  await database.execute(`CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL, ingredient_id TEXT NOT NULL, quantity REAL NOT NULL
  )`);
  await database.execute(`CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY, ingredient_id TEXT NOT NULL, ingredient_name TEXT NOT NULL,
    type TEXT NOT NULL, quantity REAL NOT NULL, unit_cost REAL NOT NULL,
    description TEXT NOT NULL, order_id TEXT, created_at TEXT NOT NULL
  )`);
  await database.execute(`CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, section TEXT NOT NULL,
    color TEXT NOT NULL, active INTEGER NOT NULL
  )`);
  await database.execute(`CREATE TABLE IF NOT EXISTS delivery_companies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, base_fee REAL NOT NULL,
    active INTEGER NOT NULL, notes TEXT
  )`);
  for (const migration of [
    "ALTER TABLE orders ADD COLUMN driver_id TEXT",
    "ALTER TABLE orders ADD COLUMN settlement_id TEXT",
    "ALTER TABLE orders ADD COLUMN inventory_deducted INTEGER DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'pos'",
    "ALTER TABLE orders ADD COLUMN delivery_company_id TEXT",
    "ALTER TABLE orders ADD COLUMN delivery_company TEXT"
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
    return normalizeAppState(parsed, structuredClone(initialState));
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
  const ingredientsRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM ingredients ORDER BY name");
  const recipesRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM recipes");
  const stockRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM stock_movements ORDER BY created_at DESC");
  const categoriesRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM categories ORDER BY section, name");
  const deliveryCompaniesRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM delivery_companies ORDER BY name");
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
    settlementId: row.settlement_id ? String(row.settlement_id) : undefined,
    inventoryDeducted: Boolean(row.inventory_deducted),
    source: (row.source ? String(row.source) : "pos") as Order["source"]
    ,
    deliveryCompanyId: row.delivery_company_id ? String(row.delivery_company_id) : undefined,
    deliveryCompany: row.delivery_company ? String(row.delivery_company) : undefined
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
  const ingredients: Ingredient[] = ingredientsRaw.map((row) => ({
    id: String(row.id), name: String(row.name), unit: String(row.unit),
    stockQty: Number(row.stock_qty), minStock: Number(row.min_stock),
    unitCost: Number(row.unit_cost), active: Boolean(row.active)
  }));
  const recipes: RecipeItem[] = recipesRaw.map((row) => ({
    id: String(row.id), productId: String(row.product_id),
    ingredientId: String(row.ingredient_id), quantity: Number(row.quantity)
  }));
  const stockMovements: StockMovement[] = stockRaw.map((row) => ({
    id: String(row.id), ingredientId: String(row.ingredient_id),
    ingredientName: String(row.ingredient_name), type: row.type as StockMovement["type"],
    quantity: Number(row.quantity), unitCost: Number(row.unit_cost),
    description: String(row.description), orderId: row.order_id ? String(row.order_id) : undefined,
    createdAt: String(row.created_at)
  }));
  const categories: ProductCategory[] = categoriesRaw.map((row) => ({
    id: String(row.id), name: String(row.name),
    section: row.section as ProductCategory["section"],
    color: String(row.color), active: Boolean(row.active)
  }));
  const deliveryCompanies: DeliveryCompany[] = deliveryCompaniesRaw.map((row) => ({
    id: String(row.id), name: String(row.name), phone: row.phone ? String(row.phone) : undefined,
    baseFee: Number(row.base_fee), active: Boolean(row.active),
    notes: row.notes ? String(row.notes) : undefined
  }));

  return {
    products: products.map((product) => ({ ...product, available: Boolean(product.available) })),
    categories: categories.length ? categories : structuredClone(initialState.categories),
    customers, orders, drivers: drivers.length ? drivers : structuredClone(initialState.drivers),
    deliveryCompanies: deliveryCompanies.length ? deliveryCompanies : structuredClone(initialState.deliveryCompanies),
    driverSettlements,
    ingredients: ingredients.length ? ingredients : structuredClone(initialState.ingredients),
    recipes: recipes.length ? recipes : structuredClone(initialState.recipes),
    stockMovements,
    cashTransactions,
    shiftOpeningBalance: Number(setting.shiftOpeningBalance ?? 500),
    shiftOpenedAt: setting.shiftOpenedAt ?? new Date().toISOString(),
    nextOrderNumber: Number(setting.nextOrderNumber ?? 1001),
    settings: setting.restaurantSettings
      ? { ...structuredClone(initialState.settings), ...JSON.parse(setting.restaurantSettings) }
      : structuredClone(initialState.settings)
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
  for (const category of state.categories) {
    await db.execute(
      `INSERT INTO categories (id,name,section,color,active)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT(id) DO UPDATE SET name=$2,section=$3,color=$4,active=$5`,
      [category.id, category.name, category.section, category.color, category.active ? 1 : 0]
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
      `INSERT INTO orders (id,number,customer_id,customer_name,customer_phone,address,items_json,subtotal,delivery_fee,discount,total,payment_method,payment_status,stage,created_at,scheduled_for,note,driver,driver_id,settlement_id,inventory_deducted,source,delivery_company_id,delivery_company)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT(id) DO UPDATE SET customer_name=$4,customer_phone=$5,address=$6,items_json=$7,subtotal=$8,delivery_fee=$9,discount=$10,total=$11,payment_method=$12,payment_status=$13,stage=$14,scheduled_for=$16,note=$17,driver=$18,driver_id=$19,settlement_id=$20,inventory_deducted=$21,source=$22,delivery_company_id=$23,delivery_company=$24`,
      [order.id, order.number, order.customerId, order.customerName, order.customerPhone, order.address, JSON.stringify(order.items), order.subtotal, order.deliveryFee, order.discount, order.total, order.paymentMethod, order.paymentStatus, order.stage, order.createdAt, order.scheduledFor ?? null, order.note ?? null, order.driver ?? null, order.driverId ?? null, order.settlementId ?? null, order.inventoryDeducted ? 1 : 0, order.source ?? "pos", order.deliveryCompanyId ?? null, order.deliveryCompany ?? null]
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
  for (const company of state.deliveryCompanies) {
    await db.execute(
      `INSERT INTO delivery_companies (id,name,phone,base_fee,active,notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT(id) DO UPDATE SET name=$2,phone=$3,base_fee=$4,active=$5,notes=$6`,
      [company.id, company.name, company.phone ?? null, company.baseFee, company.active ? 1 : 0, company.notes ?? null]
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
  for (const ingredient of state.ingredients) {
    await db.execute(
      `INSERT INTO ingredients (id,name,unit,stock_qty,min_stock,unit_cost,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(id) DO UPDATE SET name=$2,unit=$3,stock_qty=$4,min_stock=$5,unit_cost=$6,active=$7`,
      [ingredient.id, ingredient.name, ingredient.unit, ingredient.stockQty, ingredient.minStock, ingredient.unitCost, ingredient.active ? 1 : 0]
    );
  }
  for (const recipe of state.recipes) {
    await db.execute(
      `INSERT INTO recipes (id,product_id,ingredient_id,quantity)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT(id) DO UPDATE SET product_id=$2,ingredient_id=$3,quantity=$4`,
      [recipe.id, recipe.productId, recipe.ingredientId, recipe.quantity]
    );
  }
  for (const movement of state.stockMovements) {
    await db.execute(
      `INSERT INTO stock_movements (id,ingredient_id,ingredient_name,type,quantity,unit_cost,description,order_id,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO NOTHING`,
      [movement.id, movement.ingredientId, movement.ingredientName, movement.type, movement.quantity, movement.unitCost, movement.description, movement.orderId ?? null, movement.createdAt]
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
    ,
    restaurantSettings: JSON.stringify(state.settings)
  })) {
    await db.execute(
      "INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2",
      [key, value]
    );
  }
}
