import {
  AlertOctagon,
  Boxes,
  CookingPot,
  Printer,
  Trash2
} from "lucide-react";
import type { AppState } from "../../../domain/types";
import { money, qty } from "../../../shared/format";
import { ReportDateFilterPopover } from "../components/ReportDateFilterPopover";
import type { DateRangeFilter, InventoryReportData, ReportDatePreset } from "../types";
import { printReportAsPdf } from "../utils/pdfExport";

interface InventoryReportProps {
  data: InventoryReportData;
  filter: DateRangeFilter;
  preset: ReportDatePreset;
  customFrom: string;
  customTo: string;
  onSelectPreset: (preset: ReportDatePreset, from?: string, to?: string) => void;
  state: AppState;
}

export function InventoryReport({
  data,
  filter,
  preset,
  customFrom,
  customTo,
  onSelectPreset,
  state
}: InventoryReportProps) {
  const totalConsumedCost = data.consumedIngredients.reduce((sum, item) => sum + item.totalCost, 0);

  const handlePrint = () => {
    printReportAsPdf(
      {
        title: "تقرير حركة واستهلاك المخزون والخامات",
        dateRangeLabel: filter.label,
        kpiCards: [
          { label: "تقييم المخزون الحالي", value: `${money(data.totalStockValuation)} ج.م` },
          { label: "إجمالي تكلفة الاستهلاك بالفترة", value: `${money(totalConsumedCost)} ج.م` },
          { label: "خامات تحت حد الطلب (نواقص)", value: `${data.lowStockCount} خامات` },
          { label: "إجمالي تكلفة الهوالك والتوالف", value: `${money(data.totalWasteCost)} ج.م` }
        ],
        tables: [
          {
            title: "المكونات والخامات الأكثر استهلاكاً في المطبخ",
            headers: ["اسم الخامة", "الكمية المستهلكة", "التكلفة الإجمالية", "الرصيد المتبقي", "حد الطلب", "الحالة"],
            rows: data.consumedIngredients.map((item) => [
              item.name,
              `${qty(item.quantityConsumed)} ${item.unit}`,
              `${money(item.totalCost)} ج.م`,
              `${qty(item.currentStock)} ${item.unit}`,
              `${qty(item.minStock)} ${item.unit}`,
              item.isLowStock ? "ناقص بالمخزن" : "متوفر كافي"
            ])
          },
          {
            title: "سجل الهوالك والتسويات المخزنية",
            headers: ["الخامة", "النوع", "الكمية", "التكلفة", "السبب / البيان", "التاريخ"],
            rows: data.wasteAndAdjustments.map((w) => [
              w.ingredientName,
              w.type === "waste" ? "هالك / تالف" : "تسوية جرد",
              qty(w.quantity),
              `${money(w.cost)} ج.م`,
              w.description,
              w.date
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
          <h3 style={{ margin: 0, fontSize: "18px", color: "#1a382f" }}>تقرير المخزون واستهلاك الخامات</h3>
          <small style={{ color: "#64748b" }}>متابعة سحب المكونات في الوصفات، تقييم المخزن، وتكاليف الهوالك</small>
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
            <Printer size={16} /> طباعة تقرير المخزون PDF
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="report-kpi-grid">
        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">القيمة الإجمالية للمخزون الحالي</span>
            <span className="kpi-icon-wrap"><Boxes size={18} /></span>
          </div>
          <strong className="kpi-amount">{money(data.totalStockValuation)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>قيمة الخامات بالمخزن الآن</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">تكلفة استهلاك الخامات بالفترة</span>
            <span className="kpi-icon-wrap"><CookingPot size={18} /></span>
          </div>
          <strong className="kpi-amount">{money(totalConsumedCost)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#059669" }}>المستهلك في الأطباق والوجبات</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">خامات وصلت لحد النقص</span>
            <span className="kpi-icon-wrap"><AlertOctagon size={18} /></span>
          </div>
          <strong className="kpi-amount">{data.lowStockCount} <small style={{ fontSize: "13px" }}>خامات</small></strong>
          <span style={{ fontSize: "12px", color: "#d97706" }}>تحتاج إعادة شراء وتوريد</span>
        </div>

        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">إجمالي تكلفة الهوالك والتوالف</span>
            <span className="kpi-icon-wrap"><Trash2 size={18} /></span>
          </div>
          <strong className="kpi-amount">{money(data.totalWasteCost)} <small style={{ fontSize: "13px" }}>ج.م</small></strong>
          <span style={{ fontSize: "12px", color: "#dc2626" }}>هوالك مسجلة في المطبخ</span>
        </div>
      </div>

      {/* Consumed Ingredients Table */}
      <div className="report-panel" style={{ marginTop: "20px" }}>
        <div className="report-panel-header">
          <h3><CookingPot size={18} /> الخامات والمكونات الأكثر استهلاكاً</h3>
          <small>{data.consumedIngredients.length} خامة مسحوبة</small>
        </div>
        <div className="report-table-scroll">
          <table className="report-styled-table">
            <thead>
              <tr>
                <th>اسم المكون / الخامة</th>
                <th>الكمية المستهلكة</th>
                <th>التكلفة الإجمالية</th>
                <th>الرصيد المتبقي</th>
                <th>حد الطلب الأدنى</th>
                <th>حالة الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {data.consumedIngredients.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td><strong style={{ color: "#254d3e" }}>{qty(item.quantityConsumed)} {item.unit}</strong></td>
                  <td>{money(item.totalCost)} ج.م</td>
                  <td>{qty(item.currentStock)} {item.unit}</td>
                  <td>{qty(item.minStock)} {item.unit}</td>
                  <td>
                    {item.isLowStock ? (
                      <span className="status-tag danger">ناقص بالمخزن</span>
                    ) : (
                      <span className="status-tag success">متوفر</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.consumedIngredients.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                    لا توجد حركات استهلاك مسجلة في هذه الفترة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Waste & Adjustments */}
      {data.wasteAndAdjustments.length > 0 && (
        <div className="report-panel" style={{ marginTop: "20px" }}>
          <div className="report-panel-header">
            <h3><Trash2 size={18} /> سجل الهوالك وفروق التسويات المخزنية</h3>
            <small>{data.wasteAndAdjustments.length} حركة مسجلة</small>
          </div>
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th>الخامة</th>
                  <th>النوع</th>
                  <th>الكمية</th>
                  <th>التكلفة</th>
                  <th>البيان / السبب</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {data.wasteAndAdjustments.map((w, idx) => (
                  <tr key={idx}>
                    <td><strong>{w.ingredientName}</strong></td>
                    <td>
                      <span className={`status-tag ${w.type === "waste" ? "danger" : "info"}`}>
                        {w.type === "waste" ? "تالف / هالك" : "تسوية مخزن"}
                      </span>
                    </td>
                    <td>{qty(w.quantity)}</td>
                    <td style={{ color: "#dc2626" }}>{money(w.cost)} ج.م</td>
                    <td>{w.description}</td>
                    <td>{w.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
