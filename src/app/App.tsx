import { useState } from "react";
import { Bell, Check, Clock3, CookingPot } from "lucide-react";
import { CashView } from "../features/cash";
import { ProductCatalogView } from "../features/catalog";
import { CustomerRecordsView } from "../features/customers";
import { DeliveryView } from "../features/delivery";
import { InventoryView } from "../features/inventory";
import { KitchenView } from "../features/kitchen";
import { OrdersView } from "../features/orders";
import { PosView } from "../features/pos";
import { ReportsView } from "../features/reports";
import { SettingsView } from "../features/settings";
import { currentArabicDate, shortDate } from "../shared/format";
import { navigationItems, type AppView } from "./navigation";
import { useRestaurantState } from "./useRestaurantState";

export default function App() {
  const { state, update, toast, notify } = useRestaurantState();
  const [view, setView] = useState<AppView>("pos");

  if (!state) {
    return <div className="loading"><CookingPot size={44} /><strong>بنجهّز المطبخ...</strong></div>;
  }

  const pendingCount = state.orders.filter(
    (order) => order.paymentStatus === "pending" && order.stage !== "cancelled"
  ).length;
  const viewProps = { state, update, notify };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            {state.settings.logoDataUrl
              ? <img src={state.settings.logoDataUrl} alt="" />
              : <CookingPot />}
          </div>
          <div>
            <strong>{state.settings.restaurantName}</strong>
            <span>{state.settings.subtitle || "إدارة المطعم"}</span>
          </div>
        </div>

        <nav>
          {navigationItems.map(({ id, label, icon: Icon }) => (
            <button className={view === id ? "nav-item active" : "nav-item"} onClick={() => setView(id)} key={id}>
              <Icon size={20} />
              <span>{label}</span>
              {id === "orders" && pendingCount > 0 && <em>{pendingCount}</em>}
            </button>
          ))}
        </nav>

        <div className="shift-card">
          <div><span className="live-dot" /> وردية مفتوحة</div>
          <strong>{shortDate(state.shiftOpenedAt)}</strong>
          <small>كاشير: المدير</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{navigationItems.find((item) => item.id === view)?.label}</h1>
            <p>{currentArabicDate()}</p>
          </div>
          <div className="top-actions">
            {pendingCount > 0 && (
              <button className="pending-pill" onClick={() => setView("orders")}>
                <Clock3 size={17} /> {pendingCount} تحصيل معلق
              </button>
            )}
            <button className="icon-button"><Bell size={20} /></button>
            <div className="avatar">م</div>
          </div>
        </header>

        <section className="page">
          {view === "pos" && <PosView {...viewProps} />}
          {view === "orders" && <OrdersView {...viewProps} />}
          {view === "kitchen" && <KitchenView {...viewProps} />}
          {view === "delivery" && <DeliveryView {...viewProps} />}
          {view === "customers" && <CustomerRecordsView {...viewProps} />}
          {view === "products" && <ProductCatalogView {...viewProps} />}
          {view === "inventory" && <InventoryView {...viewProps} />}
          {view === "cash" && <CashView {...viewProps} />}
          {view === "reports" && <ReportsView state={state} />}
          {view === "settings" && <SettingsView {...viewProps} />}
        </section>
      </main>

      {toast && <div className="toast"><Check size={18} /> {toast}</div>}
    </div>
  );
}
