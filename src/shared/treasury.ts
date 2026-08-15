import type { AppState, CashTransaction, Treasury } from "../domain/types";

export const DEFAULT_SALES_TREASURY_ID = "treasury-sales";
export const DEFAULT_PURCHASES_TREASURY_ID = "treasury-purchases";

const CREATED_AT = "2026-01-01T00:00:00.000Z";

export function createDefaultTreasuries(): Treasury[] {
  return [
    { id: DEFAULT_SALES_TREASURY_ID, name: "خزنة المبيعات", active: true, createdAt: CREATED_AT },
    { id: DEFAULT_PURCHASES_TREASURY_ID, name: "خزنة المشتريات", active: true, createdAt: CREATED_AT }
  ];
}

type TreasuryState = Pick<AppState, "treasuries" | "defaultSalesTreasuryId" | "defaultPurchasesTreasuryId">;

function validTreasuryId(state: TreasuryState, requested: string | undefined, fallback: string) {
  if (requested && state.treasuries.some((treasury) => treasury.id === requested && treasury.active)) return requested;
  if (state.treasuries.some((treasury) => treasury.id === fallback && treasury.active)) return fallback;
  return state.treasuries.find((treasury) => treasury.active)?.id ?? fallback;
}

export function salesTreasuryId(state: TreasuryState) {
  return validTreasuryId(state, state.defaultSalesTreasuryId, DEFAULT_SALES_TREASURY_ID);
}

export function purchasesTreasuryId(state: TreasuryState) {
  return validTreasuryId(state, state.defaultPurchasesTreasuryId, DEFAULT_PURCHASES_TREASURY_ID);
}

export function transactionTreasuryId(state: TreasuryState, transaction: Pick<CashTransaction, "type" | "treasuryId" | "orderId"> & { description?: string }) {
  if (transaction.treasuryId && state.treasuries.some((treasury) => treasury.id === transaction.treasuryId)) {
    return transaction.treasuryId;
  }
  // Older driver settlements were stored as expenses without an order reference.
  if (transaction.type === "expense" && transaction.description?.includes("تسوية المندوب")) {
    return salesTreasuryId(state);
  }
  return transaction.type === "expense" || (transaction.type === "withdrawal" && !transaction.orderId)
    ? purchasesTreasuryId(state)
    : salesTreasuryId(state);
}

export function treasuryName(state: TreasuryState, treasuryId: string | undefined) {
  const resolved = treasuryId ?? salesTreasuryId(state);
  return state.treasuries.find((treasury) => treasury.id === resolved)?.name ?? "خزنة غير معروفة";
}
