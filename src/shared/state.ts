import type { AppState, CashShift, Customer, MenuSection, Order, OrderStage } from "../domain/types";
import {
  createDefaultTreasuries, DEFAULT_PURCHASES_TREASURY_ID, DEFAULT_SALES_TREASURY_ID,
  purchasesTreasuryId, salesTreasuryId, transactionTreasuryId
} from "./treasury";

const isArray = <T,>(value: T[] | undefined): value is T[] => Array.isArray(value);

function cleanCustomer(customer: Customer): Customer {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    zone: customer.zone,
    notes: customer.notes,
    ordersCount: customer.ordersCount,
    totalSpent: customer.totalSpent,
    lastOrder: customer.lastOrder
  };
}

export function normalizeOrderStage(stage: unknown): OrderStage {
  if (stage === "returned") return "returned";
  if (stage === "delivered" || stage === "cancelled") return "delivered";
  if (stage === "ready" || stage === "out_for_delivery" || stage === "assembling" || stage === "packing") return "ready";
  return "preparing";
}

function cleanOrder(order: Order): Order {
  return {
    id: order.id,
    number: order.number,
    shiftNumber: order.shiftNumber,
    shiftId: order.shiftId,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    address: order.address,
    customerNotes: order.customerNotes,
    items: order.items.map((item) => {
      const { packed: _packed, ...cleanItem } = item as typeof item & { packed?: boolean };
      return cleanItem;
    }),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    discount: order.discount,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    stage: normalizeOrderStage(order.stage),
    createdAt: order.createdAt,
    scheduledFor: order.scheduledFor,
    note: order.note,
    driverId: order.driverId,
    driver: order.driver,
    settlementId: order.settlementId,
    returnReason: order.returnReason,
    returnedAt: order.returnedAt,
    paymentRefunded: order.paymentRefunded,
    inventoryDeducted: order.inventoryDeducted,
    source: order.source,
    treasuryId: order.treasuryId
  };
}

