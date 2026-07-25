export type ProductSection = "cooked" | "fresh";
export type PaymentMethod = "cash" | "instapay" | "vodafone";
export type PaymentStatus = "paid" | "pending";
export type OrderStage =
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

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
  name: string;
  unit: string;
  price: number;
  quantity: number;
  note?: string;
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
  settlementId?: string;
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
  grossCollected: number;
  deliveryFees: number;
  expenses: number;
  amountReceived: number;
  difference: number;
  note?: string;
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

export interface AppState {
  products: Product[];
  customers: Customer[];
  orders: Order[];
  drivers: Driver[];
  driverSettlements: DriverSettlement[];
  cashTransactions: CashTransaction[];
  shiftOpeningBalance: number;
  shiftOpenedAt: string;
  nextOrderNumber: number;
}
