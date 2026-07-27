// Shared domain models. Keep these types independent from React and storage.
export type ProductSection = "cooked" | "fresh";
export type PaymentMethod = "cash" | "instapay" | "vodafone";
export type PaymentStatus = "paid" | "pending";
export type OrderStage = "preparing" | "assembling" | "ready" | "delivered";

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
  packed?: boolean;
}

export interface Order {
  id: string;
  number: number;
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
  deliveryCompanyId?: string;
  deliveryCompany?: string;
  settlementId?: string;
  inventoryDeducted?: boolean;
  source?: "pos" | "online";
}

export interface DeliveryCompany {
  id: string;
  name: string;
  phone?: string;
  baseFee: number;
  active: boolean;
  notes?: string;
}

export interface RestaurantSettings {
  restaurantName: string;
  subtitle: string;
  phone: string;
  address: string;
  invoiceFooter: string;
  logoDataUrl?: string;
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

export interface AppState {
  products: Product[];
  categories: ProductCategory[];
  customers: Customer[];
  orders: Order[];
  drivers: Driver[];
  deliveryCompanies: DeliveryCompany[];
  driverSettlements: DriverSettlement[];
  ingredients: Ingredient[];
  recipes: RecipeItem[];
  stockMovements: StockMovement[];
  cashTransactions: CashTransaction[];
  cashShifts: CashShift[];
  shiftOpeningBalance: number;
  shiftOpenedAt: string;
  nextOrderNumber: number;
  settings: RestaurantSettings;
}
