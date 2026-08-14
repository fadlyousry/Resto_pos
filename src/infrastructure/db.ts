import Database from "@tauri-apps/plugin-sql";
import { initialState } from "./seed";
import type {
  AppState, CashShift, CashTransaction, Customer, Driver, DriverSettlement, Ingredient,
  Order, Product, ProductCategory, PurchaseInvoice, RecipeItem, StockMovement, Supplier
} from "../domain/types";
import { normalizeAppState, normalizeOrderStage } from "../shared/state";
import { uid } from "../shared/id";

const STORAGE_KEY = "beitna-pos-state-v1";
const STATE_REVISION_KEY = "beitna-pos-state-revision-v1";
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
  await database.execute(`CREATE TABLE IF NOT EXISTS cash_shifts (
    id TEXT PRIMARY KEY, opened_at TEXT NOT NULL, opening_balance REAL NOT NULL,
    closed_at TEXT, expected_cash REAL, actual_cash REAL, difference REAL, note TEXT
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
  await database.execute(`CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
    notes TEXT, active INTEGER NOT NULL
  )`);
  await database.execute(`CREATE TABLE IF NOT EXISTS purchase_invoices (
    id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, supplier_id TEXT NOT NULL,
    supplier_name TEXT NOT NULL, items_json TEXT NOT NULL, subtotal REAL NOT NULL,
    discount REAL NOT NULL, total REAL NOT NULL, payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL
  )`);
  for (const migration of [
    "ALTER TABLE products ADD COLUMN options_json TEXT",
    "ALTER TABLE products ADD COLUMN image_data_url TEXT",
    "ALTER TABLE driver_settlements ADD COLUMN payment_method TEXT DEFAULT 'cash'",
    "ALTER TABLE orders ADD COLUMN driver_id TEXT",
    "ALTER TABLE orders ADD COLUMN settlement_id TEXT",
    "ALTER TABLE orders ADD COLUMN inventory_deducted INTEGER DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'pos'",
    "ALTER TABLE orders ADD COLUMN shift_number INTEGER",
    "ALTER TABLE orders ADD COLUMN shift_id TEXT",
    "ALTER TABLE orders ADD COLUMN return_reason TEXT",
    "ALTER TABLE orders ADD COLUMN returned_at TEXT",
    "ALTER TABLE orders ADD COLUMN payment_refunded INTEGER DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN delivery_company_id TEXT",
    "ALTER TABLE orders ADD COLUMN delivery_company TEXT"
  ]) {
    try { await database.execute(migration); } catch { /* column already exists */ }
  }
  await database.execute("UPDATE orders SET stage = 'preparing' WHERE stage = 'confirmed'");
  await database.execute("UPDATE orders SET stage = 'ready' WHERE stage IN ('assembling', 'packing', 'out_for_delivery')");
  await database.execute("UPDATE orders SET stage = 'delivered' WHERE stage = 'cancelled'");
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
  const productsRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM products");
  const products: Product[] = productsRaw.map((row) => ({
    id: String(row.id), name: String(row.name), category: String(row.category),
    section: row.section as Product["section"], unit: String(row.unit),
    price: Number(row.price), cost: Number(row.cost), available: Boolean(row.available),
    accent: String(row.accent),
    imageDataUrl: row.image_data_url ? String(row.image_data_url) : undefined,
    options: row.options_json ? JSON.parse(String(row.options_json)) : undefined
  }));
  if (!products.length) {
    await saveState(initialState);
    return structuredClone(initialState);
  }

  const customersRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM customers");
  const ordersRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM orders ORDER BY created_at DESC");
  const cashRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM cash_transactions ORDER BY created_at DESC");
  const shiftsRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM cash_shifts ORDER BY opened_at DESC");
  const driversRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM drivers ORDER BY name");
  const settlementsRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM driver_settlements ORDER BY created_at DESC");
  const ingredientsRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM ingredients ORDER BY name");
  const recipesRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM recipes");
  const stockRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM stock_movements ORDER BY created_at DESC");
  const categoriesRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM categories ORDER BY section, name");
  const suppliersRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM suppliers ORDER BY name");
  const purchaseInvoicesRaw = await db.select<Array<Record<string, unknown>>>("SELECT * FROM purchase_invoices ORDER BY created_at DESC");
  const settings = await db.select<Array<{ key: string; value: string }>>("SELECT key, value FROM app_settings");
  const setting = Object.fromEntries(settings.map((row) => [row.key, row.value]));

  const customers: Customer[] = customersRaw.map((row) => ({
    id: String(row.id), name: String(row.name), phone: String(row.phone),
    address: String(row.address), zone: String(row.zone), notes: row.notes ? String(row.notes) : undefined,
    ordersCount: Number(row.orders_count), totalSpent: Number(row.total_spent),
    lastOrder: row.last_order ? String(row.last_order) : undefined
  }));
  const orders: Order[] = ordersRaw.map((row) => ({
    id: String(row.id), number: Number(row.number),
    shiftNumber: row.shift_number == null ? undefined : Number(row.shift_number),
    shiftId: row.shift_id ? String(row.shift_id) : undefined,
    customerId: String(row.customer_id),
    customerName: String(row.customer_name), customerPhone: String(row.customer_phone),
    address: String(row.address), items: JSON.parse(String(row.items_json)),
    subtotal: Number(row.subtotal), deliveryFee: Number(row.delivery_fee),
    discount: Number(row.discount), total: Number(row.total),
    paymentMethod: row.payment_method as Order["paymentMethod"],
    paymentStatus: row.payment_status as Order["paymentStatus"],
    stage: normalizeOrderStage(row.stage), createdAt: String(row.created_at),
    scheduledFor: row.scheduled_for ? String(row.scheduled_for) : undefined,
    note: row.note ? String(row.note) : undefined,
    driverId: row.driver_id ? String(row.driver_id) : undefined,
    driver: row.driver ? String(row.driver) : undefined,
    settlementId: row.settlement_id ? String(row.settlement_id) : undefined,
    returnReason: row.return_reason ? String(row.return_reason) : undefined,
    returnedAt: row.returned_at ? String(row.returned_at) : undefined,
    paymentRefunded: Boolean(row.payment_refunded),
    inventoryDeducted: Boolean(row.inventory_deducted),
    source: (row.source ? String(row.source) : "pos") as Order["source"]
  }));
  const cashTransactions: CashTransaction[] = cashRaw.map((row) => ({
    id: String(row.id), type: row.type as CashTransaction["type"],
    method: row.method as CashTransaction["method"], amount: Number(row.amount),
    direction: row.direction as CashTransaction["direction"], description: String(row.description),
    orderId: row.order_id ? String(row.order_id) : undefined, createdAt: String(row.created_at)
  }));
  const cashShifts: CashShift[] = shiftsRaw.map((row) => ({
    id: String(row.id), openedAt: String(row.opened_at), openingBalance: Number(row.opening_balance),
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
    expectedCash: row.expected_cash == null ? undefined : Number(row.expected_cash),
    actualCash: row.actual_cash == null ? undefined : Number(row.actual_cash),
    difference: row.difference == null ? undefined : Number(row.difference),
    note: row.note ? String(row.note) : undefined
  }));
  const drivers: Driver[] = driversRaw.map((row) => ({
    id: String(row.id), name: String(row.name), phone: String(row.phone),
    active: Boolean(row.active), vehicle: row.vehicle ? String(row.vehicle) : undefined,
    createdAt: String(row.created_at)
  }));
  const driverSettlements: DriverSettlement[] = settlementsRaw.map((row) => ({
    id: String(row.id), driverId: String(row.driver_id), driverName: String(row.driver_name),
    orderIds: JSON.parse(String(row.order_ids_json)), grossCollected: Number(row.gross_collected),
    paymentMethod: (row.payment_method ? String(row.payment_method) : "cash") as DriverSettlement["paymentMethod"],
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
  const suppliers: Supplier[] = suppliersRaw.map((row) => ({
    id: String(row.id), name: String(row.name), phone: String(row.phone),
    notes: row.notes ? String(row.notes) : undefined, active: Boolean(row.active)
  }));
  const purchaseInvoices: PurchaseInvoice[] = purchaseInvoicesRaw.map((row) => ({
    id: String(row.id), number: Number(row.number), supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name), items: JSON.parse(String(row.items_json)),
    subtotal: Number(row.subtotal), discount: Number(row.discount), total: Number(row.total),
    paymentMethod: row.payment_method as PurchaseInvoice["paymentMethod"],
    paymentStatus: row.payment_status as PurchaseInvoice["paymentStatus"],
    note: row.note ? String(row.note) : undefined, createdAt: String(row.created_at)
  }));

  return {
    products,
    sections: setting.menuSections
      ? JSON.parse(setting.menuSections)
      : structuredClone(initialState.sections),
    meals: setting.menuMeals ? JSON.parse(setting.menuMeals) : [],
    categories: categories.length ? categories : structuredClone(initialState.categories),
    customers, orders, drivers: drivers.length ? drivers : structuredClone(initialState.drivers),
    driverSettlements,
    suppliers,
    purchaseInvoices,
    ingredients: ingredients.length ? ingredients : structuredClone(initialState.ingredients),
    recipes: recipes.length ? recipes : structuredClone(initialState.recipes),
    stockMovements,
    cashTransactions,
    cashShifts: cashShifts.length ? cashShifts : [{
      id: "legacy-shift",
      openedAt: setting.shiftOpenedAt ?? new Date().toISOString(),
      openingBalance: Number(setting.shiftOpeningBalance ?? 500)
    }],
    shiftOpeningBalance: Number(setting.shiftOpeningBalance ?? 500),
    shiftOpenedAt: setting.shiftOpenedAt ?? new Date().toISOString(),
    nextOrderNumber: Number(setting.nextOrderNumber ?? 1001),
    nextPurchaseInvoiceNumber: Number(setting.nextPurchaseInvoiceNumber ?? 1),
    license: setting.appLicense
      ? { ...structuredClone(initialState.license), ...JSON.parse(setting.appLicense) }
      : structuredClone(initialState.license),
    settings: setting.restaurantSettings
      ? { ...structuredClone(initialState.settings), ...JSON.parse(setting.restaurantSettings) }
      : structuredClone(initialState.settings)
  };
}

export async function getStateRevision(): Promise<string | null> {
  if (!isTauri()) return localStorage.getItem(STATE_REVISION_KEY);
  const db = await initDatabase();
  const rows = await db.select<Array<{ value: string }>>("SELECT value FROM app_settings WHERE key = 'stateRevision'");
  return rows[0]?.value ?? null;
}

export async function saveState(state: AppState): Promise<string> {
  const revision = uid();
  if (!isTauri()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(STATE_REVISION_KEY, revision);
    return revision;
  }

  const db = await initDatabase();
  for (const product of state.products) {
    await db.execute(
      `INSERT INTO products (id,name,category,section,unit,price,cost,available,accent,options_json,image_data_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(id) DO UPDATE SET name=$2,category=$3,section=$4,unit=$5,price=$6,cost=$7,available=$8,accent=$9,options_json=$10,image_data_url=$11`,
      [product.id, product.name, product.category, product.section, product.unit, product.price, product.cost, product.available ? 1 : 0, product.accent, product.options?.length ? JSON.stringify(product.options) : null, product.imageDataUrl ?? null]
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
      `INSERT INTO orders (id,number,customer_id,customer_name,customer_phone,address,items_json,subtotal,delivery_fee,discount,total,payment_method,payment_status,stage,created_at,scheduled_for,note,driver,driver_id,settlement_id,inventory_deducted,source,shift_number,shift_id,return_reason,returned_at,payment_refunded)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
       ON CONFLICT(id) DO UPDATE SET customer_name=$4,customer_phone=$5,address=$6,items_json=$7,subtotal=$8,delivery_fee=$9,discount=$10,total=$11,payment_method=$12,payment_status=$13,stage=$14,scheduled_for=$16,note=$17,driver=$18,driver_id=$19,settlement_id=$20,inventory_deducted=$21,source=$22,shift_number=$23,shift_id=$24,return_reason=$25,returned_at=$26,payment_refunded=$27`,
      [order.id, order.number, order.customerId, order.customerName, order.customerPhone, order.address, JSON.stringify(order.items), order.subtotal, order.deliveryFee, order.discount, order.total, order.paymentMethod, order.paymentStatus, order.stage, order.createdAt, order.scheduledFor ?? null, order.note ?? null, order.driver ?? null, order.driverId ?? null, order.settlementId ?? null, order.inventoryDeducted ? 1 : 0, order.source ?? "pos", order.shiftNumber ?? null, order.shiftId ?? null, order.returnReason ?? null, order.returnedAt ?? null, order.paymentRefunded ? 1 : 0]
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
      `INSERT INTO driver_settlements (id,driver_id,driver_name,order_ids_json,gross_collected,delivery_fees,expenses,amount_received,difference,note,created_at,payment_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(id) DO NOTHING`,
      [settlement.id, settlement.driverId, settlement.driverName, JSON.stringify(settlement.orderIds), settlement.grossCollected, settlement.deliveryFees, settlement.expenses, settlement.amountReceived, settlement.difference, settlement.note ?? null, settlement.createdAt, settlement.paymentMethod ?? "cash"]
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
  for (const supplier of state.suppliers) {
    await db.execute(
      `INSERT INTO suppliers (id,name,phone,notes,active)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT(id) DO UPDATE SET name=$2,phone=$3,notes=$4,active=$5`,
      [supplier.id, supplier.name, supplier.phone, supplier.notes ?? null, supplier.active ? 1 : 0]
    );
  }
  for (const invoice of state.purchaseInvoices) {
    await db.execute(
      `INSERT INTO purchase_invoices (id,number,supplier_id,supplier_name,items_json,subtotal,discount,total,payment_method,payment_status,note,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(id) DO NOTHING`,
      [invoice.id, invoice.number, invoice.supplierId, invoice.supplierName, JSON.stringify(invoice.items), invoice.subtotal, invoice.discount, invoice.total, invoice.paymentMethod, invoice.paymentStatus, invoice.note ?? null, invoice.createdAt]
    );
  }
  for (const shift of state.cashShifts) {
    await db.execute(
      `INSERT INTO cash_shifts (id,opened_at,opening_balance,closed_at,expected_cash,actual_cash,difference,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO UPDATE SET closed_at=$4,expected_cash=$5,actual_cash=$6,difference=$7,note=$8`,
      [shift.id, shift.openedAt, shift.openingBalance, shift.closedAt ?? null, shift.expectedCash ?? null, shift.actualCash ?? null, shift.difference ?? null, shift.note ?? null]
    );
  }
  for (const [key, value] of Object.entries({
    shiftOpeningBalance: String(state.shiftOpeningBalance),
    shiftOpenedAt: state.shiftOpenedAt,
    nextOrderNumber: String(state.nextOrderNumber),
    nextPurchaseInvoiceNumber: String(state.nextPurchaseInvoiceNumber),
    menuSections: JSON.stringify(state.sections),
    menuMeals: JSON.stringify(state.meals),
    appLicense: JSON.stringify(state.license),
    restaurantSettings: JSON.stringify(state.settings),
    stateRevision: revision
  })) {
    await db.execute(
      "INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2",
      [key, value]
    );
  }
  return revision;
}