function attachLegacyOrdersToShifts(orders: Order[], shifts: CashShift[]) {
  const counters = new Map<string, number>();
  for (const order of orders) {
    if (order.shiftId && order.shiftNumber) {
      counters.set(order.shiftId, Math.max(counters.get(order.shiftId) ?? 100, order.shiftNumber));
    }
  }
  return [...orders]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .map((order) => {
      if (order.shiftId && order.shiftNumber) return order;
      const createdAt = new Date(order.createdAt).getTime();
      const shift = shifts.find((item) => {
        const openedAt = new Date(item.openedAt).getTime();
        const closedAt = item.closedAt ? new Date(item.closedAt).getTime() : Number.POSITIVE_INFINITY;
        return createdAt >= openedAt && createdAt <= closedAt;
      });
      if (!shift) return order;
      const shiftNumber = (counters.get(shift.id) ?? 100) + 1;
      counters.set(shift.id, shiftNumber);
      return { ...order, shiftId: shift.id, shiftNumber };
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function normalizeAppState(parsed: Partial<AppState>, fallback: AppState): AppState {
  const products = isArray(parsed.products) ? parsed.products : fallback.products;
  const derivedSections: MenuSection[] = [...new Set(products.map((product) => product.section))].map((id) => ({
    id,
    name: id === "cooked" ? "مطبوخ" : id === "fresh" ? "طازة / غير مطبوخ" : id
  }));
  const sections = isArray(parsed.sections) && parsed.sections.length
    ? parsed.sections
    : isArray(fallback.sections) && fallback.sections.length
      ? fallback.sections
      : derivedSections;
  const treasuries = isArray(parsed.treasuries) && parsed.treasuries.length
    ? parsed.treasuries
    : createDefaultTreasuries();
  const treasuryDefaults = {
    treasuries,
    defaultSalesTreasuryId: typeof parsed.defaultSalesTreasuryId === "string"
      ? parsed.defaultSalesTreasuryId
      : DEFAULT_SALES_TREASURY_ID,
    defaultPurchasesTreasuryId: typeof parsed.defaultPurchasesTreasuryId === "string"
      ? parsed.defaultPurchasesTreasuryId
      : DEFAULT_PURCHASES_TREASURY_ID
  };
  const resolvedSalesTreasuryId = salesTreasuryId(treasuryDefaults);
  const resolvedPurchasesTreasuryId = purchasesTreasuryId(treasuryDefaults);
  const cashShifts = (isArray(parsed.cashShifts)
    ? parsed.cashShifts
    : [{
      id: "legacy-shift",
      openedAt: typeof parsed.shiftOpenedAt === "string" ? parsed.shiftOpenedAt : fallback.shiftOpenedAt,
      openingBalance: typeof parsed.shiftOpeningBalance === "number" ? parsed.shiftOpeningBalance : fallback.shiftOpeningBalance
    }]).map((shift) => ({ ...shift, treasuryId: shift.treasuryId ?? resolvedSalesTreasuryId }));
  const orders = attachLegacyOrdersToShifts(
    (isArray(parsed.orders) ? parsed.orders.map(cleanOrder) : fallback.orders)
      .map((order) => ({ ...order, treasuryId: order.treasuryId ?? resolvedSalesTreasuryId })),
    cashShifts
  );
  return {
    products,
    sections,
    meals: isArray(parsed.meals) ? parsed.meals : (isArray(fallback.meals) ? fallback.meals : []),
    savedChoiceGroups: isArray(parsed.savedChoiceGroups) ? parsed.savedChoiceGroups : (isArray(fallback.savedChoiceGroups) ? fallback.savedChoiceGroups : []),
    categories: isArray(parsed.categories) ? parsed.categories : fallback.categories,
    customers: isArray(parsed.customers) ? parsed.customers.map(cleanCustomer) : fallback.customers,
    orders,
    drivers: isArray(parsed.drivers) ? parsed.drivers : fallback.drivers,
    driverSettlements: isArray(parsed.driverSettlements) ? parsed.driverSettlements : fallback.driverSettlements,
    ingredients: isArray(parsed.ingredients) ? parsed.ingredients : fallback.ingredients,
    recipes: isArray(parsed.recipes) ? parsed.recipes : fallback.recipes,
    stockMovements: isArray(parsed.stockMovements) ? parsed.stockMovements : fallback.stockMovements,
    cashTransactions: (isArray(parsed.cashTransactions) ? parsed.cashTransactions : fallback.cashTransactions)
      .map((transaction) => ({
        ...transaction,
        treasuryId: transactionTreasuryId(treasuryDefaults, transaction)
      })),
    cashShifts,
    treasuries,
    defaultSalesTreasuryId: resolvedSalesTreasuryId,
    defaultPurchasesTreasuryId: resolvedPurchasesTreasuryId,
    suppliers: isArray(parsed.suppliers) ? parsed.suppliers : fallback.suppliers,
    purchaseInvoices: (isArray(parsed.purchaseInvoices) ? parsed.purchaseInvoices : fallback.purchaseInvoices)
      .map((invoice) => ({ ...invoice, treasuryId: invoice.treasuryId ?? resolvedPurchasesTreasuryId })),
    shiftOpeningBalance: typeof parsed.shiftOpeningBalance === "number" ? parsed.shiftOpeningBalance : fallback.shiftOpeningBalance,
    shiftOpenedAt: typeof parsed.shiftOpenedAt === "string" ? parsed.shiftOpenedAt : fallback.shiftOpenedAt,
    nextOrderNumber: typeof parsed.nextOrderNumber === "number" ? parsed.nextOrderNumber : fallback.nextOrderNumber,
    nextPurchaseInvoiceNumber: typeof parsed.nextPurchaseInvoiceNumber === "number" ? parsed.nextPurchaseInvoiceNumber : fallback.nextPurchaseInvoiceNumber,
    license: parsed.license && typeof parsed.license === "object"
      ? { ...fallback.license, ...parsed.license }
      : fallback.license,
    settings: parsed.settings && typeof parsed.settings === "object"
      ? { ...fallback.settings, ...parsed.settings }
      : fallback.settings
  };
}
