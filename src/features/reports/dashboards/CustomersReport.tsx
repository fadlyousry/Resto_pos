import {
  MapPin,
  Printer,
  Star,
  UserCheck,
  Users
} from "lucide-react";
import type { AppState } from "../../../domain/types";
import { money } from "../../../shared/format";
import type { CustomerReportData, DateRangeFilter } from "../types";
import { printReportAsPdf } from "../utils/pdfExport";

interface CustomersReportProps {
  data: CustomerReportData;
  filter: DateRangeFilter;
  state: AppState;
}

export function CustomersReport({ data, filter, state }: CustomersReportProps) {
  const handlePrint = () => {
    printReportAsPdf(
      {
        title: "تقرير العملاء وكبار المستهلكين والمناطق",
        dateRangeLabel: filter.label,
        kpiCards: [
          { label: "إجمالي قاعدة العملاء", value: `${data.totalCustomersCount} عميل` },
          { label: "العملاء النشطون بالفترة", value: `${data.activeCustomersCount} عميل` },
          { label: "متوسط إنفاق العميل", value: `${money(data.avgCustomerSpend)} ج.م` }
        ],
        tables: [
          {
            title: "قائمة كبار العملاء الأكثر إنفاقاً (Top Spenders)",
            headers: ["اسم العميل", "رقم الهاتف", "المنطقة / العنوان", "الطلبات بالفترة", "إنفاق الفترة", "إجمالي الإنفاق الكلي", "آخر طلب"],
            rows: data.topCustomers.map((c) => [
              c.name,
              c.phone || "—",
              `${c.zone ? `${c.zone} - ` : ""}${c.address || "—"}`,
              c.periodOrdersCount,
              `${money(c.periodTotalSpent)} ج.م`,
              `${money(c.lifetimeTotalSpent)} ج.م`,
              c.lastOrderDate
            ])
          },
          {
            title: "تحليل المناطق السكنية الأكثر طلباً",
            headers: ["المنطقة", "عدد الطلبات", "إجمالي المبيعات", "النسبة"],
            rows: data.topZones.map((z) => [
              z.zone,
              z.ordersCount,
              `${money(z.salesAmount)} ج.م`,
              `${z.share.toFixed(1)}%`
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
          <h3 style={{ margin: 0, fontSize: "18px", color: "#1a382f" }}>تقرير العملاء وتحليلات الولاء والمناطق</h3>
          <small style={{ color: "#64748b" }}>بيانات كبار العملاء، معدل تكرار الطلب، والمناطق الجغرافية الأكثر مبيعاً</small>
        </div>
        <button className="report-print-btn" onClick={handlePrint}>
          <Printer size={16} /> طباعة تقرير العملاء PDF
        </button>
      </div>

      {/* KPI Cards */}
      <div className="report-kpi-grid">
        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">إجمالي قاعدة العملاء</span>
            <span className="kpi-icon-wrap"><Users size={18} /></span>
          </div>
          <strong className="kpi-amount">{data.totalCustomersCount} <small style={{ fontSize: "13px" }}>عميل</small></strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>المسجلين في النظام</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">العملاء النشطون بالفترة</span>
            <span className="kpi-icon-wrap"><UserCheck size={18} /></span>
          </div>
          <strong className="kpi-amount">{data.activeCustomersCount} <small style={{ fontSize: "13px" }}>عميل</small></strong>
          <span style={{ fontSize: "12px", color: "#059669" }}>قاموا بطلب واحد على الأقل</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">متوسط إنفاق العميل</span>
            <span className="kpi-icon-wrap"><Star size={18} /></span>
          </div>
          <strong className="kpi-amount">{money(data.avgCustomerSpend)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>معدل إنفاق العميل النشط بالفترة</span>
        </div>
      </div>

      {/* Top Customers and Zones */}
      <div className="report-section-grid" style={{ marginTop: "20px" }}>
        {/* Top Zones Table */}
        <div className="report-panel">
          <div className="report-panel-header">
            <h3><MapPin size={18} /> المناطق السكنية الأكثر طلباً</h3>
            <small>التوزيع الجغرافي للمبيعات</small>
          </div>
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th>المنطقة</th>
                  <th>عدد الطلبات</th>
                  <th>إجمالي المبيعات</th>
                  <th>النسبة</th>
                </tr>
              </thead>
              <tbody>
                {data.topZones.map((z) => (
                  <tr key={z.zone}>
                    <td><strong>{z.zone}</strong></td>
                    <td>{z.ordersCount} طلب</td>
                    <td><strong style={{ color: "#254d3e" }}>{money(z.salesAmount)} ج.م</strong></td>
                    <td><span className="status-tag info">{z.share.toFixed(1)}%</span></td>
                  </tr>
                ))}
                {data.topZones.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                      لا توجد بيانات مناطق مسجلة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Spenders Table */}
        <div className="report-panel">
          <div className="report-panel-header">
            <h3><Star size={18} color="#d97706" /> كبار العملاء بالفترة (Top Spenders)</h3>
            <small>أعلى العملاء قيمة وإنفاقاً</small>
          </div>
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>الطلبات</th>
                  <th>إنفاق الفترة</th>
                  <th>إجمالي التاريخي</th>
                </tr>
              </thead>
              <tbody>
                {data.topCustomers.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      {c.phone && <small style={{ display: "block", color: "#64748b", fontSize: "11px" }}>{c.phone}</small>}
                    </td>
                    <td>{c.periodOrdersCount} طلب</td>
                    <td><strong style={{ color: "#059669" }}>{money(c.periodTotalSpent)} ج.م</strong></td>
                    <td>{money(c.lifetimeTotalSpent)} ج.م</td>
                  </tr>
                ))}
                {data.topCustomers.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                      لا توجد طلبات عملاء في هذه الفترة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
