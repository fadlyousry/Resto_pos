import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  CircleDollarSign,
  Filter,
  Package,
  Printer,
  Search,
  ShoppingBag,
  TrendingUp,
  Utensils
} from "lucide-react";
import type { AppState } from "../../../domain/types";
import { money, qty } from "../../../shared/format";
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

type SortField = "quantity" | "revenue" | "profit" | "margin" | "name";

export function MenuPerformanceReport({
  data,
  filter,
  preset,
  customFrom,
  customTo,
  onSelectPreset,
  state
}: MenuPerformanceReportProps) {
  const [search, setSearch] = useState("");
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortField>("quantity");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [activeSubView, setActiveSubView] = useState<"table" | "analytics">("table");

  // Extract unique sections from sold items
  const availableSections = useMemo(() => {
    const set = new Set<string>();
    data.allItemsSold.forEach((item) => {
      if (item.section) set.add(item.section);
    });
    return Array.from(set);
  }, [data.allItemsSold]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let list = [...data.allItemsSold];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.section.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
      );
    }

    if (selectedSection !== "all") {
      list = list.filter((item) => item.section === selectedSection);
    }

    list.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "quantity":
          comparison = a.quantitySold - b.quantitySold;
          break;
        case "revenue":
          comparison = a.totalRevenue - b.totalRevenue;
          break;
        case "profit":
          comparison = a.totalProfit - b.totalProfit;
          break;
        case "margin":
          comparison = a.profitMarginPercent - b.profitMarginPercent;
          break;
        case "name":
          comparison = a.name.localeCompare(b.name, "ar");
          break;
      }
      return sortAsc ? comparison : -comparison;
    });

    return list;
  }, [data.allItemsSold, search, selectedSection, sortBy, sortAsc]);

  // Filtered Totals
  const filteredTotalQuantity = useMemo(
    () => filteredItems.reduce((sum, item) => sum + item.quantitySold, 0),
    [filteredItems]
  );
  const filteredTotalRevenue = useMemo(
    () => filteredItems.reduce((sum, item) => sum + item.totalRevenue, 0),
    [filteredItems]
  );
  const filteredTotalProfit = useMemo(
    () => filteredItems.reduce((sum, item) => sum + item.totalProfit, 0),
    [filteredItems]
  );

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
  };

  const handlePrint = () => {
    printReportAsPdf(
      {
        title: "تقرير الأصناف المباعة والمنيو اليومي",
        subtitle: `الفترة: ${filter.label} — إجمالي الأصناف المباعة: ${filteredItems.length} صنف`,
        dateRangeLabel: filter.label,
        kpiCards: [
          {
            label: "إجمالي الكميات المباعة",
            value: `${qty(data.totalUnitsSold)} وحدة / كجم`,
            hint: `${data.totalItemsCount} صنف مختلف`
          },
          {
            label: "إجمالي مبيعات الأصناف",
            value: `${money(data.totalRevenue)} ج.م`,
            hint: "إيراد مبيعات الأصناف"
          },
          {
            label: "أعلى صنف مبيعاً (بالكمية)",
            value: data.topSellingByVolume[0]?.name || "—",
            hint: `${data.topSellingByVolume[0] ? `${qty(data.topSellingByVolume[0].quantitySold)} ${data.topSellingByVolume[0].unit || ""}` : ""}`
          },
          {
            label: "أعلى صنف عائداً (بالقيمة)",
            value: data.topRevenueGenerators[0]?.name || "—",
            hint: `${money(data.topRevenueGenerators[0]?.totalRevenue || 0)} ج.م`
          }
        ],
        tables: [
          {
            title: "كشف تفصيلي بجميع الأصناف والكميات المباعة",
            headers: [
              "#",
              "اسم الصنف والتفاصيل",
              "القسم",
              "الوحدة",
              "الكمية المباعة",
              "عدد الطلبات",
              "سعر البيع",
              "إجمالي المبيعات",
              "نسبة المساهمة"
            ],
            rows: filteredItems.map((item, idx) => [
              idx + 1,
              item.name,
              item.section,
              item.unit || "—",
              `${qty(item.quantitySold)} ${item.unit || ""}`,
              item.ordersCount ?? 1,
              `${money(item.unitPrice)} ج.م`,
              `${money(item.totalRevenue)} ج.م`,
              `${item.shareOfSales.toFixed(1)}%`
            ]),
            summaryRow: [
              "الإجمالي",
              `${filteredItems.length} صنف`,
              "—",
              "—",
              `${qty(filteredTotalQuantity)} وحدة / كجم`,
              "—",
              "—",
              `${money(filteredTotalRevenue)} ج.م`,
              "100%"
            ]
          },
          {
            title: "توزيع المبيعات حسب أقسام المنيو",
            headers: ["القسم", "الكميات المباعة", "إجمالي الإيراد", "النسبة من المبيعات"],
            rows: data.sectionPerformance.map((s) => [
              s.sectionName,
              `${qty(s.quantity)} وحدة / كجم`,
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
      {/* Header Row */}
      <div className="reports-section-header-row">
        <div>
          <h3 style={{ margin: 0, fontSize: "18px", color: "#1a382f", display: "flex", alignItems: "center", gap: "8px" }}>
            <Utensils size={20} color="#254d3e" />
            تقرير الأصناف المباعة والمنيو
          </h3>
          <small style={{ color: "#64748b" }}>
            كشف دقيق بجميع الأصناف والكميات المباعة، وحدات القياس، الأوزان، والإيرادات
          </small>
        </div>
        <div className="reports-section-header-actions">
          <ReportDateFilterPopover
            filter={filter}
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onSelectPreset={onSelectPreset}
          />
          <button className="report-print-btn" onClick={handlePrint} title="طباعة أو تصدير تقرير الأصناف المباعة كـ PDF">
            <Printer size={16} /> طباعة تقرير الأصناف PDF
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="report-kpi-grid">
        {/* Total Quantity / Units Sold */}
        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-label">إجمالي الكميات المباعة</span>
            <div className="kpi-icon-wrap" style={{ background: "#ecfdf5", color: "#059669" }}>
              <Package size={18} />
            </div>
          </div>
          <strong className="kpi-value" style={{ color: "#065f46" }}>
            {qty(data.totalUnitsSold)} <small style={{ fontSize: "12px", fontWeight: 700 }}>وحدة / كجم</small>
          </strong>
          <small className="kpi-hint" style={{ color: "#059669" }}>
            {filter.label} · عبر جميع الأصناف
          </small>
        </div>

        {/* Total Items Revenue */}
        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-label">إجمالي مبيعات الأصناف</span>
            <div className="kpi-icon-wrap" style={{ background: "#eff6ff", color: "#2563eb" }}>
              <CircleDollarSign size={18} />
            </div>
          </div>
          <strong className="kpi-value" style={{ color: "#1e40af" }}>
            {money(data.totalRevenue)} <small style={{ fontSize: "12px", fontWeight: 700 }}>ج.م</small>
          </strong>
          <small className="kpi-hint" style={{ color: "#3b82f6" }}>
            إجمالي قيمة المبيعات بدون خدمة التوصيل
          </small>
        </div>

        {/* Distinct Items Count */}
        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-label">عدد الأصناف النشطة المباعة</span>
            <div className="kpi-icon-wrap" style={{ background: "#fef3c7", color: "#d97706" }}>
              <Utensils size={18} />
            </div>
          </div>
          <strong className="kpi-value" style={{ color: "#92400e" }}>
            {data.totalItemsCount} <small style={{ fontSize: "12px", fontWeight: 700 }}>صنف مباع</small>
          </strong>
          <small className="kpi-hint" style={{ color: "#b45309" }}>
            من إجمالي قائمة أصناف المنيو
          </small>
        </div>

        {/* Top Selling Item */}
        <div className="report-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-label">الصنف الأكثر مبيعاً</span>
            <div className="kpi-icon-wrap" style={{ background: "#fdf4ff", color: "#a855f7" }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <strong className="kpi-value" style={{ color: "#6b21a8", fontSize: "16px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={data.topSellingByVolume[0]?.name || "—"}>
            {data.topSellingByVolume[0]?.name || "—"}
          </strong>
          <small className="kpi-hint" style={{ color: "#9333ea" }}>
            {data.topSellingByVolume[0]
              ? `${qty(data.topSellingByVolume[0].quantitySold)} ${data.topSellingByVolume[0].unit || "وحدة"} (${money(data.topSellingByVolume[0].totalRevenue)} ج.م)`
              : "لا توجد مبيعات في الفترة"}
          </small>
        </div>
      </div>

      {/* Sub-view switcher bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginTop: "6px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className={`date-chip-btn ${activeSubView === "table" ? "active" : ""}`}
            onClick={() => setActiveSubView("table")}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <ShoppingBag size={14} />
            <span>جدول الأصناف المباعة بالتفصيل ({data.allItemsSold.length})</span>
          </button>
          <button
            type="button"
            className={`date-chip-btn ${activeSubView === "analytics" ? "active" : ""}`}
            onClick={() => setActiveSubView("analytics")}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <TrendingUp size={14} />
            <span>تحليلات الأداء والأقسام</span>
          </button>
        </div>
      </div>

      {/* SUBVIEW 1: Detailed Sold Items Master Table */}
      {activeSubView === "table" && (
        <div className="report-panel">
          {/* Toolbar: Search, Filter, Sort */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" }}>
            {/* Search Input */}
            <div style={{ position: "relative", minWidth: "240px", flex: "1" }}>
              <Search size={16} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم الصنف أو القسم..."
                style={{
                  width: "100%",
                  padding: "8px 34px 8px 12px",
                  borderRadius: "9px",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "13px",
                  outline: "none"
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", border: 0, background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "12px" }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Section Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Filter size={15} color="#64748b" />
              <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>القسم:</span>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                style={{
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "#1e293b",
                  background: "#fff",
                  outline: "none"
                }}
              >
                <option value="all">جميع الأقسام ({data.allItemsSold.length})</option>
                {availableSections.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Selector */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <ArrowDownUp size={15} color="#64748b" />
              <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>الترتيب:</span>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortField);
                  setSortAsc(e.target.value === "name");
                }}
                style={{
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "#1e293b",
                  background: "#fff",
                  outline: "none"
                }}
              >
                <option value="quantity">الأعلى كمية مباعة</option>
                <option value="revenue">الأعلى إيراداً (مبيعات)</option>
                <option value="profit">الأعلى ربحاً</option>
                <option value="margin">أعلى هامش ربح %</option>
                <option value="name">أبجدياً (أ - ي)</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="report-table-scroll">
            <table className="report-styled-table">
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>#</th>
                  <th>اسم الصنف والتفاصيل</th>
                  <th>القسم</th>
                  <th>الوحدة</th>
                  <th
                    style={{ cursor: "pointer", color: sortBy === "quantity" ? "#254d3e" : undefined }}
                    onClick={() => handleSort("quantity")}
                    title="انقر للترتيب حسب الكمية"
                  >
                    الكمية المباعة {sortBy === "quantity" && (sortAsc ? "▲" : "▼")}
                  </th>
                  <th>مرات الطلب</th>
                  <th>سعر البيع</th>
                  <th
                    style={{ cursor: "pointer", color: sortBy === "revenue" ? "#254d3e" : undefined }}
                    onClick={() => handleSort("revenue")}
                    title="انقر للترتيب حسب الإيراد"
                  >
                    إجمالي المبيعات {sortBy === "revenue" && (sortAsc ? "▲" : "▼")}
                  </th>
                  <th>نسبة المساهمة</th>
                  <th
                    style={{ cursor: "pointer", color: sortBy === "profit" ? "#254d3e" : undefined }}
                    onClick={() => handleSort("profit")}
                    title="انقر للترتيب حسب الربح"
                  >
                    مجمل الربح {sortBy === "profit" && (sortAsc ? "▲" : "▼")}
                  </th>
                  <th>هامش الربح</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => (
                  <tr key={item.name}>
                    <td><strong>{idx + 1}</strong></td>
                    <td>
                      <strong style={{ color: "#111827", fontSize: "13.5px" }}>{item.name}</strong>
                    </td>
                    <td>
                      <span className="status-tag info" style={{ fontSize: "11px" }}>{item.section}</span>
                    </td>
                    <td>
                      <span style={{ color: "#64748b", fontWeight: 700 }}>{item.unit || "وحدة"}</span>
                    </td>
                    <td>
                      <strong style={{ color: "#15803d", fontSize: "14px", background: "#f0fdf4", padding: "3px 8px", borderRadius: "6px", border: "1px solid #bbf7d0" }}>
                        {qty(item.quantitySold)} {item.unit || ""}
                      </strong>
                    </td>
                    <td>
                      <span style={{ color: "#475569", fontWeight: 600 }}>{item.ordersCount ?? 1} فاتورة</span>
                    </td>
                    <td>{money(item.unitPrice)} ج.م</td>
                    <td>
                      <strong style={{ color: "#1e40af" }}>{money(item.totalRevenue)} ج.م</strong>
                    </td>
                    <td>
                      <span className="status-tag info">{item.shareOfSales.toFixed(1)}%</span>
                    </td>
                    <td>
                      <strong style={{ color: "#059669" }}>{money(item.totalProfit)} ج.م</strong>
                    </td>
                    <td>
                      <span className={`status-tag ${item.profitMarginPercent >= 40 ? "success" : item.profitMarginPercent >= 20 ? "warning" : "danger"}`}>
                        {item.profitMarginPercent.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
                      <ShoppingBag size={38} style={{ display: "block", margin: "0 auto 8px", opacity: 0.5 }} />
                      <strong style={{ display: "block", fontSize: "14px", color: "#475569" }}>
                        {search || selectedSection !== "all"
                          ? "لا توجد أصناف مطابقة للبحث أو الفلتر المحدد"
                          : "لا توجد مبيعات مسجلة في هذه الفترة"}
                      </strong>
                      <small style={{ color: "#94a3b8" }}>جرّب تغيير الفترة الزمنية أو إزالة الفلاتر</small>
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredItems.length > 0 && (
                <tfoot>
                  <tr className="total-row">
                    <td>—</td>
                    <td><strong>الإجمالي ({filteredItems.length} صنف)</strong></td>
                    <td>—</td>
                    <td>—</td>
                    <td>
                      <strong style={{ color: "#15803d", fontSize: "14px" }}>
                        {qty(filteredTotalQuantity)} وحدة / كجم
                      </strong>
                    </td>
                    <td>—</td>
                    <td>—</td>
                    <td>
                      <strong style={{ color: "#1e40af", fontSize: "14px" }}>
                        {money(filteredTotalRevenue)} ج.م
                      </strong>
                    </td>
                    <td>
                      <strong>
                        {data.totalRevenue > 0
                          ? `${((filteredTotalRevenue / data.totalRevenue) * 100).toFixed(1)}%`
                          : "100%"}
                      </strong>
                    </td>
                    <td>
                      <strong style={{ color: "#059669", fontSize: "14px" }}>
                        {money(filteredTotalProfit)} ج.م
                      </strong>
                    </td>
                    <td>—</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* SUBVIEW 2: Visual Analytics, Top 10 & Sections */}
      {activeSubView === "analytics" && (
        <>
          {/* Top 10 Best Sellers & Revenue Generators Tables */}
          <div className="report-section-grid">
            {/* Best Sellers by Volume */}
            <div className="report-panel">
              <div className="report-panel-header">
                <h3><Utensils size={18} /> الأصناف الأكثر طلباً (بالكمية)</h3>
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
                    {data.topSellingByVolume.slice(0, 10).map((item, index) => (
                      <tr key={item.name}>
                        <td><strong>{index + 1}</strong></td>
                        <td><strong>{item.name}</strong></td>
                        <td>
                          <strong style={{ color: "#254d3e" }}>
                            {qty(item.quantitySold)} {item.unit || "وحدة"}
                          </strong>
                        </td>
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
                    {data.topRevenueGenerators.slice(0, 10).map((item, index) => (
                      <tr key={item.name}>
                        <td><strong>{index + 1}</strong></td>
                        <td><strong>{item.name}</strong></td>
                        <td><strong style={{ color: "#254d3e" }}>{money(item.totalRevenue)} ج.م</strong></td>
                        <td>{qty(item.quantitySold)} {item.unit || "وحدة"}</td>
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

          {/* Sections Performance and Slow Movers */}
          <div className="report-section-grid" style={{ marginTop: "20px" }}>
            {/* Sections Performance */}
            <div className="report-panel">
              <div className="report-panel-header">
                <h3><ShoppingBag size={18} /> أداء أقسام المنيو</h3>
                <small>توزيع المبيعات والكميات على الأقسام</small>
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
                        <td>
                          <strong style={{ color: "#254d3e" }}>{qty(sec.quantity)} وحدة / كجم</strong>
                        </td>
                        <td><strong>{money(sec.revenue)} ج.م</strong></td>
                        <td><span className="status-tag info">{sec.share.toFixed(1)}%</span></td>
                      </tr>
                    ))}
                    {data.sectionPerformance.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center", padding: "20px", color: "#94a3b8" }}>
                          لا توجد بيانات أقسام
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Slow Moving Items */}
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
                        <td>{qty(item.quantitySold)} {item.unit || "وحدة"}</td>
                        <td>{money(item.totalRevenue)} ج.م</td>
                        <td><span className="status-tag warning">حركة بطيئة</span></td>
                      </tr>
                    ))}
                    {data.slowMovingItems.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center", color: "#94a3b8", padding: "20px" }}>لا توجد أصناف راكدة</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
