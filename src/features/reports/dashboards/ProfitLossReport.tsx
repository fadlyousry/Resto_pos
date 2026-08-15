import {
  Printer,
  Scale,
  Wallet
} from "lucide-react";
import type { AppState } from "../../../domain/types";
import { money } from "../../../shared/format";
import type { DateRangeFilter, ProfitLossReportData } from "../types";
import { printReportAsPdf } from "../utils/pdfExport";

interface ProfitLossReportProps {
  data: ProfitLossReportData;
  filter: DateRangeFilter;
  state: AppState;
}

export function ProfitLossReport({ data, filter, state }: ProfitLossReportProps) {
  const isNetProfitable = data.netProfit >= 0;

  const handlePrint = () => {
    printReportAsPdf(
      {
        title: "تقرير الأرباح والخسائر الشامل (P&L)",
        dateRangeLabel: filter.label,
        kpiCards: [
          { label: "إجمالي الإيرادات", value: `${money(data.totalRevenue)} ج.م` },
          { label: "تكلفة الخامات (COGS)", value: `${money(data.costOfGoodsSold)} ج.م` },
          { label: "مجمل الربح", value: `${money(data.grossProfit)} ج.م`, hint: `هامش مجمل ${data.grossMarginPercent.toFixed(1)}%` },
          { label: "المصروفات التشغيلية", value: `${money(data.operationalExpenses)} ج.م` },
          { label: "صافي الربح الحقيقي", value: `${money(data.netProfit)} ج.م`, hint: `هامش صافي ${data.netMarginPercent.toFixed(1)}%` }
        ],
        tables: [
          {
            title: "كشف حساب الأرباح والخسائر",
            headers: ["البند المالي", "القيمة المالية", "النسبة من إجمالي الإيراد"],
            rows: [
              ["إجمالي المبيعات والإيرادات", `${money(data.totalRevenue)} ج.م`, "100.0%"],
              ["(-) تكلفة البضاعة المباعة (المكونات)", `${money(data.costOfGoodsSold)} ج.م`, `${data.totalRevenue > 0 ? ((data.costOfGoodsSold / data.totalRevenue) * 100).toFixed(1) : 0}%`],
              ["(=) مجمل الربح الإجمالي", `${money(data.grossProfit)} ج.م`, `${data.grossMarginPercent.toFixed(1)}%`],
              ["(-) المصروفات التشغيلية والنثرية", `${money(data.operationalExpenses)} ج.م`, `${data.totalRevenue > 0 ? ((data.operationalExpenses / data.totalRevenue) * 100).toFixed(1) : 0}%`],
              ["(=) صافي الربح النهائي للفترة", `${money(data.netProfit)} ج.م`, `${data.netMarginPercent.toFixed(1)}%`]
            ]
          },
          {
            title: "تفصيل المصروفات حسب البيان",
            headers: ["البيان / التصنيف", "عدد الحركات", "إجمالي المبلغ", "النسبة من المصروفات"],
            rows: data.expensesByCategory.map((e) => [
              e.category,
              e.count,
              `${money(e.amount)} ج.م`,
              `${e.share.toFixed(1)}%`
            ]),
            summaryRow: ["إجمالي المصروفات", data.expenseItems.length, `${money(data.operationalExpenses)} ج.م`, "100%"]
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
          <h3 style={{ margin: 0, fontSize: "18px", color: "#1a382f" }}>تقرير الأرباح والخسائر والتحليل المالي</h3>
          <small style={{ color: "#64748b" }}>حساب مجمل وصافي الأرباح بدقة بعد خصم تكاليف الوصفات والمصروفات</small>
        </div>
        <button className="report-print-btn" onClick={handlePrint}>
          <Printer size={16} /> طباعة تقرير الأرباح والخسائر PDF
        </button>
      </div>

      {/* Financial P&L Flow Step Cards */}
      <div className="report-kpi-grid">
        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">إجمالي المبيعات</span>
          </div>
          <strong className="kpi-amount">{money(data.totalRevenue)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#059669", fontWeight: 700 }}>الإيراد الكلي</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">(-) تكلفة الخامات (COGS)</span>
          </div>
          <strong className="kpi-amount" style={{ color: "#dc2626" }}>{money(data.costOfGoodsSold)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>استهلاك الوصفات</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">(=) مجمل الربح</span>
          </div>
          <strong className="kpi-amount">{money(data.grossProfit)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#0284c7", fontWeight: 700 }}>هامش {data.grossMarginPercent.toFixed(1)}%</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">(-) المصروفات التشغيلية</span>
          </div>
          <strong className="kpi-amount">{money(data.operationalExpenses)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>نثريات وفواتير تشغيل</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">(=) صافي الربح للفترة</span>
          </div>
          <strong className="kpi-amount" style={{ color: isNetProfitable ? "#059669" : "#dc2626" }}>
            {money(data.netProfit)} <small style={{ fontSize: "13px" }}>ج.م</small>
          </strong>
          <span style={{ fontSize: "12px", fontWeight: 700, color: isNetProfitable ? "#059669" : "#dc2626" }}>
            {isNetProfitable ? "ربح صافي" : "عجز"} ({data.netMarginPercent.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* Purchases vs Consumption Summary */}
      <div className="report-section-grid" style={{ marginTop: "20px" }}>
        {/* P&L Breakdown Table */}
        <div className="report-panel">
          <div className="report-panel-header">
            <h3><Scale size={18} /> ملخص القوائم المالية بالفترة</h3>
            <small>نسب التكلفة والربحية من الإيراد</small>
          </div>
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th>البند المالي</th>
                  <th>المبلغ</th>
                  <th>النسبة من الإيراد</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>إجمالي المبيعات والإيرادات</strong></td>
                  <td><strong style={{ color: "#254d3e" }}>{money(data.totalRevenue)} ج.م</strong></td>
                  <td><span className="status-tag info">100.0%</span></td>
                </tr>
                <tr>
                  <td><span style={{ color: "#dc2626" }}>(-) تكلفة استهلاك الخامات (COGS)</span></td>
                  <td style={{ color: "#dc2626" }}>{money(data.costOfGoodsSold)} ج.م</td>
                  <td>
                    {data.totalRevenue > 0 ? ((data.costOfGoodsSold / data.totalRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr style={{ background: "#f8fafc" }}>
                  <td><strong>(=) مجمل الربح الإجمالي</strong></td>
                  <td><strong style={{ color: "#0284c7" }}>{money(data.grossProfit)} ج.م</strong></td>
                  <td><span className="status-tag success">{data.grossMarginPercent.toFixed(1)}%</span></td>
                </tr>
                <tr>
                  <td><span style={{ color: "#d97706" }}>(-) المصروفات التشغيلية</span></td>
                  <td style={{ color: "#d97706" }}>{money(data.operationalExpenses)} ج.م</td>
                  <td>
                    {data.totalRevenue > 0 ? ((data.operationalExpenses / data.totalRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="total-row">
                  <td>(=) صافي الربح النهائي</td>
                  <td style={{ color: isNetProfitable ? "#059669" : "#dc2626" }}>
                    {money(data.netProfit)} ج.م
                  </td>
                  <td>
                    <span className={`status-tag ${isNetProfitable ? "success" : "danger"}`}>
                      {data.netMarginPercent.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ color: "#1e293b" }}>فواتير المشتريات المسجلة بالفترة</strong>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                  {data.totalPurchasesInvoices} فاتورة توريد خامات
                </p>
              </div>
              <strong style={{ fontSize: "18px", color: "#b45309" }}>{money(data.totalPurchasesCost)} ج.م</strong>
            </div>
          </div>
        </div>

        {/* Expenses by Category Table */}
        <div className="report-panel">
          <div className="report-panel-header">
            <h3><Wallet size={18} /> تصنيف المصروفات التشغيلية</h3>
            <small>إجمالي المصروفات: {money(data.operationalExpenses)} ج.م</small>
          </div>
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th>البيان / التصنيف</th>
                  <th>عدد الحركات</th>
                  <th>إجمالي المبلغ</th>
                  <th>النسبة</th>
                </tr>
              </thead>
              <tbody>
                {data.expensesByCategory.map((exp) => (
                  <tr key={exp.category}>
                    <td><strong>{exp.category}</strong></td>
                    <td>{exp.count} حركة</td>
                    <td><strong style={{ color: "#dc2626" }}>{money(exp.amount)} ج.م</strong></td>
                    <td><span className="status-tag warning">{exp.share.toFixed(1)}%</span></td>
                  </tr>
                ))}
                {data.expensesByCategory.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                      لا توجد مصروفات مسجلة في هذه الفترة
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
