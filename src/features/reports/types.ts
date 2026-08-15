import type { PaymentMethod } from "../../domain/types";

export type ReportTab =
  | "sales"
  | "menu"
  | "profit_loss"
  | "treasury"
  | "inventory"
  | "delivery"
  | "customers";

export type ReportDatePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "this_month"
  | "last_month"
  | "all"
  | "custom";

export interface DateRangeFilter {
  preset: ReportDatePreset;
  from: string;
  to: string;
  label: string;
}

export interface SalesReportData {
  totalSales: number;
  totalOrdersCount: number;
  collectedAmount: number;
  pendingAmount: number;
  totalDiscounts: number;
  totalDeliveryFees: number;
  avgOrderValue: number;
  salesGrowthVsPrevious: number | null;
  previousPeriodSales: number;
  methodBreakdown: Record<PaymentMethod, { amount: number; count: number; share: number }>;
  channelBreakdown: {
    pos: { amount: number; count: number; share: number };
    delivery: { amount: number; count: number; share: number };
  };
  dailyTimeline: Array<{
    dateKey: string;
    displayDate: string;
    sales: number;
    ordersCount: number;
    collected: number;
  }>;
  hourlyPeakTimes: Array<{
    hour: number;
    hourLabel: string;
    ordersCount: number;
    salesAmount: number;
    share: number;
  }>;
}

export interface MenuItemMetric {
  name: string;
  section: string;
  category: string;
  quantitySold: number;
  totalRevenue: number;
  unitPrice: number;
  unitCost: number;
  totalCost: number;
  totalProfit: number;
  profitMarginPercent: number;
  shareOfSales: number;
}

export interface MenuReportData {
  topSellingByVolume: MenuItemMetric[];
  topRevenueGenerators: MenuItemMetric[];
  slowMovingItems: MenuItemMetric[];
  sectionPerformance: Array<{
    sectionId: string;
    sectionName: string;
    quantity: number;
    revenue: number;
    share: number;
  }>;
  categoryPerformance: Array<{
    categoryName: string;
    quantity: number;
    revenue: number;
    share: number;
  }>;
}

export interface ProfitLossReportData {
  totalRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossMarginPercent: number;
  operationalExpenses: number;
  netProfit: number;
  netMarginPercent: number;
  totalPurchasesInvoices: number;
  totalPurchasesCost: number;
  expensesByCategory: Array<{
    category: string;
    amount: number;
    count: number;
    share: number;
  }>;
  expenseItems: Array<{
    id: string;
    description: string;
    amount: number;
    method: string;
    treasuryName: string;
    date: string;
  }>;
}

export interface TreasuryReportData {
  treasuryBalances: Array<{
    id: string;
    name: string;
    balance: number;
    active: boolean;
    isSalesDefault: boolean;
    isPurchasesDefault: boolean;
  }>;
  totalSafeBalance: number;
  totalInflow: number;
  totalOutflow: number;
  netMovement: number;
  shifts: Array<{
    id: string;
    openedAt: string;
    closedAt?: string;
    openingBalance: number;
    expectedCash?: number;
    actualCash?: number;
    difference?: number;
    revenue: number;
    expenses: number;
    net: number;
    transactionsCount: number;
    treasuryName: string;
    note?: string;
  }>;
}

export interface InventoryReportData {
  totalStockValuation: number;
  consumedIngredients: Array<{
    id: string;
    name: string;
    unit: string;
    quantityConsumed: number;
    totalCost: number;
    currentStock: number;
    minStock: number;
    isLowStock: boolean;
  }>;
  wasteAndAdjustments: Array<{
    id: string;
    ingredientName: string;
    type: "waste" | "adjustment";
    quantity: number;
    cost: number;
    description: string;
    date: string;
  }>;
  totalWasteCost: number;
  lowStockCount: number;
}

export interface DriverPerformanceMetric {
  id: string;
  name: string;
  phone: string;
  deliveredOrdersCount: number;
  totalSalesCollected: number;
  totalDeliveryFees: number;
  settlementsCount: number;
  settledAmount: number;
  differencesSum: number;
}

export interface DeliveryReportData {
  totalDeliveryOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  deliverySuccessRate: number;
  totalDeliveryFeesCollected: number;
  totalDriverCollections: number;
  pendingWithDrivers: number;
  driversMetrics: DriverPerformanceMetric[];
}

export interface CustomerReportData {
  totalCustomersCount: number;
  activeCustomersCount: number;
  avgCustomerSpend: number;
  topCustomers: Array<{
    id: string;
    name: string;
    phone: string;
    address: string;
    zone: string;
    periodOrdersCount: number;
    periodTotalSpent: number;
    lifetimeOrdersCount: number;
    lifetimeTotalSpent: number;
    lastOrderDate: string;
  }>;
  topZones: Array<{
    zone: string;
    ordersCount: number;
    salesAmount: number;
    share: number;
  }>;
}
