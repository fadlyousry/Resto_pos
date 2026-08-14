// Shared domain models. Keep these types independent from React and storage.
export type ProductSection = string;
export type PaymentMethod = "cash" | "instapay" | "vodafone";
export type PaymentStatus = "paid" | "pending";
export type OrderStage = "preparing" | "ready" | "delivered" | "returned";

export interface ProductOption {
  id: string;
  name: string;
  unit: string;
  price: number;
  cost: number;
  recipeMultiplier: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  section: ProductSection;
  unit: string;
  price: number;
  cost: number;
  available: boolean;
  accent: string;
  imageDataUrl?: string;
  options?: ProductOption[];
}

export interface ProductCategory {
  id: string;
  name: string;
  section: ProductSection;
  color: string;
  active: boolean;
}

export interface MenuSection {
  id: ProductSection;
  name: string;
}

export interface MealComponent {
  productId: string;
  name: string;
  quantity: number;
}

export interface Meal {
  id: string;
  name: string;
  price: number;
  available: boolean;
  components: MealComponent[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  zone: string;
  notes?: string;
  ordersCount: number;
  totalSpent: number;
  lastOrder?: string;
}

export interface OrderItem {
  productId: string;
  mealId?: string;
  mealComponents?: MealComponent[];
  optionId?: string;
  optionName?: string;
  recipeMultiplier?: number;
  name: string;
  unit: string;
  price: number;
  cost?: number;
  quantity: number;
  note?: string;
  section?: ProductSection;
}

export interface Order {
  id: string;
  /** Global, never-reset order sequence used internally and in reports. */
  number: number;
  /** Customer-facing number that starts at 1001 for every cash shift. */
  shiftNumber?: number;
  shiftId?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  address: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  stage: OrderStage;
  createdAt: string;
  scheduledFor?: string;
  note?: string;
  driverId?: string;
  driver?: string;
  settlementId?: string;
  returnReason?: string;
  returnedAt?: string;
  paymentRefunded?: boolean;
  inventoryDeducted?: boolean;
  source?: "pos" | "online";
}

export type LicenseType = "trial" | "subscription" | "lifetime";
export type LicenseStatus = "active" | "expired" | "unlicensed";

export interface LicenseInfo {
  machineId: string;
  licenseKey?: string;
  type: LicenseType;
  status: LicenseStatus;
  activatedAt?: string;
  expiresAt?: string | null;
  registeredTo?: string;
}

export interface RestaurantSettings {
  restaurantName: string;
  subtitle: string;
  phone: string;
  address: string;
  invoiceFooter: string;
  logoDataUrl?: string;
  printCustomerReceipt: boolean;
  printKitchenReceipt: boolean;
  customerReceiptPrinter: string;
  kitchenReceiptPrinter: string;
  defaultDeliveryFee: number;
  kitchenWarningMinutes: number;
  kitchenLateMinutes: number;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  vehicle?: string;
  createdAt: string;
}

export interface DriverSettlement {
  id: string;
  driverId: string;
  driverName: string;
  orderIds: string[];
  paymentMethod: PaymentMethod;
  grossCollected: number;
  deliveryFees: number;
  expenses: number;
  amountReceived: number;
  difference: number;
  note?: string;
  createdAt: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stockQty: number;
  minStock: number;
  unitCost: number;
  active: boolean;
}

export interface RecipeItem {
  id: string;
  productId: string;
  ingredientId: string;
  quantity: number;
}

export interface StockMovement {
  id: string;
  ingredientId: string;
  ingredientName: string;
  type: "purchase" | "consume" | "adjustment" | "waste";
  quantity: number;
  unitCost: number;
  description: string;
  orderId?: string;
  createdAt: string;
}

export interface CashTransaction {
  id: string;
  type: "sale" | "collection" | "expense" | "deposit" | "withdrawal";
  method: PaymentMethod | "cash";
  amount: number;
  direction: "in" | "out";
  description: string;
  orderId?: string;
  createdAt: string;
}

export interface CashShift {
  id: string;
  openedAt: string;
  openingBalance: number;
  closedAt?: string;
  expectedCash?: number;
  actualCash?: number;
  difference?: number;
  note?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  notes?: string;
  active: boolean;
}

export interface PurchaseInvoiceItem {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unitCost: number;
  unit: string;
  total: number;
}

export interface PurchaseInvoice {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  items: PurchaseInvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  note?: string;
  createdAt: string;
}

export interface AppState {
  products: Product[];
  sections: MenuSection[];
  meals: Meal[];
  categories: ProductCategory[];
  customers: Customer[];
  orders: Order[];
  drivers: Driver[];
  driverSettlements: DriverSettlement[];
  ingredients: Ingredient[];
  recipes: RecipeItem[];
  stockMovements: StockMovement[];
  cashTransactions: CashTransaction[];
  cashShifts: CashShift[];
  suppliers: Supplier[];
  purchaseInvoices: PurchaseInvoice[];
  shiftOpeningBalance: number;
  shiftOpenedAt: string;
  nextOrderNumber: number;
  nextPurchaseInvoiceNumber: number;
  license: LicenseInfo;
  settings: RestaurantSettings;
}
