import { useMemo, useState } from "react";
import {
  Bike,
  Boxes,
  Landmark,
  Scale,
  TrendingUp,
  Users,
  Utensils
} from "lucide-react";
import type { AppState } from "../../domain/types";
import { todayKey } from "../../shared/format";
import "./reports.css";
import { CustomersReport } from "./dashboards/CustomersReport";
import { DeliveryDriversReport } from "./dashboards/DeliveryDriversReport";
import { InventoryReport } from "./dashboards/InventoryReport";
import { MenuPerformanceReport } from "./dashboards/MenuPerformanceReport";
import { ProfitLossReport } from "./dashboards/ProfitLossReport";
import { CashTreasuryReport } from "./dashboards/CashTreasuryReport";
import { SalesOverviewReport } from "./dashboards/SalesOverviewReport";
import type { ReportDatePreset, ReportTab } from "./types";
import {
  computeCustomerReport,
  computeDeliveryReport,
  computeInventoryReport,
  computeMenuReport,
  computeProfitLossReport,
  computeSalesReport,
  computeTreasuryReport
} from "./utils/calculations";
import { getDateRangeForPreset } from "./utils/dateRanges";

export function ReportsView({ state }: { state: AppState }) {
  const [activeTab, setActiveTab] = useState<ReportTab>("sales");
  const [preset, setPreset] = useState<ReportDatePreset>("today");
  const [customFrom, setCustomFrom] = useState<string>(todayKey);
  const [customTo, setCustomTo] = useState<string>(todayKey);

  // Compute active date range filter
  const filter = useMemo(() => {
    return getDateRangeForPreset(preset, customFrom, customTo);
  }, [preset, customFrom, customTo]);

  // Compute report data for each dashboard
  const salesData = useMemo(() => computeSalesReport(state, filter), [state, filter]);
  const menuData = useMemo(() => computeMenuReport(state, filter), [state, filter]);
  const profitLossData = useMemo(() => computeProfitLossReport(state, filter), [state, filter]);
  const treasuryData = useMemo(() => computeTreasuryReport(state, filter), [state, filter]);
  const inventoryData = useMemo(() => computeInventoryReport(state, filter), [state, filter]);
  const deliveryData = useMemo(() => computeDeliveryReport(state, filter), [state, filter]);
  const customerData = useMemo(() => computeCustomerReport(state, filter), [state, filter]);

  const handleSelectPreset = (p: ReportDatePreset, from?: string, to?: string) => {
    setPreset(p);
    if (from) setCustomFrom(from);
    if (to) setCustomTo(to);
  };

  return (
    <div className="reports-container">
      {/* Header & Tabs Container */}
      <div className="reports-header-card">
        {/* Navigation Tabs */}
        <div className="reports-nav-tabs">
          <button
            className={`report-tab-btn ${activeTab === "sales" ? "active" : ""}`}
            onClick={() => setActiveTab("sales")}
          >
            <TrendingUp size={16} />
            <span>المبيعات والإيرادات</span>
          </button>

          <button
            className={`report-tab-btn ${activeTab === "menu" ? "active" : ""}`}
            onClick={() => setActiveTab("menu")}
          >
            <Utensils size={16} />
            <span>المنيو والأصناف</span>
          </button>

          <button
            className={`report-tab-btn ${activeTab === "profit_loss" ? "active" : ""}`}
            onClick={() => setActiveTab("profit_loss")}
          >
            <Scale size={16} />
            <span>الأرباح والخسائر (P&L)</span>
          </button>

          <button
            className={`report-tab-btn ${activeTab === "treasury" ? "active" : ""}`}
            onClick={() => setActiveTab("treasury")}
          >
            <Landmark size={16} />
            <span>الخزينة والورديات</span>
          </button>

          <button
            className={`report-tab-btn ${activeTab === "inventory" ? "active" : ""}`}
            onClick={() => setActiveTab("inventory")}
          >
            <Boxes size={16} />
            <span>المخزون والاستهلاك</span>
          </button>

          <button
            className={`report-tab-btn ${activeTab === "delivery" ? "active" : ""}`}
            onClick={() => setActiveTab("delivery")}
          >
            <Bike size={16} />
            <span>التوصيل والمناديب</span>
          </button>

          <button
            className={`report-tab-btn ${activeTab === "customers" ? "active" : ""}`}
            onClick={() => setActiveTab("customers")}
          >
            <Users size={16} />
            <span>العملاء والولاء</span>
          </button>
        </div>
      </div>

      {/* Unified Tab Content Box */}
      <div className="reports-tab-content-card">
        {activeTab === "sales" && (
          <SalesOverviewReport
            data={salesData}
            filter={filter}
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onSelectPreset={handleSelectPreset}
            state={state}
          />
        )}
        {activeTab === "menu" && (
          <MenuPerformanceReport
            data={menuData}
            filter={filter}
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onSelectPreset={handleSelectPreset}
            state={state}
          />
        )}
        {activeTab === "profit_loss" && (
          <ProfitLossReport
            data={profitLossData}
            filter={filter}
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onSelectPreset={handleSelectPreset}
            state={state}
          />
        )}
        {activeTab === "treasury" && (
          <CashTreasuryReport
            data={treasuryData}
            filter={filter}
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onSelectPreset={handleSelectPreset}
            state={state}
          />
        )}
        {activeTab === "inventory" && (
          <InventoryReport
            data={inventoryData}
            filter={filter}
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onSelectPreset={handleSelectPreset}
            state={state}
          />
        )}
        {activeTab === "delivery" && (
          <DeliveryDriversReport
            data={deliveryData}
            filter={filter}
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onSelectPreset={handleSelectPreset}
            state={state}
          />
        )}
        {activeTab === "customers" && (
          <CustomersReport
            data={customerData}
            filter={filter}
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onSelectPreset={handleSelectPreset}
            state={state}
          />
        )}
      </div>
    </div>
  );
}
