import { useEffect, useState } from "react";
import { BarChart3, Check, Clock3, CookingPot, Moon, PanelRightClose, PanelRightOpen, RefreshCw, Server, Sun, WalletCards } from "lucide-react";
import { CashView } from "../features/cash";
import { ProductCatalogView } from "../features/catalog";
import { CustomerRecordsView } from "../features/customers";
import { DeliveryView } from "../features/delivery";
import { InventoryView } from "../features/inventory";
import { KitchenView } from "../features/kitchen";
import { OrdersView } from "../features/orders";
import { PosView } from "../features/pos";
import { PurchasePosView, PurchaseHistoryView } from "../features/purchases";
import { ReportsView } from "../features/reports";
import { SettingsView } from "../features/settings";
import { LicenseLockModal } from "../features/license/LicenseLockModal";
import type { Order, ProductSection } from "../domain/types";
import { currentArabicDate, shortDate } from "../shared/format";
import { evaluateLicense } from "../shared/license";
import { navigationItems, type AppView } from "./navigation";
import { useRestaurantState } from "./useRestaurantState";
import { useAutomaticBackups } from "./useAutomaticBackups";
import { useAppUpdater } from "./useAppUpdater";
import { UpdatePrompt } from "../features/settings/UpdatePrompt";

export default function App() {
  const {
    state, update, toast, notify, connectionStatus, connectionError,
    serverUrl, embeddedServer, connectedDevices, changeServerUrl, retryConnection
  } = useRestaurantState();
  const [view, setView] = useState<AppView>("pos");
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [kitchenScope, setKitchenScope] = useState<"all" | "now" | "scheduled">("all");
  const [kitchenSection, setKitchenSection] = useState<"all" | ProductSection>("all");
  const [cashTab, setCashTab] = useState<"treasury" | "shift" | "daily">("shift");
  const [kitchenFocusMode, setKitchenFocusMode] = useState(false);
  const [kitchenDarkTheme, setKitchenDarkTheme] = useState(() => localStorage.getItem("resto-kitchen-dark-theme") === "true");
  const [editReturnView, setEditReturnView] = useState<AppView>("orders");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("beitna-sidebar-collapsed");
    if (saved !== null) return saved === "true";
    return window.innerWidth <= 1440 || window.innerHeight <= 800;
  });
  const [serverDraft, setServerDraft] = useState(serverUrl);
  useAutomaticBackups(state);
  const updater = useAppUpdater(state, notify);

  const setWindowFullscreen = async (fullscreen: boolean) => {
    try {
      if ("__TAURI_INTERNALS__" in window) {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setFullscreen(fullscreen);
      } else if (fullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (!fullscreen && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // The focused kitchen layout still works if the host blocks native fullscreen.
    }
  };

  useEffect(() => {
    const toggleKitchenFocus = (event: KeyboardEvent) => {
      if (event.key !== "F2" || view !== "kitchen") return;
      event.preventDefault();
      setKitchenFocusMode((current) => {
        const next = !current;
        void setWindowFullscreen(next);
        return next;
      });
    };
    window.addEventListener("keydown", toggleKitchenFocus);
    return () => window.removeEventListener("keydown", toggleKitchenFocus);
  }, [view]);

  useEffect(() => {
    if (view === "kitchen" || !kitchenFocusMode) return;
    setKitchenFocusMode(false);
    void setWindowFullscreen(false);
  }, [view, kitchenFocusMode]);

  if (!state) {
    if (connectionError) {
      return <div className="server-connection-screen">
        <div className="server-connection-card">
          <span className="server-connection-icon"><Server /></span>
          <h1>تعذر الاتصال بالسيرفر الرئيسي لـ Resto POS</h1>
          <p>{connectionError}</p>
          <label>
            عنوان السيرفر
            <input
              dir="ltr"
              value={serverDraft}
              onChange={(event) => setServerDraft(event.target.value)}
              placeholder="http://192.168.1.10:4312"
            />
          </label>
          <div>
            <button className="primary-button" onClick={() => changeServerUrl(serverDraft)}>
              <Server /> حفظ والاتصال
            </button>
            <button className="soft-button" onClick={retryConnection}>
              <RefreshCw /> إعادة المحاولة
            </button>
          </div>
          <small>على جهاز السيرفر استخدم http://127.0.0.1:4312، وعلى الأجهزة الأخرى اكتب عنوان جهاز السيرفر داخل الشبكة.</small>
        </div>
      </div>;
    }
    return <div className="loading"><CookingPot size={44} /><strong>بنجهّز المطبخ ونتصل بالسيرفر...</strong></div>;
  }

  const pendingCount = state.orders.filter(
    (order) => order.paymentStatus === "pending" && order.stage !== "returned"
  ).length;
  const viewProps = {
    state,
    update,
    notify,
    network: { status: connectionStatus, serverUrl, embeddedServer, connectedDevices, changeServerUrl },
    updater
  };
  const editOrderInPos = (order: Order) => {
    setEditingOrder(order);
    setEditReturnView(view);
    setView("pos");
  };
  const finishOrderEditing = () => {
    setEditingOrder(null);
    setView(editReturnView);
  };
  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem("beitna-sidebar-collapsed", String(next));
      return next;
    });
  };
  const toggleKitchenTheme = () => {
    setKitchenDarkTheme((current) => {
      const next = !current;
      localStorage.setItem("resto-kitchen-dark-theme", String(next));
      return next;
    });
  };

  const licenseEval = evaluateLicense(state.license);

  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}${view === "pos" || view === "purchase-pos" ? " pos-active" : ""}${view === "kitchen" ? " kitchen-active" : ""}${view === "kitchen" && kitchenFocusMode ? " kitchen-focus-mode" : ""}${view === "kitchen" && kitchenDarkTheme ? " kitchen-dark-theme" : ""}`}>
      {licenseEval.status === "expired" && (
        <LicenseLockModal
          license={state.license}
          onActivate={(newLicense) => {
            update((current) => ({ ...current, license: newLicense }));
            notify("تم تفعيل مفتاح الترخيص بنجاح! مرحبًا بك مجددًا 🎉");
          }}
        />
      )}
      <aside className="sidebar">
        <button className="sidebar-toggle" onClick={toggleSidebar} title={sidebarCollapsed ? "فتح القائمة الجانبية" : "تصغير القائمة الجانبية"}>
          {sidebarCollapsed ? <PanelRightOpen /> : <PanelRightClose />}
        </button>
        <div className="brand">
          <div className="brand-mark">
            {state.settings.logoDataUrl
              ? <img src={state.settings.logoDataUrl} alt="" />
              : <CookingPot />}
          </div>
          <div>
            <strong>Resto POS</strong>
            <span>FYC Solutions</span>
          </div>
        </div>

        <nav>
          {navigationItems.map(({ id, label, icon: Icon }) => (
            <button className={view === id ? "nav-item active" : "nav-item"} title={label} onClick={() => setView(id)} key={id}>
              <Icon size={20} />
              <span>{label}</span>
              {id === "orders" && pendingCount > 0 && <em>{pendingCount}</em>}
            </button>
          ))}
        </nav>

        <div className={`shift-card ${state.cashShifts.some((shift) => !shift.closedAt) ? "" : "closed"}`}>
          <div><span className="live-dot" /> {state.cashShifts.some((shift) => !shift.closedAt) ? "وردية مفتوحة" : "الوردية مغلقة"}</div>
          <strong>{state.cashShifts.find((shift) => !shift.closedAt) ? shortDate(state.cashShifts.find((shift) => !shift.closedAt)!.openedAt) : "افتح وردية من الخزنة"}</strong>
          <small>كاشير: المدير</small>
        </div>
      </aside>

      <main className="main">
        <header className={`topbar${view === "kitchen" ? " kitchen-topbar" : ""}${view === "cash" ? " cash-topbar" : ""}`}>
          <div className="topbar-title">
            <h1>{navigationItems.find((item) => item.id === view)?.label}</h1>
            <p>{currentArabicDate()}</p>
          </div>
          {view === "cash" && <div className="topbar-cash-tabs">
            <button className={cashTab === "treasury" ? "active" : ""} onClick={() => setCashTab("treasury")}><WalletCards /><strong>الخزنة</strong></button>
            <button className={cashTab === "shift" ? "active" : ""} onClick={() => setCashTab("shift")}><Clock3 /><strong>الوردية</strong>{state.cashShifts.some((shift) => !shift.closedAt) && <b>مفتوحة</b>}</button>
            <button className={cashTab === "daily" ? "active" : ""} onClick={() => setCashTab("daily")}><BarChart3 /><strong>الإيراد اليومي</strong></button>
          </div>}
          {view === "kitchen" && <div className="topbar-kitchen-filters">
            <div className="topbar-filter-group kitchen-scope-filters">
              <button className={kitchenScope === "all" ? "active" : ""} onClick={() => setKitchenScope("all")}>كل الطلبات</button>
              <button className={kitchenScope === "now" ? "active" : ""} onClick={() => setKitchenScope("now")}>مطلوب الآن</button>
              <button className={kitchenScope === "scheduled" ? "active" : ""} onClick={() => setKitchenScope("scheduled")}>المجدولة</button>
            </div>
            <div className="topbar-filter-group kitchen-section-filters">
              <button className={kitchenSection === "all" ? "active" : ""} onClick={() => setKitchenSection("all")}>الكل</button>
              {state.sections.map((section) => <button className={kitchenSection === section.id ? "active" : ""} onClick={() => setKitchenSection(section.id)} key={section.id}>{section.name}</button>)}
              <button className={kitchenSection === "__meals" ? "active" : ""} onClick={() => setKitchenSection("__meals")}>الوجبات</button>
            </div>
          </div>}
          <div className="top-actions">
            {view === "kitchen" && <button className="kitchen-theme-toggle" onClick={toggleKitchenTheme} aria-label={kitchenDarkTheme ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"} title={kitchenDarkTheme ? "الوضع الفاتح" : "الوضع الداكن"}>
              {kitchenDarkTheme ? <Sun /> : <Moon />}
            </button>}
            {view !== "kitchen" && view !== "cash" && pendingCount > 0 && (
              <button className="pending-pill" onClick={() => setView("orders")}>
                <Clock3 size={17} /> {pendingCount} تحصيل معلق
              </button>
            )}
          </div>
        </header>

        <section className="page">
          {view === "pos" && <PosView {...viewProps} editingOrder={editingOrder} onEditOrder={editOrderInPos} onFinishEditing={finishOrderEditing} />}
          {view === "purchase-pos" && <PurchasePosView {...viewProps} />}
          {view === "purchase-history" && <PurchaseHistoryView {...viewProps} />}
          {view === "orders" && <OrdersView {...viewProps} onEditOrder={editOrderInPos} />}
          {view === "kitchen" && <KitchenView {...viewProps} scope={kitchenScope} kitchenSection={kitchenSection} />}
          {view === "delivery" && <DeliveryView {...viewProps} />}
          {view === "customers" && <CustomerRecordsView {...viewProps} onEditOrder={editOrderInPos} />}
          {view === "products" && <ProductCatalogView {...viewProps} />}
          {view === "inventory" && <InventoryView {...viewProps} />}
          {view === "cash" && <CashView {...viewProps} cashTab={cashTab} />}
          {view === "reports" && <ReportsView state={state} />}
          {view === "settings" && <SettingsView {...viewProps} />}
        </section>
      </main>

      {toast && <div className="toast"><Check size={18} /> {toast}</div>}
      <UpdatePrompt updater={updater} />
    </div>
  );
}
