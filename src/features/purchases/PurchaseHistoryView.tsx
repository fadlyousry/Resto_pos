import { useState } from "react";
import {
  AlertTriangle, Boxes, Eye, FileText, History,
  Search, ShoppingBasket, Truck
} from "lucide-react";
import type { PurchaseInvoice } from "../../domain/types";
import type { ViewProps } from "../../shared/contracts";
import { dateKey, money, shortDate, todayKey } from "../../shared/format";
import { Empty, Modal, WorkspaceSectionHeader } from "../../shared/ui";

function weekAgoKey() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return dateKey(d);
}
function monthStartKey() {
  const d = new Date(); d.setDate(1);
  return dateKey(d);
}

export function PurchaseHistoryView({ state }: ViewProps) {
  const [search, setSearch] = useState("");
  const [dateScope, setDateScope] = useState<"today" | "week" | "month" | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending">("all");
  const [viewingInvoice, setViewingInvoice] = useState<PurchaseInvoice | null>(null);

  const today = todayKey();
  const weekAgo = weekAgoKey();
  const monthStart = monthStartKey();

  const invoices = state.purchaseInvoices.filter((inv) => {
    const dk = dateKey(inv.createdAt);
    if (dateScope === "today" && dk !== today) return false;
    if (dateScope === "week" && dk < weekAgo) return false;
    if (dateScope === "month" && dk < monthStart) return false;
    if (statusFilter !== "all" && inv.paymentStatus !== statusFilter) return false;
    if (
      search.trim() &&
      !inv.supplierName.toLowerCase().includes(search.trim().toLowerCase()) &&
      !String(inv.number).includes(search.trim())
    ) {
      return false;
    }
    return true;
  });

  const totals = {
    count: invoices.length,
    totalAmount: invoices.reduce((sum, i) => sum + i.total, 0),
    paidCount: invoices.filter((i) => i.paymentStatus === "paid").length,
    pendingCount: invoices.filter((i) => i.paymentStatus === "pending").length,
    pendingAmount: invoices.filter((i) => i.paymentStatus === "pending").reduce((sum, i) => sum + i.total, 0)
  };

  return (
    <div className="panel purchase-invoices-panel" style={{ background: "transparent", border: 0 }}>
      {/* Workspace Header */}
      <WorkspaceSectionHeader
        title="المشتريات السابقة"
        subtitle={`عرض وتتبع ${totals.count} فاتورة مشتريات مسجلة`}
      />

      {/* Stats Bar */}
      <div className="purchase-stats-bar" style={{ background: "#fff", borderRadius: "14px", border: "1px solid var(--line)", marginBottom: "18px" }}>
        <div className="purchase-stat">
          <FileText />
          <div>
            <small>إجمالي الفواتير</small>
            <strong>{totals.count} فاتورة</strong>
          </div>
        </div>
        <div className="purchase-stat total">
          <ShoppingBasket />
          <div>
            <small>إجمالي المشتريات</small>
            <strong>{money(totals.totalAmount)} ج.م</strong>
          </div>
        </div>
        <div className="purchase-stat success">
          <Boxes />
          <div>
            <small>الفواتير المدفوعة</small>
            <strong>{totals.paidCount} فاتورة</strong>
          </div>
        </div>
        <div className="purchase-stat warning">
          <AlertTriangle />
          <div>
            <small>معلقة / آجل ({totals.pendingCount})</small>
            <strong>{money(totals.pendingAmount)} ج.م</strong>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="inventory-toolbar" style={{ background: "#fff", padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--line)", marginBottom: "16px" }}>
        <label className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث برقم الفاتورة أو اسم المورد..."
          />
        </label>
        
        <div className="filter-tabs">
          <button className={dateScope === "all" ? "active" : ""} onClick={() => setDateScope("all")}>
            كل التواريخ
          </button>
          <button className={dateScope === "today" ? "active" : ""} onClick={() => setDateScope("today")}>
            اليوم
          </button>
          <button className={dateScope === "week" ? "active" : ""} onClick={() => setDateScope("week")}>
            هذا الأسبوع
          </button>
          <button className={dateScope === "month" ? "active" : ""} onClick={() => setDateScope("month")}>
            هذا الشهر
          </button>
        </div>

        <div className="filter-tabs">
          <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>
            الكل
          </button>
          <button className={statusFilter === "paid" ? "active" : ""} onClick={() => setStatusFilter("paid")}>
            مدفوعة
          </button>
          <button className={statusFilter === "pending" ? "active danger" : ""} onClick={() => setStatusFilter("pending")}>
            معلقة (آجل)
          </button>
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="purchase-invoice-table" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "14px" }}>
        <div className="purchase-invoice-row purchase-invoice-head">
          <span>#</span>
          <span>المورد</span>
          <span>التاريخ والوقت</span>
          <span>الأصناف</span>
          <span>طريقة الدفع</span>
          <span>الإجمالي</span>
          <span>حالة الدفع</span>
          <span style={{ textAlign: "center" }}>التفاصيل</span>
        </div>
        {invoices.map((inv) => (
          <div className="purchase-invoice-row" key={inv.id}>
            <span className="inv-number">#{inv.number}</span>
            <span className="inv-supplier">
              <Truck />
              <strong>{inv.supplierName}</strong>
            </span>
            <span className="inv-date">{shortDate(inv.createdAt)}</span>
            <span>{inv.items.length} خامات/مكونات</span>
            <span>{inv.paymentMethod === "cash" ? "نقدي" : inv.paymentMethod === "instapay" ? "إنستاباي" : "فودافون كاش"}</span>
            <span className="inv-total">
              <strong>{money(inv.total)} ج.م</strong>
            </span>
            <span>
              <em className={`purchase-status ${inv.paymentStatus}`}>
                {inv.paymentStatus === "paid" ? "مدفوعة" : "معلقة"}
              </em>
            </span>
            <span style={{ display: "flex", justifyContent: "center" }}>
              <button className="soft-button compact" onClick={() => setViewingInvoice(inv)}>
                <Eye size={14} /> عرض
              </button>
            </span>
          </div>
        ))}
        {!invoices.length && (
          <Empty
            icon={<History />}
            title="لا توجد فواتير مشتريات سابقة"
            text="لم يتم العثور على فواتير مشتريات تطابق البحث المحدد"
          />
        )}
      </div>

      {/* MODAL: VIEW INVOICE DETAILS */}
      {viewingInvoice && (
        <Modal
          title={`تفاصيل فاتورة مشتريات #${viewingInvoice.number}`}
          onClose={() => setViewingInvoice(null)}
          size="wide"
        >
          <div className="purchase-invoice-detail">
            <div className="purchase-detail-header">
              <div>
                <small>المورد</small>
                <strong>{viewingInvoice.supplierName}</strong>
              </div>
              <div>
                <small>التاريخ والوقت</small>
                <strong>{shortDate(viewingInvoice.createdAt)}</strong>
              </div>
              <div>
                <small>طريقة الدفع</small>
                <strong>
                  {viewingInvoice.paymentMethod === "cash"
                    ? "نقدي"
                    : viewingInvoice.paymentMethod === "instapay"
                    ? "إنستاباي"
                    : "فودافون كاش"}
                </strong>
              </div>
              <div>
                <small>حالة الدفع</small>
                <em className={`purchase-status ${viewingInvoice.paymentStatus}`}>
                  {viewingInvoice.paymentStatus === "paid" ? "مدفوعة" : "معلقة (آجل)"}
                </em>
              </div>
            </div>

            <div className="purchase-items-table">
              <div className="purchase-item-row purchase-item-header">
                <span>المكون / الخامة</span>
                <span>الكمية</span>
                <span>سعر الوحدة</span>
                <span>الإجمالي</span>
              </div>
              {viewingInvoice.items.map((item, i) => (
                <div className="purchase-item-row" key={i} style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr" }}>
                  <span>
                    <strong>{item.ingredientName}</strong>
                  </span>
                  <span>
                    {item.quantity} {item.unit}
                  </span>
                  <span>{money(item.unitCost)} ج.م</span>
                  <span>
                    <strong>{money(item.total)} ج.م</strong>
                  </span>
                </div>
              ))}
            </div>

            <div className="purchase-invoice-summary">
              <div className="purchase-summary-row">
                <span>المجموع الفرعي</span>
                <strong>{money(viewingInvoice.subtotal)} ج.م</strong>
              </div>
              {viewingInvoice.discount > 0 && (
                <div className="purchase-summary-row">
                  <span>الخصم</span>
                  <strong style={{ color: "#dc2626" }}>- {money(viewingInvoice.discount)} ج.م</strong>
                </div>
              )}
              <div className="purchase-summary-row purchase-grand-total">
                <span>الإجمالي النهائي</span>
                <strong>{money(viewingInvoice.total)} ج.م</strong>
              </div>
            </div>

            {viewingInvoice.note && (
              <div className="purchase-detail-note">
                <small>ملاحظات:</small> {viewingInvoice.note}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
