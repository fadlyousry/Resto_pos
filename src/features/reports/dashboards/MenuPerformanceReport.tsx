import {
  AlertTriangle,
  CircleDollarSign,
  Printer,
  ShoppingBag,
  TrendingUp,
  Utensils
} from "lucide-react";
import type { AppState } from "../../../domain/types";
import { money } from "../../../shared/format";
import { ReportDateFilterPopover } from "../components/ReportDateFilterPopover";
import type { DateRangeFilter, MenuReportData, ReportDatePreset } from "../types";
import { printReportAsPdf } from "../utils/pdfExport";

interface MenuPerformanceReportProps {
  data: MenuReportData;
  filter: DateRangeFilter;
  preset: ReportDatePreset;
  customFrom: string;
  customTo: string;
  onSelectPreset: (preset: ReportDatePreset, from?: string, to?: string) => void;
  state: AppState;
}

export function MenuPerformanceReport({
  data,
  filter,
  preset,
  customFrom,
  customTo,
  onSelectPreset,
  state
}: MenuPerformanceReportProps) {
  const handlePrint = () => {
    printReportAsPdf(
      {
        title: "تقرير أداء المنيو والأصناف الأكثر طلبًا",
        dateRangeLabel: filter.label,
        kpiCards: [
          { label: "أعلى صنف مبيعاً", value: data.topSellingByVolume[0]?.name || "—", hint: `${data.topSellingByVolume[0]?.quantitySold || 0} قطعة مباعة` },
          { label: "أعلى صنف دخلاً", value: data.topRevenueGenerators[0]?.name || "—", hint: `${money(data.topRevenueGenerators[0]?.totalRevenue || 0)} ج.م إيراد` },
          { label: "الأصناف النشطة", value: `${data.topSellingByVolume.length} صنف` }
        ],
        tables: [
          {
            title: "قائمة أفضل الأصناف مبيعاً وتحليل ربحية كل صنف",
            headers: ["اسم الصنف", "القسم", "الكمية المباعة", "سعر البيع", "تكلفة المكونات", "مجمل الربح", "هامش الربح"],
            rows: data.topSellingByVolume.map((item) => [
              item.name,
              item.section,
              item.quantitySold,
              `${money(item.unitPrice)} ج.م`,
              `${money(item.unitCost)} ج.م`,
              `${money(item.totalProfit)} ج.م`,
              `${item.profitMarginPercent.toFixed(1)}%`
            ])
          },
          {
            title: "أداء الأقسام الرئيسية في المنيو",
            headers: ["القسم", "الكميات المباعة", "إجمالي الإيراد", "النسبة من المبيعات"],
            rows: data.sectionPerformance.map((s) => [
              s.sectionName,
              s.quantity,
              `${money(s.revenue)} ج.م`,
              `${s.share.toFixed(1)}%`
            ])
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
          <h3 style={{ margin: 0, fontSize: "18px", color: "#1a382f" }}>تحليل أداء المنيو والأصناف</h3>
          <small style={{ color: "#64748b" }}>الأصناف الأكثر طلباً، الأعلى عائداً، ونسب الربحية لكل صنف</small>
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
            <Printer size={16} /> طباعة تقرير المنيو PDF
          </button>
        </div>
      </div>

      {/* Top 10 Best Sellers & Revenue Generators Tables */}
      <div className="report-section-grid">
        {/* Best Sellers by Volume */}
        <div className="report-panel">
          <div className="report-panel-header">
            <h3><Utensils size={18} /> الأصناف الأكثر طلبًا (بالكمية)</h3>
            <small>أعلى الأطباق مبيعاً</small>
          </div>
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الصنف</th>
                  <th>الكمية</th>
                  <th>الإيراد</th>
                  <th>النسبة</th>
                </tr>
              </thead>
              <tbody>
                {data.topSellingByVolume.slice(0, 7).map((item, index) => (
                  <tr key={item.name}>
                    <td><strong>{index + 1}</strong></td>
                    <td><strong>{item.name}</strong></td>
                    <td><strong style={{ color: "#254d3e" }}>{item.quantitySold} قطعة</strong></td>
                    <td>{money(item.totalRevenue)} ج.م</td>
                    <td><span className="status-tag info">{item.shareOfSales.toFixed(1)}%</span></td>
                  </tr>
                ))}
                {data.topSellingByVolume.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                      لا توجد بيانات مبيعات في الفترة المحددة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Revenue Generators */}
        <div className="report-panel">
          <div className="report-panel-header">
            <h3><CircleDollarSign size={18} /> الأصناف الأعلى دخلاً (بالقيمة)</h3>
            <small>أكبر مساهمة في الإيراد</small>
          </div>
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الصنف</th>
                  <th>الإيراد</th>
                  <th>الكمية</th>
                  <th>النسبة</th>
                </tr>
              </thead>
              <tbody>
                {data.topRevenueGenerators.slice(0, 7).map((item, index) => (
                  <tr key={item.name}>
                    <td><strong>{index + 1}</strong></td>
                    <td><strong>{item.name}</strong></td>
                    <td><strong style={{ color: "#254d3e" }}>{money(item.totalRevenue)} ج.م</strong></td>
                    <td>{item.quantitySold} قطعة</td>
                    <td><span className="status-tag success">{item.shareOfSales.toFixed(1)}%</span></td>
                  </tr>
                ))}
                {data.topRevenueGenerators.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                      لا توجد بيانات مبيعات في الفترة المحددة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Item Profitability Detailed Table */}
      <div className="report-panel" style={{ marginTop: "20px" }}>
        <div className="report-panel-header">
          <h3><TrendingUp size={18} /> تحليل ربحية وتكلفة الأصناف المباعة</h3>
          <small>سعر البيع، تكلفة الخامات، ومجمل الربح لكل صنف</small>
        </div>
        <div className="report-table-scroll">
          <table className="report-styled-table">
            <thead>
              <tr>
                <th>#</th>
                <th>اسم الصنف</th>
                <th>الكمية</th>
                <th>سعر البيع</th>
                <th>تكلفة المكونات</th>
                <th>إجمالي الإيراد</th>
                <th>إجمالي التكلفة</th>
                <th>مجمل الربح</th>
                <th>هامش الربح</th>
              </tr>
            </thead>
            <tbody>
              {data.topSellingByVolume.map((item, idx) => (
                <tr key={item.name}>
                  <td>{idx + 1}</td>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.quantitySold}</td>
                  <td>{money(item.unitPrice)} ج.م</td>
                  <td>{money(item.unitCost)} ج.م</td>
                  <td><strong>{money(item.totalRevenue)} ج.م</strong></td>
                  <td style={{ color: "#ef4444" }}>{money(item.totalCost)} ج.م</td>
                  <td><strong style={{ color: "#10b981" }}>{money(item.totalProfit)} ج.م</strong></td>
                  <td>
                    <span className={`status-tag ${item.profitMarginPercent >= 40 ? "success" : item.profitMarginPercent >= 20 ? "warning" : "danger"}`}>
                      {item.profitMarginPercent.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sections and Slow Moving Items */}
      <div className="report-section-grid" style={{ marginTop: "20px" }}>
        {/* Sections Performance */}
        <div className="report-panel">
          <div className="report-panel-header">
            <h3><ShoppingBag size={18} /> أداء أقسام المنيو</h3>
            <small>توزيع المبيعات على الأقسام</small>
          </div>
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th>القسم</th>
                  <th>الكميات المباعة</th>
                  <th>إجمالي المبيعات</th>
                  <th>النسبة</th>
                </tr>
              </thead>
              <tbody>
                {data.sectionPerformance.map((sec) => (
                  <tr key={sec.sectionId}>
                    <td><strong>{sec.sectionName}</strong></td>
                    <td>{sec.quantity} صنف</td>
                    <td><strong style={{ color: "#254d3e" }}>{money(sec.revenue)} ج.م</strong></td>
                    <td><span className="status-tag info">{sec.share.toFixed(1)}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Slow Moving Items Alerts */}
        <div className="report-panel">
          <div className="report-panel-header">
            <h3><AlertTriangle size={18} color="#d97706" /> الأصناف الأقل طلباً (Slow Movers)</h3>
            <small>أصناف تحتاج مراجعة أسعار أو عروض ترويجية</small>
          </div>
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الكمية المباعة</th>
                  <th>إجمالي الإيراد</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.slowMovingItems.map((item) => (
                  <tr key={item.name}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.quantitySold} قطعة</td>
                    <td>{money(item.totalRevenue)} ج.م</td>
                    <td><span className="status-tag warning">حركة بطيئة</span></td>
                  </tr>
                ))}
                {data.slowMovingItems.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "#94a3b8" }}>لا توجد أصناف راكدة</td>
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
