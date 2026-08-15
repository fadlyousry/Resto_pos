import {
  ArrowDownCircle,
  ArrowUpCircle,
  Clock3,
  Landmark,
  Printer,
  Scale,
  WalletCards
} from "lucide-react";
import type { AppState } from "../../../domain/types";
import { money, shortDate } from "../../../shared/format";
import type { DateRangeFilter, TreasuryReportData } from "../types";
import { printReportAsPdf } from "../utils/pdfExport";

interface CashTreasuryReportProps {
  data: TreasuryReportData;
  filter: DateRangeFilter;
  state: AppState;
}

export function CashTreasuryReport({ data, filter, state }: CashTreasuryReportProps) {
  const handlePrint = () => {
    printReportAsPdf(
      {
        title: "تقرير الخزينة وجرد الورديات",
        dateRangeLabel: filter.label,
        kpiCards: [
          { label: "إجمالي أرصدة الخزن", value: `${money(data.totalSafeBalance)} ج.م` },
          { label: "إجمالي الوارد بالفترة", value: `${money(data.totalInflow)} ج.م` },
          { label: "إجمالي المنصرف بالفترة", value: `${money(data.totalOutflow)} ج.م` },
          { label: "صافي حركة الأموال", value: `${money(data.netMovement)} ج.م` },
          { label: "عدد الورديات المسجلة", value: `${data.shifts.length} وردية` }
        ],
        tables: [
          {
            title: "أرصدة الخزن الحالية",
            headers: ["اسم الخزنة", "الدور / التوجيه", "الحالة", "الرصيد الفعلي"],
            rows: data.treasuryBalances.map((t) => [
              t.name,
              t.isSalesDefault ? "افتراضية للمبيعات" : t.isPurchasesDefault ? "افتراضية للمشتريات" : "خزنة إضافية",
              t.active ? "نشطة" : "معطلة",
              `${money(t.balance)} ج.م`
            ]),
            summaryRow: ["الإجمالي الكلي", "", "", `${money(data.totalSafeBalance)} ج.م`]
          },
          {
            title: "سجل جرد ومطابقة الورديات",
            headers: ["الوردية / الخزنة", "وقت الفتح والإغلاق", "رصيد البداية", "إيراد الوردية", "المصروفات", "صافي الوردية", "النقدي الفعلي", "فرق الجرد"],
            rows: data.shifts.map((s) => [
              s.treasuryName,
              `${shortDate(s.openedAt)} - ${s.closedAt ? shortDate(s.closedAt) : "مفتوحة"}`,
              `${money(s.openingBalance)} ج.م`,
              `${money(s.revenue)} ج.م`,
              `${money(s.expenses)} ج.م`,
              `${money(s.net)} ج.م`,
              s.actualCash !== undefined ? `${money(s.actualCash)} ج.م` : "—",
              s.difference !== undefined ? `${s.difference > 0 ? "+" : ""}${money(s.difference)} ج.م` : "—"
            ])
          }
        ]
      },
      state
    );
  };

  return (
    <div className="reports-tab-content">
      <div className="reports-section-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "18px", color: "#1a382f" }}>تقرير الخزينة وجرد الورديات</h3>
          <small style={{ color: "#64748b" }}>متابعة أرصدة الخزن المتعددة وحركات الإيداع والصرف ومطابقة جرد الورديات</small>
        </div>
        <button className="report-print-btn" onClick={handlePrint}>
          <Printer size={16} /> طباعة تقرير الخزينة PDF
        </button>
      </div>

      {/* KPI Balances */}
      <div className="report-kpi-grid">
        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">إجمالي أرصدة الخزن الحالية</span>
            <span className="kpi-icon-wrap"><Landmark size={18} /></span>
          </div>
          <strong className="kpi-amount">{money(data.totalSafeBalance)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>رصيد كل الخزن النشطة</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">إجمالي الوارد (Inflow)</span>
            <span className="kpi-icon-wrap"><ArrowDownCircle size={18} /></span>
          </div>
          <strong className="kpi-amount">+{money(data.totalInflow)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#059669" }}>مبيعات وتحصيلات وإيداعات</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">إجمالي المنصرف (Outflow)</span>
            <span className="kpi-icon-wrap"><ArrowUpCircle size={18} /></span>
          </div>
          <strong className="kpi-amount">-{money(data.totalOutflow)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#dc2626" }}>مصروفات ومشتريات ومسحوبات</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">صافي حركة الأموال بالفترة</span>
            <span className="kpi-icon-wrap"><Scale size={18} /></span>
          </div>
          <strong className="kpi-amount">{data.netMovement >= 0 ? "+" : ""}{money(data.netMovement)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>الفارق بين الوارد والمنصرف</span>
        </div>
      </div>

      {/* Treasuries List Cards */}
      <div className="report-panel" style={{ marginTop: "20px" }}>
        <div className="report-panel-header">
          <h3><WalletCards size={18} /> أرصدة الخزن المتعددة</h3>
          <small>{data.treasuryBalances.length} خزن مسجلة</small>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
          {data.treasuryBalances.map((treasury) => (
            <div
              key={treasury.id}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "14px",
                padding: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div>
                <strong style={{ fontSize: "15px", color: "#1e293b" }}>{treasury.name}</strong>
                <div style={{ marginTop: "4px" }}>
                  {treasury.isSalesDefault && <span className="status-tag info" style={{ marginLeft: "4px" }}>مبيعات</span>}
                  {treasury.isPurchasesDefault && <span className="status-tag warning">مشتريات ومصروفات</span>}
                  {!treasury.isSalesDefault && !treasury.isPurchasesDefault && <span className="status-tag" style={{ background: "#e2e8f0", color: "#475569" }}>خزنة إضافية</span>}
                </div>
              </div>
              <strong style={{ fontSize: "18px", color: "#1a382f" }}>{money(treasury.balance)} ج.م</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Shift Audit Logs */}
      <div className="report-panel" style={{ marginTop: "20px" }}>
        <div className="report-panel-header">
          <h3><Clock3 size={18} /> سجل جرد ومطابقة الورديات بالفترة</h3>
          <small>{data.shifts.length} وردية مسجلة</small>
        </div>
        <div className="report-table-scroll">
          <table className="report-styled-table">
            <thead>
              <tr>
                <th>الخزنة</th>
                <th>توقيت الفتح</th>
                <th>توقيت الإغلاق</th>
                <th>رصيد الافتتاح</th>
                <th>الإيراد</th>
                <th>المصروفات</th>
                <th>الصافي</th>
                <th>النقدي الفعلي</th>
                <th>فرق الجرد</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.shifts.map((s) => {
                return (
                  <tr key={s.id}>
                    <td><strong>{s.treasuryName}</strong></td>
                    <td>{shortDate(s.openedAt)}</td>
                    <td>{s.closedAt ? shortDate(s.closedAt) : <span className="status-tag info">مفتوحة الآن</span>}</td>
                    <td>{money(s.openingBalance)} ج.م</td>
                    <td><strong style={{ color: "#059669" }}>+{money(s.revenue)} ج.م</strong></td>
                    <td><span style={{ color: "#dc2626" }}>-{money(s.expenses)} ج.م</span></td>
                    <td><strong>{money(s.net)} ج.م</strong></td>
                    <td>{s.actualCash !== undefined ? `${money(s.actualCash)} ج.م` : "—"}</td>
                    <td>
                      {s.difference !== undefined ? (
                        <span className={`status-tag ${s.difference === 0 ? "success" : s.difference > 0 ? "info" : "danger"}`}>
                          {s.difference > 0 ? `زيادة +${money(s.difference)}` : s.difference < 0 ? `عجز ${money(s.difference)}` : "مطابق تماماً"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {s.closedAt ? (
                        <span className="status-tag success">مغلقة</span>
                      ) : (
                        <span className="status-tag warning">جارية</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data.shifts.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                    لا توجد ورديات مسجلة في هذه الفترة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
