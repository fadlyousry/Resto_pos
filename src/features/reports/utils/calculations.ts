import type { AppState, OrderItem, PaymentMethod } from "../../../domain/types";
import { dateKey } from "../../../shared/format";
import { purchasesTreasuryId, salesTreasuryId, transactionTreasuryId, treasuryName } from "../../../shared/treasury";
import type {
  CustomerReportData,
  DateRangeFilter,
  DeliveryReportData,
  DriverPerformanceMetric,
  InventoryReportData,
  MenuItemMetric,
  MenuReportData,
  ProfitLossReportData,
  SalesReportData,
  TreasuryReportData
} from "../types";
import { formatArabicDate, getPreviousComparisonRange, isDateInRange } from "./dateRanges";

export function getProductCost(productId: string, state: AppState): number {
  return state.products.find((p) => p.id === productId)?.cost ?? 0;
}

export function getItemCost(item: OrderItem, state: AppState): number {
  if (item.cost && item.cost > 0) return item.cost;
  if (item.mealComponents && item.mealComponents.length > 0) {
    return item.mealComponents.reduce(
      (sum, comp) => sum + getProductCost(comp.productId, state) * comp.quantity,
      0
    );
  }
  return getProductCost(item.productId, state);
}

// 1. Sales Report Calculation
export function computeSalesReport(state: AppState, filter: DateRangeFilter): SalesReportData {
  const periodOrders = state.orders.filter(
    (order) => isDateInRange(order.createdAt, filter.from, filter.to) && order.stage !== "returned"
  );

  const totalSales = periodOrders.reduce((sum, o) => sum + o.total, 0);
  const totalOrdersCount = periodOrders.length;
  const collectedAmount = periodOrders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((sum, o) => sum + o.total, 0);
  const pendingAmount = periodOrders
    .filter((o) => o.paymentStatus === "pending")
    .reduce((sum, o) => sum + o.total, 0);
  const totalDiscounts = periodOrders.reduce((sum, o) => sum + o.discount, 0);
  const totalDeliveryFees = periodOrders.reduce((sum, o) => sum + o.deliveryFee, 0);
  const avgOrderValue = totalOrdersCount > 0 ? totalSales / totalOrdersCount : 0;

  // Comparison with previous period
  const prevRange = getPreviousComparisonRange(filter);
  let previousPeriodSales = 0;
  let salesGrowthVsPrevious: number | null = null;

  if (prevRange) {
    const prevOrders = state.orders.filter(
      (order) => isDateInRange(order.createdAt, prevRange.from, prevRange.to) && order.stage !== "returned"
    );
    previousPeriodSales = prevOrders.reduce((sum, o) => sum + o.total, 0);
    if (previousPeriodSales > 0) {
      salesGrowthVsPrevious = ((totalSales - previousPeriodSales) / previousPeriodSales) * 100;
    }
  }

  // Payment method breakdown
  const methodBreakdown: Record<PaymentMethod, { amount: number; count: number; share: number }> = {
    cash: { amount: 0, count: 0, share: 0 },
    instapay: { amount: 0, count: 0, share: 0 },
    vodafone: { amount: 0, count: 0, share: 0 }
  };

  for (const order of periodOrders) {
    const m = order.paymentMethod as PaymentMethod;
    if (methodBreakdown[m]) {
      methodBreakdown[m].amount += order.total;
      methodBreakdown[m].count += 1;
    }
  }
  for (const m of ["cash", "instapay", "vodafone"] as PaymentMethod[]) {
    methodBreakdown[m].share = totalSales > 0 ? (methodBreakdown[m].amount / totalSales) * 100 : 0;
  }

  // Channel breakdown
  const deliveryOrders = periodOrders.filter((o) => Boolean(o.driverId || o.deliveryFee > 0));
  const posOrders = periodOrders.filter((o) => !o.driverId && (!o.deliveryFee || o.deliveryFee === 0));

  const deliverySales = deliveryOrders.reduce((sum, o) => sum + o.total, 0);
  const posSales = posOrders.reduce((sum, o) => sum + o.total, 0);

  const channelBreakdown = {
    pos: {
      amount: posSales,
      count: posOrders.length,
      share: totalSales > 0 ? (posSales / totalSales) * 100 : 0
    },
    delivery: {
      amount: deliverySales,
      count: deliveryOrders.length,
      share: totalSales > 0 ? (deliverySales / totalSales) * 100 : 0
    }
  };

  // Daily timeline aggregation
  const dailyMap = new Map<string, { sales: number; count: number; collected: number }>();
  for (const order of periodOrders) {
    const key = dateKey(order.createdAt);
    const curr = dailyMap.get(key) ?? { sales: 0, count: 0, collected: 0 };
    curr.sales += order.total;
    curr.count += 1;
    if (order.paymentStatus === "paid") {
      curr.collected += order.total;
    }
    dailyMap.set(key, curr);
  }

  const dailyTimeline = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateK, val]) => ({
      dateKey: dateK,
      displayDate: formatArabicDate(dateK),
      sales: val.sales,
      ordersCount: val.count,
      collected: val.collected
    }));

  // Hourly peak times analysis
  const hourMap = new Map<number, { ordersCount: number; salesAmount: number }>();
  for (let h = 0; h < 24; h++) {
    hourMap.set(h, { ordersCount: 0, salesAmount: 0 });
  }

  for (const order of periodOrders) {
    try {
      const orderHour = new Date(order.createdAt).getHours();
      const curr = hourMap.get(orderHour) ?? { ordersCount: 0, salesAmount: 0 };
      curr.ordersCount += 1;
      curr.salesAmount += order.total;
      hourMap.set(orderHour, curr);
    } catch {
      // Ignore timestamp parsing error
    }
  }

  const formatHourLabel = (h: number) => {
    const period = h >= 12 ? "م" : "ص";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:00 ${period}`;
  };

  const hourlyPeakTimes = [...hourMap.entries()]
    .map(([hour, val]) => ({
      hour,
      hourLabel: formatHourLabel(hour),
      ordersCount: val.ordersCount,
      salesAmount: val.salesAmount,
      share: totalSales > 0 ? (val.salesAmount / totalSales) * 100 : 0
    }))
    .sort((a, b) => a.hour - b.hour);

  return {
    totalSales,
    totalOrdersCount,
    collectedAmount,
    pendingAmount,
    totalDiscounts,
    totalDeliveryFees,
    avgOrderValue,
    salesGrowthVsPrevious,
    previousPeriodSales,
    methodBreakdown,
    channelBreakdown,
    dailyTimeline,
    hourlyPeakTimes
  };
}

// 2. Menu Performance & Top Items Calculation
export function computeMenuReport(state: AppState, filter: DateRangeFilter): MenuReportData {
  const periodOrders = state.orders.filter(
    (order) => isDateInRange(order.createdAt, filter.from, filter.to) && order.stage !== "returned"
  );

  const totalItemSalesAmount = periodOrders
    .flatMap((o) => o.items)
    .reduce((sum, item) => sum + item.price * item.quantity, 0);

  const itemMap = new Map<string, MenuItemMetric>();

  for (const order of periodOrders) {
    for (const item of order.items) {
      const key = item.optionName ? `${item.name} (${item.optionName})` : item.name;
      const unitCost = getItemCost(item, state);
      const lineCost = unitCost * item.quantity;
      const lineRevenue = item.price * item.quantity;
      const lineProfit = lineRevenue - lineCost;

      const curr = itemMap.get(key) ?? {
        name: key,
        section: item.section ?? "الأطباق",
        category: "عام",
        quantitySold: 0,
        totalRevenue: 0,
        unitPrice: item.price,
        unitCost,
        totalCost: 0,
        totalProfit: 0,
        profitMarginPercent: 0,
        shareOfSales: 0
      };

      curr.quantitySold += item.quantity;
      curr.totalRevenue += lineRevenue;
      curr.totalCost += lineCost;
      curr.totalProfit += lineProfit;

      itemMap.set(key, curr);
    }
  }

  // Calculate profit margin % and share for each item
  const allItems: MenuItemMetric[] = [...itemMap.values()].map((metric) => ({
    ...metric,
    profitMarginPercent:
      metric.totalRevenue > 0 ? (metric.totalProfit / metric.totalRevenue) * 100 : 0,
    shareOfSales:
      totalItemSalesAmount > 0 ? (metric.totalRevenue / totalItemSalesAmount) * 100 : 0
  }));

  const topSellingByVolume = [...allItems].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 10);
  const topRevenueGenerators = [...allItems].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10);
  const slowMovingItems = [...allItems].sort((a, b) => a.quantitySold - b.quantitySold).slice(0, 5);

  // Section Performance
  const sectionMap = new Map<string, { quantity: number; revenue: number }>();
  for (const item of allItems) {
    const sec = item.section;
    const curr = sectionMap.get(sec) ?? { quantity: 0, revenue: 0 };
    curr.quantity += item.quantitySold;
    curr.revenue += item.totalRevenue;
    sectionMap.set(sec, curr);
  }

  const sectionPerformance = [...sectionMap.entries()].map(([secId, val]) => {
    const foundSec = state.sections.find((s) => s.id === secId);
    return {
      sectionId: secId,
      sectionName: foundSec?.name ?? secId,
      quantity: val.quantity,
      revenue: val.revenue,
      share: totalItemSalesAmount > 0 ? (val.revenue / totalItemSalesAmount) * 100 : 0
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // Category Performance
  const categoryMap = new Map<string, { quantity: number; revenue: number }>();
  for (const item of allItems) {
    const cat = item.category;
    const curr = categoryMap.get(cat) ?? { quantity: 0, revenue: 0 };
    curr.quantity += item.quantitySold;
    curr.revenue += item.totalRevenue;
    categoryMap.set(cat, curr);
  }

  const categoryPerformance = [...categoryMap.entries()].map(([catName, val]) => ({
    categoryName: catName,
    quantity: val.quantity,
    revenue: val.revenue,
    share: totalItemSalesAmount > 0 ? (val.revenue / totalItemSalesAmount) * 100 : 0
  })).sort((a, b) => b.revenue - a.revenue);

  return {
    topSellingByVolume,
    topRevenueGenerators,
    slowMovingItems,
    sectionPerformance,
    categoryPerformance
  };
}

// 3. Profit & Loss (P&L) Calculation
export function computeProfitLossReport(state: AppState, filter: DateRangeFilter): ProfitLossReportData {
  const periodOrders = state.orders.filter(
    (order) => isDateInRange(order.createdAt, filter.from, filter.to) && order.stage !== "returned"
  );

  const totalRevenue = periodOrders.reduce((sum, o) => sum + o.total, 0);

  // Cost of goods sold (COGS) based on recipe / items sold
  const costOfGoodsSold = periodOrders
    .flatMap((o) => o.items)
    .reduce((sum, item) => sum + getItemCost(item, state) * item.quantity, 0);

  const grossProfit = totalRevenue - costOfGoodsSold;
  const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Operational Expenses
  const periodExpenses = state.cashTransactions.filter(
    (t) => isDateInRange(t.createdAt, filter.from, filter.to) && t.type === "expense"
  );
  const operationalExpenses = periodExpenses.reduce((sum, t) => sum + t.amount, 0);

  const netProfit = grossProfit - operationalExpenses;
  const netMarginPercent = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Purchases Invoices
  const periodPurchases = state.purchaseInvoices.filter(
    (inv) => isDateInRange(inv.createdAt, filter.from, filter.to)
  );
  const totalPurchasesInvoices = periodPurchases.length;
  const totalPurchasesCost = periodPurchases.reduce((sum, inv) => sum + inv.total, 0);

  // Group Expenses by category/description
  const expenseCatMap = new Map<string, { amount: number; count: number }>();
  for (const exp of periodExpenses) {
    const desc = exp.description || "مصروفات عامة";
    const curr = expenseCatMap.get(desc) ?? { amount: 0, count: 0 };
    curr.amount += exp.amount;
    curr.count += 1;
    expenseCatMap.set(desc, curr);
  }

  const expensesByCategory = [...expenseCatMap.entries()].map(([cat, val]) => ({
    category: cat,
    amount: val.amount,
    count: val.count,
    share: operationalExpenses > 0 ? (val.amount / operationalExpenses) * 100 : 0
  })).sort((a, b) => b.amount - a.amount);

  const expenseItems = periodExpenses.map((t) => ({
    id: t.id,
    description: t.description,
    amount: t.amount,
    method: t.method,
    treasuryName: treasuryName(state, transactionTreasuryId(state, t)),
    date: formatArabicDate(dateKey(t.createdAt))
  })).sort((a, b) => b.amount - a.amount);

  return {
    totalRevenue,
    costOfGoodsSold,
    grossProfit,
    grossMarginPercent,
    operationalExpenses,
    netProfit,
    netMarginPercent,
    totalPurchasesInvoices,
    totalPurchasesCost,
    expensesByCategory,
    expenseItems
  };
}

// 4. Cash & Treasury Report Calculation
export function computeTreasuryReport(state: AppState, filter: DateRangeFilter): TreasuryReportData {
  const salesTrId = salesTreasuryId(state);
  const purchasesTrId = purchasesTreasuryId(state);

  const periodTransactions = state.cashTransactions.filter((t) =>
    isDateInRange(t.createdAt, filter.from, filter.to)
  );

  const totalInflow = periodTransactions
    .filter((t) => t.direction === "in")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalOutflow = periodTransactions
    .filter((t) => t.direction === "out")
    .reduce((sum, t) => sum + t.amount, 0);
  const netMovement = totalInflow - totalOutflow;

  // Calculate actual current balances per treasury
  const treasuryBalances = state.treasuries.map((treasury) => {
    const firstShift = [...state.cashShifts]
      .filter((s) => (s.treasuryId ?? salesTrId) === treasury.id && (!filter.to || dateKey(s.openedAt) <= filter.to))
      .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime())[0];
    const opening = firstShift?.openingBalance ?? 0;

    const movement = state.cashTransactions
      .filter(
        (t) =>
          (!filter.to || dateKey(t.createdAt) <= filter.to) &&
          transactionTreasuryId(state, t) === treasury.id
      )
      .reduce((sum, t) => sum + (t.direction === "in" ? t.amount : -t.amount), 0);

    return {
      id: treasury.id,
      name: treasury.name,
      balance: opening + movement,
      active: treasury.active,
      isSalesDefault: treasury.id === salesTrId,
      isPurchasesDefault: treasury.id === purchasesTrId
    };
  });

  const totalSafeBalance = treasuryBalances.reduce((sum, t) => sum + t.balance, 0);

  // Shift audit analysis
  const periodShifts = state.cashShifts.filter((s) =>
    isDateInRange(s.openedAt, filter.from, filter.to)
  );

  const returnedOrderIds = new Set(
    state.orders.filter((order) => order.stage === "returned").map((order) => order.id)
  );
  const refundedOriginalPaymentOrderIds = new Set(
    state.orders.filter((order) => order.paymentRefunded).map((order) => order.id)
  );

  const shifts = periodShifts.map((shift) => {
    const openedAtTime = new Date(shift.openedAt).getTime();
    const closedAtTime = shift.closedAt ? new Date(shift.closedAt).getTime() : Number.POSITIVE_INFINITY;

    const shiftTxns = state.cashTransactions.filter((t) => {
      const time = new Date(t.createdAt).getTime();
      return (
        time >= openedAtTime &&
        time <= closedAtTime &&
        transactionTreasuryId(state, t) === (shift.treasuryId ?? salesTrId)
      );
    });

    const income = shiftTxns
      .filter(
        (t) =>
          t.direction === "in" &&
          (t.type === "sale" || t.type === "collection" || (t.type === "deposit" && t.orderId)) &&
          (!t.orderId || !returnedOrderIds.has(t.orderId)) &&
          (t.type !== "sale" || !t.orderId || !refundedOriginalPaymentOrderIds.has(t.orderId))
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const editOutflow = shiftTxns
      .filter(
        (t) =>
          t.direction === "out" &&
          t.type === "withdrawal" &&
          t.orderId &&
          !returnedOrderIds.has(t.orderId)
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const revenue = income - editOutflow;
    const expenses = shiftTxns
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      id: shift.id,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      openingBalance: shift.openingBalance,
      expectedCash: shift.expectedCash,
      actualCash: shift.actualCash,
      difference: shift.difference,
      revenue,
      expenses,
      net: revenue - expenses,
      transactionsCount: shiftTxns.length,
      treasuryName: treasuryName(state, shift.treasuryId ?? salesTrId),
      note: shift.note
    };
  });

  return {
    treasuryBalances,
    totalSafeBalance,
    totalInflow,
    totalOutflow,
    netMovement,
    shifts
  };
}

// 5. Inventory & Consumption Calculation
export function computeInventoryReport(state: AppState, filter: DateRangeFilter): InventoryReportData {
  const periodStockMovements = state.stockMovements.filter((m) =>
    isDateInRange(m.createdAt, filter.from, filter.to)
  );

  // Total current stock valuation
  const totalStockValuation = state.ingredients.reduce(
    (sum, ing) => sum + ing.stockQty * ing.unitCost,
    0
  );

  // Group consumed ingredients
  const consumeMap = new Map<string, { quantity: number; cost: number }>();
  for (const m of periodStockMovements.filter((item) => item.type === "consume")) {
    const curr = consumeMap.get(m.ingredientId) ?? { quantity: 0, cost: 0 };
    curr.quantity += m.quantity;
    curr.cost += m.quantity * m.unitCost;
    consumeMap.set(m.ingredientId, curr);
  }

  const consumedIngredients = [...consumeMap.entries()].map(([ingId, val]) => {
    const ingredient = state.ingredients.find((ing) => ing.id === ingId);
    const currentStock = ingredient?.stockQty ?? 0;
    const minStock = ingredient?.minStock ?? 0;
    return {
      id: ingId,
      name: ingredient?.name ?? "مكون",
      unit: ingredient?.unit ?? "وحدة",
      quantityConsumed: val.quantity,
      totalCost: val.cost,
      currentStock,
      minStock,
      isLowStock: currentStock <= minStock
    };
  }).sort((a, b) => b.totalCost - a.totalCost);

  // Waste and Adjustments
  const wasteMovements = periodStockMovements.filter(
    (m) => m.type === "waste" || m.type === "adjustment"
  );
  const wasteAndAdjustments = wasteMovements.map((m) => ({
    id: m.id,
    ingredientName: m.ingredientName,
    type: m.type as "waste" | "adjustment",
    quantity: m.quantity,
    cost: m.quantity * m.unitCost,
    description: m.description,
    date: formatArabicDate(dateKey(m.createdAt))
  }));

  const totalWasteCost = wasteAndAdjustments
    .filter((w) => w.type === "waste")
    .reduce((sum, w) => sum + w.cost, 0);

  const lowStockCount = state.ingredients.filter(
    (ing) => ing.active && ing.stockQty <= ing.minStock
  ).length;

  return {
    totalStockValuation,
    consumedIngredients,
    wasteAndAdjustments,
    totalWasteCost,
    lowStockCount
  };
}

// 6. Delivery & Drivers Calculation
export function computeDeliveryReport(state: AppState, filter: DateRangeFilter): DeliveryReportData {
  const periodDeliveryOrders = state.orders.filter(
    (order) =>
      isDateInRange(order.createdAt, filter.from, filter.to) &&
      Boolean(order.driverId || order.deliveryFee > 0)
  );

  const totalDeliveryOrders = periodDeliveryOrders.length;
  const deliveredOrders = periodDeliveryOrders.filter((o) => o.stage === "delivered").length;
  const returnedOrders = periodDeliveryOrders.filter((o) => o.stage === "returned").length;
  const deliverySuccessRate =
    totalDeliveryOrders > 0 ? (deliveredOrders / totalDeliveryOrders) * 100 : 0;

  const totalDeliveryFeesCollected = periodDeliveryOrders
    .filter((o) => o.stage !== "returned")
    .reduce((sum, o) => sum + o.deliveryFee, 0);

  const periodSettlements = state.driverSettlements.filter((s) =>
    isDateInRange(s.createdAt, filter.from, filter.to)
  );
  const totalDriverCollections = periodSettlements.reduce((sum, s) => sum + s.amountReceived, 0);

  const pendingWithDrivers = periodDeliveryOrders
    .filter((o) => o.stage !== "returned" && o.paymentStatus === "pending")
    .reduce((sum, o) => sum + o.total, 0);

  // Driver metrics
  const driversMetrics: DriverPerformanceMetric[] = state.drivers.map((driver) => {
    const driverDelivered = periodDeliveryOrders.filter(
      (o) => o.driverId === driver.id && o.stage === "delivered"
    );
    const driverFees = driverDelivered.reduce((sum, o) => sum + o.deliveryFee, 0);
    const driverCollected = driverDelivered
      .filter((o) => o.paymentStatus === "paid")
      .reduce((sum, o) => sum + o.total, 0);

    const driverSettlements = periodSettlements.filter((s) => s.driverId === driver.id);
    const settledAmount = driverSettlements.reduce((sum, s) => sum + s.amountReceived, 0);
    const differencesSum = driverSettlements.reduce((sum, s) => sum + s.difference, 0);

    return {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      deliveredOrdersCount: driverDelivered.length,
      totalSalesCollected: driverCollected,
      totalDeliveryFees: driverFees,
      settlementsCount: driverSettlements.length,
      settledAmount,
      differencesSum
    };
  }).sort((a, b) => b.deliveredOrdersCount - a.deliveredOrdersCount);

  return {
    totalDeliveryOrders,
    deliveredOrders,
    returnedOrders,
    deliverySuccessRate,
    totalDeliveryFeesCollected,
    totalDriverCollections,
    pendingWithDrivers,
    driversMetrics
  };
}

// 7. Customer Insights Calculation
export function computeCustomerReport(state: AppState, filter: DateRangeFilter): CustomerReportData {
  const periodOrders = state.orders.filter(
    (order) => isDateInRange(order.createdAt, filter.from, filter.to) && order.stage !== "returned"
  );

  const totalCustomersCount = state.customers.length;
  const activeCustomerIds = new Set(periodOrders.map((o) => o.customerId));
  const activeCustomersCount = activeCustomerIds.size;

  const totalSpentInPeriod = periodOrders.reduce((sum, o) => sum + o.total, 0);
  const avgCustomerSpend = activeCustomersCount > 0 ? totalSpentInPeriod / activeCustomersCount : 0;

  // Aggregate customer spend in period
  const customerMap = new Map<string, { count: number; spent: number; lastDate: string }>();
  for (const order of periodOrders) {
    const cid = order.customerId;
    const curr = customerMap.get(cid) ?? { count: 0, spent: 0, lastDate: order.createdAt };
    curr.count += 1;
    curr.spent += order.total;
    if (new Date(order.createdAt) > new Date(curr.lastDate)) {
      curr.lastDate = order.createdAt;
    }
    customerMap.set(cid, curr);
  }

  const topCustomers = [...customerMap.entries()]
    .map(([cid, val]) => {
      const customer = state.customers.find((c) => c.id === cid);
      return {
        id: cid,
        name: customer?.name ?? "عميل",
        phone: customer?.phone ?? "",
        address: customer?.address ?? "",
        zone: customer?.zone ?? "",
        periodOrdersCount: val.count,
        periodTotalSpent: val.spent,
        lifetimeOrdersCount: customer?.ordersCount ?? val.count,
        lifetimeTotalSpent: customer?.totalSpent ?? val.spent,
        lastOrderDate: formatArabicDate(dateKey(val.lastDate))
      };
    })
    .sort((a, b) => b.periodTotalSpent - a.periodTotalSpent)
    .slice(0, 15);

  // Top Delivery Zones
  const zoneMap = new Map<string, { count: number; sales: number }>();
  for (const order of periodOrders) {
    const cust = state.customers.find((c) => c.id === order.customerId);
    const zoneName = cust?.zone?.trim() || "غير محدد";
    const curr = zoneMap.get(zoneName) ?? { count: 0, sales: 0 };
    curr.count += 1;
    curr.sales += order.total;
    zoneMap.set(zoneName, curr);
  }

  const topZones = [...zoneMap.entries()]
    .map(([z, val]) => ({
      zone: z,
      ordersCount: val.count,
      salesAmount: val.sales,
      share: totalSpentInPeriod > 0 ? (val.sales / totalSpentInPeriod) * 100 : 0
    }))
    .sort((a, b) => b.salesAmount - a.salesAmount);

  return {
    totalCustomersCount,
    activeCustomersCount,
    avgCustomerSpend,
    topCustomers,
    topZones
  };
}
