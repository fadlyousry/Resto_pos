import {
  Bike,
  CheckCircle,
  Clock3,
  Printer,
  Receipt,
  Truck
} from "lucide-react";
import type { AppState } from "../../../domain/types";
import { money } from "../../../shared/format";
import type { DateRangeFilter, DeliveryReportData } from "../types";
import { printReportAsPdf } from "../utils/pdfExport";

interface DeliveryDriversReportProps {
  data: DeliveryReportData;
  filter: DateRangeFilter;
  state: AppState;
}

export function DeliveryDriversReport({ data, filter, state }: DeliveryDriversReportProps) {
  const handlePrint = () => {
    printReportAsPdf(
      {
        title: "تقرير التوصيل وأداء مناديب الدليفري",
        dateRangeLabel: filter.label,
        kpiCards: [
          { label: "إجمالي طلبات التوصيل", value: `${data.totalDeliveryOrders} طلب` },
          { label: "تم توصيلها بنجاح", value: `${data.deliveredOrders} طلب`, hint: `نسبة نجاح ${data.deliverySuccessRate.toFixed(1)}%` },
          { label: "رسوم التوصيل المحصلة", value: `${money(data.totalDeliveryFeesCollected)} ج.م` },
          { label: "إجمالي تحصيلات العهد", value: `${money(data.totalDriverCollections)} ج.م` },
          { label: "معلق مع المناديب حالياً", value: `${money(data.pendingWithDrivers)} ج.م` }
        ],
        tables: [
          {
            title: "كشف أداء المناديب وتوريد العهد",
            headers: ["اسم المندوب", "رقم الهاتف", "الطلبات المسلمة", "المبالغ المحصلة", "رسوم التوصيل", "التسويات المنفذة", "المبلغ المورد", "فروق العهد"],
            rows: data.driversMetrics.map((d) => [
              d.name,
              d.phone || "—",
              d.deliveredOrdersCount,
              `${money(d.totalSalesCollected)} ج.م`,
              `${money(d.totalDeliveryFees)} ج.م`,
              d.settlementsCount,
              `${money(d.settledAmount)} ج.م`,
              d.differencesSum !== 0 ? `${d.differencesSum > 0 ? "+" : ""}${money(d.differencesSum)} ج.م` : "مطابق"
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
          <h3 style={{ margin: 0, fontSize: "18px", color: "#1a382f" }}>تقرير التوصيل وأداء مناديب الدليفري</h3>
          <small style={{ color: "#64748b" }}>متابعة كفاءة التوصيل، رسوم الخدمة، وتوريد عهد المناديب</small>
        </div>
        <button className="report-print-btn" onClick={handlePrint}>
          <Printer size={16} /> طباعة تقرير التوصيل PDF
        </button>
      </div>

      {/* KPI Cards */}
      <div className="report-kpi-grid">
        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">إجمالي طلبات التوصيل</span>
            <span className="kpi-icon-wrap"><Truck size={18} /></span>
          </div>
          <strong className="kpi-amount">{data.totalDeliveryOrders} <small style={{ fontSize: "13px" }}>طلب</small></strong>
          <span style={{ fontSize: "12px", color: "#059669" }}>
            نسبة النجاح: {data.deliverySuccessRate.toFixed(1)}% ({data.deliveredOrders} تم تسليمها)
          </span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">رسوم التوصيل المحصلة</span>
            <span className="kpi-icon-wrap"><CheckCircle size={18} /></span>
          </div>
          <strong className="kpi-amount">{money(data.totalDeliveryFeesCollected)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>دخل خدمة التوصيل</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">عهد تم توريدها من المناديب</span>
            <span className="kpi-icon-wrap"><Receipt size={18} /></span>
          </div>
          <strong className="kpi-amount">{money(data.totalDriverCollections)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#d97706" }}>تم إيداعها بالخزنة</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">المبالغ المعلقة مع المناديب</span>
            <span className="kpi-icon-wrap"><Clock3 size={18} /></span>
          </div>
          <strong className="kpi-amount">{money(data.pendingWithDrivers)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>طلبات جارية وقيد التحصيل</span>
        </div>
      </div>

      {/* Driver Performance Table */}
      <div className="report-panel" style={{ marginTop: "20px" }}>
        <div className="report-panel-header">
          <h3><Bike size={18} /> سجل أداء مناديب التوصيل</h3>
          <small>{data.driversMetrics.length} مندوب مسجل</small>
        </div>
        <div className="report-table-scroll">
          <table className="report-styled-table">
            <thead>
              <tr>
                <th>اسم المندوب</th>
                <th>رقم الهاتف</th>
                <th>الطلبات المسلمة</th>
                <th>المبيعات المحصلة</th>
                <th>رسوم التوصيل</th>
                <th>عدد التسويات</th>
                <th>إجمالي العهد الموردة</th>
                <th>فروق العهد</th>
              </tr>
            </thead>
            <tbody>
              {data.driversMetrics.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.name}</strong></td>
                  <td>{d.phone || "—"}</td>
                  <td><strong style={{ color: "#254d3e" }}>{d.deliveredOrdersCount} طلب</strong></td>
                  <td>{money(d.totalSalesCollected)} ج.م</td>
                  <td>{money(d.totalDeliveryFees)} ج.م</td>
                  <td>{d.settlementsCount} تسوية</td>
                  <td><strong style={{ color: "#059669" }}>{money(d.settledAmount)} ج.م</strong></td>
                  <td>
                    {d.differencesSum !== 0 ? (
                      <span className={`status-tag ${d.differencesSum > 0 ? "info" : "danger"}`}>
                        {d.differencesSum > 0 ? `+${money(d.differencesSum)}` : money(d.differencesSum)} ج.م
                      </span>
                    ) : (
                      <span className="status-tag success">مطابق</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.driversMetrics.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                    لا توجد بيانات توصيل مسجلة
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
