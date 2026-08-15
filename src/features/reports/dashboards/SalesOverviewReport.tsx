import {
  Banknote,
  BarChart3,
  Check,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Phone,
  Printer,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Truck
} from "lucide-react";
import type { AppState } from "../../../domain/types";
import { money } from "../../../shared/format";
import { ReportDateFilterPopover } from "../components/ReportDateFilterPopover";
import type { DateRangeFilter, ReportDatePreset, SalesReportData } from "../types";
import { printReportAsPdf } from "../utils/pdfExport";

interface SalesOverviewReportProps {
  data: SalesReportData;
  filter: DateRangeFilter;
  preset: ReportDatePreset;
  customFrom: string;
  customTo: string;
  onSelectPreset: (preset: ReportDatePreset, from?: string, to?: string) => void;
  state: AppState;
}

export function SalesOverviewReport({
  data,
  filter,
  preset,
  customFrom,
  customTo,
  onSelectPreset,
  state
}: SalesOverviewReportProps) {
  const maxHourlyOrders = Math.max(1, ...data.hourlyPeakTimes.map((h) => h.ordersCount));

  const handlePrint = () => {
    printReportAsPdf(
      {
        title: "تقرير المبيعات الشامل",
        dateRangeLabel: filter.label,
        kpiCards: [
          { label: "إجمالي المبيعات", value: `${money(data.totalSales)} ج.م` },
          { label: "عدد الطلبات", value: `${data.totalOrdersCount} طلب` },
          { label: "متوسط الفاتورة", value: `${money(data.avgOrderValue)} ج.م` },
          { label: "المحصل فعليًا", value: `${money(data.collectedAmount)} ج.م` },
          { label: "المعلق بالدليفري", value: `${money(data.pendingAmount)} ج.م` },
          { label: "إجمالي الخصومات", value: `${money(data.totalDiscounts)} ج.م` }
        ],
        tables: [
          {
            title: "توزيع المبيعات حسب طرق الدفع",
            headers: ["طريقة الدفع", "عدد العمليات", "إجمالي المبلغ", "النسبة من المبيعات"],
            rows: [
              ["نقدي", data.methodBreakdown.cash.count, `${money(data.methodBreakdown.cash.amount)} ج.م`, `${data.methodBreakdown.cash.share.toFixed(1)}%`],
              ["إنستاباي", data.methodBreakdown.instapay.count, `${money(data.methodBreakdown.instapay.amount)} ج.م`, `${data.methodBreakdown.instapay.share.toFixed(1)}%`],
              ["فودافون كاش", data.methodBreakdown.vodafone.count, `${money(data.methodBreakdown.vodafone.amount)} ج.م`, `${data.methodBreakdown.vodafone.share.toFixed(1)}%`]
            ],
            summaryRow: ["الإجمالي", data.totalOrdersCount, `${money(data.totalSales)} ج.م`, "100%"]
          },
          {
            title: "سجل المبيعات اليومي بالتفصيل",
            headers: ["التاريخ", "عدد الطلبات", "المبيعات الإجمالية", "المحصل"],
            rows: data.dailyTimeline.map((d) => [
              d.displayDate,
              d.ordersCount,
              `${money(d.sales)} ج.م`,
              `${money(d.collected)} ج.م`
            ]),
            summaryRow: ["الإجمالي", data.totalOrdersCount, `${money(data.totalSales)} ج.م`, `${money(data.collectedAmount)} ج.م`]
          }
        ]
      },
      state
    );
  };

  return (
    <div className="reports-tab-content">
      <div className="reports-section-header-row">
        <div>
          <h3 style={{ margin: 0, fontSize: "18px", color: "#1a382f" }}>تحليل المبيعات والإيرادات</h3>
          <small style={{ color: "#64748b" }}>عرض تفصيلي لأداء المبيعات وساعات الذروة وطرق التحصيل</small>
        </div>
        <div className="reports-section-header-actions">
          <ReportDateFilterPopover
            filter={filter}
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onSelectPreset={onSelectPreset}
          />
          <button className="report-print-btn" onClick={handlePrint}>
            <Printer size={16} /> طباعة تقرير المبيعات PDF
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="report-kpi-grid">
        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">إجمالي المبيعات</span>
            <span className="kpi-icon-wrap"><CircleDollarSign size={18} /></span>
          </div>
          <strong className="kpi-amount">{money(data.totalSales)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          {data.salesGrowthVsPrevious !== null && (
            <div className={`kpi-growth-tag ${data.salesGrowthVsPrevious >= 0 ? "positive" : "negative"}`}>
              {data.salesGrowthVsPrevious >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>{data.salesGrowthVsPrevious >= 0 ? "+" : ""}{data.salesGrowthVsPrevious.toFixed(1)}% مقارنة بالفترة السابقة</span>
            </div>
          )}
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">عدد الطلبات</span>
            <span className="kpi-icon-wrap"><ReceiptText size={18} /></span>
          </div>
          <strong className="kpi-amount">{data.totalOrdersCount} <small style={{ fontSize: "13px" }}>طلب</small></strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>متوسط الفاتورة: {money(data.avgOrderValue)} ج.م</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">المحصل فعليًا</span>
            <span className="kpi-icon-wrap"><Check size={18} /></span>
          </div>
          <strong className="kpi-amount">{money(data.collectedAmount)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#d97706" }}>معلق بالدليفري: {money(data.pendingAmount)} ج.م</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">رسوم التوصيل والخصومات</span>
            <span className="kpi-icon-wrap"><Truck size={18} /></span>
          </div>
          <strong className="kpi-amount">{money(data.totalDeliveryFees)} <small style={{ fontSize: "13px" }}>ج.م رسوم</small></strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>إجمالي الخصومات: {money(data.totalDiscounts)} ج.م</span>
        </div>
      </div>

      {/* Visual Analytics Sections */}
      <div className="report-section-grid" style={{ marginTop: "20px" }}>
        {/* Peak Hours Analysis */}
        <div className="report-panel">
          <div className="report-panel-header">
            <h3><Clock3 size={18} /> ساعات الذروة وتوزيع أوقات الطلبات</h3>
            <small>تحليل أكثر أوقات اليوم استقبالاً للطلبات</small>
          </div>
          <div className="hourly-chart-container">
            {data.hourlyPeakTimes.filter((h) => h.hour >= 8 || h.ordersCount > 0).map((h) => {
              const isPeak = h.ordersCount >= maxHourlyOrders * 0.7 && h.ordersCount > 0;
              const heightPercent = maxHourlyOrders > 0 ? (h.ordersCount / maxHourlyOrders) * 100 : 0;
              return (
                <div className={`hourly-col ${isPeak ? "peak" : ""}`} key={h.hour} title={`${h.hourLabel}: ${h.ordersCount} طلبات (${money(h.salesAmount)} ج.م)`}>
                  <small style={{ fontSize: "10px", fontWeight: 700, color: isPeak ? "#254d3e" : "#64748b" }}>
                    {h.ordersCount > 0 ? h.ordersCount : ""}
                  </small>
                  <div className="hourly-bar-fill" style={{ height: `${Math.max(4, heightPercent)}%` }} />
                  <span className="hourly-label">{h.hour % 3 === 0 ? h.hourLabel : ""}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment & Channel Breakdown */}
        <div className="report-panel">
          <div className="report-panel-header">
            <h3><CreditCard size={18} /> توزيع المبيعات حسب طرق الدفع</h3>
            <small>المبالغ والنسب</small>
          </div>
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th>طريقة الدفع</th>
                  <th>عدد العمليات</th>
                  <th>إجمالي المبلغ</th>
                  <th>النسبة</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong><Banknote size={14} style={{ verticalAlign: "middle", marginLeft: "6px" }} /> نقدي (Cash)</strong></td>
                  <td>{data.methodBreakdown.cash.count} عملية</td>
                  <td><strong>{money(data.methodBreakdown.cash.amount)} ج.م</strong></td>
                  <td><span className="status-tag success">{data.methodBreakdown.cash.share.toFixed(1)}%</span></td>
                </tr>
                <tr>
                  <td><strong><CreditCard size={14} style={{ verticalAlign: "middle", marginLeft: "6px" }} /> إنستاباي (InstaPay)</strong></td>
                  <td>{data.methodBreakdown.instapay.count} عملية</td>
                  <td><strong>{money(data.methodBreakdown.instapay.amount)} ج.م</strong></td>
                  <td><span className="status-tag info">{data.methodBreakdown.instapay.share.toFixed(1)}%</span></td>
                </tr>
                <tr>
                  <td><strong><Phone size={14} style={{ verticalAlign: "middle", marginLeft: "6px" }} /> فودافون كاش</strong></td>
                  <td>{data.methodBreakdown.vodafone.count} عملية</td>
                  <td><strong>{money(data.methodBreakdown.vodafone.amount)} ج.م</strong></td>
                  <td><span className="status-tag warning">{data.methodBreakdown.vodafone.share.toFixed(1)}%</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "4px" }}>
            <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b" }}>مبيعات الصالة / المباشر</small>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", marginTop: "4px" }}>
                {money(data.channelBreakdown.pos.amount)} ج.م <small style={{ fontSize: "11px", color: "#64748b" }}>({data.channelBreakdown.pos.count} طلبات)</small>
              </div>
            </div>
            <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b" }}>مبيعات الدليفري والتوصيل</small>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", marginTop: "4px" }}>
                {money(data.channelBreakdown.delivery.amount)} ج.م <small style={{ fontSize: "11px", color: "#64748b" }}>({data.channelBreakdown.delivery.count} طلبات)</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Timeline Table */}
      {data.dailyTimeline.length > 0 && (
        <div className="report-panel" style={{ marginTop: "20px" }}>
          <div className="report-panel-header">
            <h3><BarChart3 size={18} /> سجل المبيعات اليومي بالفترة</h3>
            <small>{data.dailyTimeline.length} أيام مسجلة</small>
          </div>
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th>اليوم / التاريخ</th>
                  <th>عدد الفواتير</th>
                  <th>إجمالي المبيعات</th>
                  <th>المحصل</th>
                  <th>المعلق</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyTimeline.map((d) => (
                  <tr key={d.dateKey}>
                    <td><strong>{d.displayDate}</strong></td>
                    <td>{d.ordersCount} طلب</td>
                    <td><strong style={{ color: "#254d3e" }}>{money(d.sales)} ج.م</strong></td>
                    <td><span className="status-tag success">{money(d.collected)} ج.م</span></td>
                    <td>{d.sales - d.collected > 0 ? <span className="status-tag warning">{money(d.sales - d.collected)} ج.م</span> : "—"}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>الإجمالي للفترة</td>
                  <td>{data.totalOrdersCount} طلب</td>
                  <td>{money(data.totalSales)} ج.م</td>
                  <td>{money(data.collectedAmount)} ج.م</td>
                  <td>{money(data.pendingAmount)} ج.م</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
