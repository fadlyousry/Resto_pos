import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Banknote, BarChart3, Bell, Bike, Boxes, CalendarClock, Check, ChevronLeft,
  CircleDollarSign, ClipboardCheck, Clock3, CookingPot, CreditCard, LayoutGrid,
  MapPin, Minus, PackageCheck, Phone, Plus, Printer, ReceiptText, Search,
  ShoppingBag, Store, Trash2, Truck, UserPlus, Users, Utensils, WalletCards, X
} from "lucide-react";
import { loadState, saveState } from "./db";
import type {
  AppState, CashTransaction, Customer, Driver, DriverSettlement, Order, OrderItem,
  OrderStage, PaymentMethod, Product, ProductSection
} from "./types";

type View = "pos" | "orders" | "kitchen" | "delivery" | "customers" | "products" | "cash" | "reports";

const money = (value: number) => `${value.toLocaleString("ar-EG")} ج.م`;
const shortDate = (value: string) => new Intl.DateTimeFormat("ar-EG", {
  day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
}).format(new Date(value));
const todayKey = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID();

const paymentLabels: Record<PaymentMethod, string> = {
  cash: "نقدي", instapay: "إنستاباي", vodafone: "فودافون كاش"
};
const stageLabels: Record<OrderStage, string> = {
  confirmed: "تم التأكيد", preparing: "قيد التحضير", ready: "جاهز",
  out_for_delivery: "خرج للتوصيل", delivered: "تم التسليم", cancelled: "ملغي"
};
const stageSequence: OrderStage[] = ["confirmed", "preparing", "ready", "out_for_delivery", "delivered"];

const navItems: Array<{ id: View; label: string; icon: typeof Store }> = [
  { id: "pos", label: "نقطة البيع", icon: LayoutGrid },
  { id: "orders", label: "الطلبات", icon: ReceiptText },
  { id: "kitchen", label: "المطبخ والتجميع", icon: CookingPot },
  { id: "delivery", label: "التوصيل والمندوبين", icon: Bike },
  { id: "customers", label: "العملاء", icon: Users },
  { id: "products", label: "الأصناف", icon: Boxes },
  { id: "cash", label: "الخزنة", icon: WalletCards },
  { id: "reports", label: "التقارير", icon: BarChart3 }
];

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>("pos");
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadState().then(setState).catch((error) => {
      console.error(error);
      setToast("تعذر فتح قاعدة البيانات");
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    const timer = window.setTimeout(() => {
      saveState(state).catch((error) => {
        console.error(error);
        setToast("تعذر حفظ آخر تعديل");
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!state) {
    return <div className="loading"><CookingPot size={44} /><strong>بنجهّز المطبخ...</strong></div>;
  }

  const update = (updater: (current: AppState) => AppState) => setState((current) => current ? updater(current) : current);
  const pendingCount = state.orders.filter((order) => order.paymentStatus === "pending" && order.stage !== "cancelled").length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><CookingPot /></div>
          <div><strong>بيتنا</strong><span>إدارة المطعم</span></div>
        </div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
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
            <h1>{navItems.find((item) => item.id === view)?.label}</h1>
            <p>{new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
          </div>
          <div className="top-actions">
            {pendingCount > 0 && <button className="pending-pill" onClick={() => setView("orders")}><Clock3 size={17} /> {pendingCount} تحصيل معلق</button>}
            <button className="icon-button"><Bell size={20} /></button>
            <div className="avatar">م</div>
          </div>
        </header>

        <section className="page">
          {view === "pos" && <PosView state={state} update={update} notify={setToast} />}
          {view === "orders" && <OrdersView state={state} update={update} notify={setToast} />}
          {view === "kitchen" && <KitchenView state={state} update={update} notify={setToast} />}
          {view === "delivery" && <DeliveryView state={state} update={update} notify={setToast} />}
          {view === "customers" && <CustomersView state={state} update={update} notify={setToast} />}
          {view === "products" && <ProductsView state={state} update={update} notify={setToast} />}
          {view === "cash" && <CashView state={state} update={update} notify={setToast} />}
          {view === "reports" && <ReportsView state={state} />}
        </section>
      </main>
      {toast && <div className="toast"><Check size={18} /> {toast}</div>}
    </div>
  );
}

function PosView({ state, update, notify }: ViewProps) {
  const [section, setSection] = useState<ProductSection>("cooked");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("الكل");
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [showCustomers, setShowCustomers] = useState(false);
  const [checkout, setCheckout] = useState(false);

  const products = state.products.filter((product) =>
    product.section === section && product.available &&
    (category === "الكل" || product.category === category) &&
    product.name.includes(search.trim())
  );
  const categories = ["الكل", ...new Set(state.products.filter((product) => product.section === section).map((product) => product.category))];
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const customerResults = state.customers.filter((item) =>
    item.name.includes(customerQuery) || item.phone.includes(customerQuery)
  ).slice(0, 5);

  const addProduct = (product: Product) => {
    setCart((current) => {
      const exists = current.find((item) => item.productId === product.id);
      return exists
        ? current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { productId: product.id, name: product.name, unit: product.unit, price: product.price, quantity: 1 }];
    });
  };

  const setQuantity = (productId: string, delta: number) => {
    setCart((current) => current
      .map((item) => item.productId === productId ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0));
  };

  const completeOrder = (details: CheckoutDetails) => {
    if (!customer) return;
    const createdAt = new Date().toISOString();
    const total = Math.max(0, subtotal + details.deliveryFee - details.discount);
    const orderId = uid();
    const order: Order = {
      id: orderId, number: state.nextOrderNumber, customerId: customer.id,
      customerName: customer.name, customerPhone: customer.phone, address: customer.address,
      items: cart, subtotal, deliveryFee: details.deliveryFee, discount: details.discount, total,
      paymentMethod: details.paymentMethod, paymentStatus: details.paymentStatus,
      stage: "confirmed", createdAt, scheduledFor: details.scheduledFor || undefined, note: details.note || undefined
    };
    const transaction: CashTransaction | null = details.paymentStatus === "paid" ? {
      id: uid(), type: "sale", method: details.paymentMethod, amount: total, direction: "in",
      description: `فاتورة #${order.number}`, orderId, createdAt
    } : null;
    update((current) => ({
      ...current,
      orders: [order, ...current.orders],
      cashTransactions: transaction ? [transaction, ...current.cashTransactions] : current.cashTransactions,
      customers: current.customers.map((item) => item.id === customer.id ? {
        ...item, ordersCount: item.ordersCount + 1, totalSpent: item.totalSpent + total, lastOrder: createdAt
      } : item),
      nextOrderNumber: current.nextOrderNumber + 1
    }));
    setCart([]);
    setCustomer(null);
    setCheckout(false);
    notify(`تم تسجيل الطلب #${order.number}`);
  };

  return (
    <div className="pos-layout">
      <div className="catalog">
        <div className="section-switch">
          <button className={section === "cooked" ? "active cooked" : ""} onClick={() => { setSection("cooked"); setCategory("الكل"); }}>
            <Utensils /> <span><strong>أكل مطبوخ</strong><small>جاهز للتقديم</small></span>
          </button>
          <button className={section === "fresh" ? "active fresh" : ""} onClick={() => { setSection("fresh"); setCategory("الكل"); }}>
            <ShoppingBag /> <span><strong>أكل طازة</strong><small>جاهز للتسوية</small></span>
          </button>
        </div>
        <div className="catalog-tools">
          <label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن صنف..." /></label>
          <div className="category-list">
            {categories.map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}
          </div>
        </div>
        <div className="product-grid">
          {products.map((product) => (
            <button className="product-card" onClick={() => addProduct(product)} key={product.id}>
              <span className="food-visual" style={{ background: `linear-gradient(145deg, ${product.accent}30, ${product.accent}80)` }}>
                <Utensils size={28} style={{ color: product.accent }} />
              </span>
              <span className="product-info">
                <strong>{product.name}</strong>
                <small>{product.unit}</small>
                <b>{money(product.price)}</b>
              </span>
              <span className="quick-add"><Plus size={18} /></span>
            </button>
          ))}
          {!products.length && <div className="empty-state"><Search /><strong>مفيش أصناف مطابقة</strong><span>جرّب كلمة أو تصنيف مختلف</span></div>}
        </div>
      </div>

      <aside className="cart-panel">
        <div className="cart-title"><div><span>الطلب الحالي</span><strong>#{state.nextOrderNumber}</strong></div><button onClick={() => setCart([])} disabled={!cart.length}><Trash2 size={18} /></button></div>
        <div className="customer-picker">
          {customer ? (
            <div className="selected-customer">
              <span className="customer-avatar">{customer.name.charAt(0)}</span>
              <div><strong>{customer.name}</strong><small><Phone size={12} /> {customer.phone}</small></div>
              <button onClick={() => setCustomer(null)}><X size={17} /></button>
            </div>
          ) : (
            <button className="select-customer" onClick={() => setShowCustomers(true)}><UserPlus size={19} /> اختيار العميل وعنوان التوصيل <ChevronLeft size={18} /></button>
          )}
        </div>
        <div className="cart-items">
          {cart.map((item) => (
            <div className="cart-item" key={item.productId}>
              <div className="cart-item-top"><div><strong>{item.name}</strong><small>{item.unit} · {money(item.price)}</small></div><b>{money(item.price * item.quantity)}</b></div>
              <div className="quantity">
                <button onClick={() => setQuantity(item.productId, -1)}><Minus size={15} /></button>
                <span>{item.quantity}</span>
                <button onClick={() => setQuantity(item.productId, 1)}><Plus size={15} /></button>
              </div>
            </div>
          ))}
          {!cart.length && <div className="empty-cart"><ShoppingBag size={44} /><strong>الطلب لسه فاضي</strong><span>اختار الأصناف من المنيو</span></div>}
        </div>
        <div className="cart-summary">
          <div><span>الإجمالي المبدئي</span><strong>{money(subtotal)}</strong></div>
          <button className="primary-button checkout-button" disabled={!cart.length || !customer} onClick={() => setCheckout(true)}>
            متابعة الدفع <span>{money(subtotal)}</span>
          </button>
          {!customer && cart.length > 0 && <small className="hint">اختار العميل الأول لإكمال الطلب</small>}
        </div>
      </aside>

      {showCustomers && (
        <Modal title="اختيار العميل" onClose={() => setShowCustomers(false)}>
          <label className="search-box modal-search"><Search size={18} /><input autoFocus value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="الاسم أو رقم الموبايل" /></label>
          <div className="customer-results">
            {customerResults.map((item) => (
              <button key={item.id} onClick={() => { setCustomer(item); setShowCustomers(false); }}>
                <span className="customer-avatar">{item.name.charAt(0)}</span>
                <div><strong>{item.name}</strong><small>{item.phone}</small><p>{item.address}</p></div>
                <ChevronLeft />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {checkout && customer && <CheckoutModal subtotal={subtotal} customer={customer} onClose={() => setCheckout(false)} onComplete={completeOrder} />}
    </div>
  );
}

interface CheckoutDetails {
  paymentMethod: PaymentMethod;
  paymentStatus: "paid" | "pending";
  deliveryFee: number;
  discount: number;
  scheduledFor: string;
  note: string;
}

function CheckoutModal({ subtotal, customer, onClose, onComplete }: {
  subtotal: number; customer: Customer; onClose: () => void; onComplete: (details: CheckoutDetails) => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">("pending");
  const [deliveryFee, setDeliveryFee] = useState(30);
  const [discount, setDiscount] = useState(0);
  const [scheduledFor, setScheduledFor] = useState("");
  const [note, setNote] = useState("");
  const total = Math.max(0, subtotal + deliveryFee - discount);
  return (
    <Modal title="تأكيد الطلب والدفع" onClose={onClose} wide>
      <div className="checkout-grid">
        <div>
          <div className="checkout-customer"><span className="customer-avatar">{customer.name.charAt(0)}</span><div><strong>{customer.name}</strong><small>{customer.address}</small></div></div>
          <h3>طريقة الدفع</h3>
          <div className="payment-options">
            <PaymentOption active={paymentMethod === "cash"} icon={<Banknote />} label="نقدي" onClick={() => setPaymentMethod("cash")} />
            <PaymentOption active={paymentMethod === "instapay"} icon={<CreditCard />} label="إنستاباي" onClick={() => { setPaymentMethod("instapay"); setPaymentStatus("paid"); }} />
            <PaymentOption active={paymentMethod === "vodafone"} icon={<Phone />} label="فودافون كاش" onClick={() => { setPaymentMethod("vodafone"); setPaymentStatus("paid"); }} />
          </div>
          <h3>حالة التحصيل</h3>
          <div className="status-options">
            <button className={paymentStatus === "paid" ? "active paid" : ""} onClick={() => setPaymentStatus("paid")}><Check /> تم التحصيل</button>
            <button className={paymentStatus === "pending" ? "active pending" : ""} onClick={() => setPaymentStatus("pending")}><Clock3 /> معلق مع الدليفري</button>
          </div>
          <div className="form-row">
            <label>موعد التوصيل<input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
            <label>ملاحظات الطلب<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثال: الاتصال قبل الوصول" /></label>
          </div>
        </div>
        <div className="total-card">
          <h3>ملخص الحساب</h3>
          <div><span>قيمة الأصناف</span><b>{money(subtotal)}</b></div>
          <div><span>التوصيل</span><input type="number" min="0" value={deliveryFee} onChange={(event) => setDeliveryFee(Number(event.target.value))} /></div>
          <div><span>الخصم</span><input type="number" min="0" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></div>
          <hr />
          <div className="grand-total"><span>الإجمالي</span><strong>{money(total)}</strong></div>
          <button className="primary-button" onClick={() => onComplete({ paymentMethod, paymentStatus, deliveryFee, discount, scheduledFor, note })}><PackageCheck /> تأكيد الطلب</button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentOption({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span>{active && <Check className="option-check" />}</button>;
}

function OrdersView({ state, update, notify }: ViewProps) {
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "scheduled" | "delivered">("all");
  const [invoice, setInvoice] = useState<Order | null>(null);
  const filtered = state.orders.filter((order) => {
    if (filter === "pending") return order.paymentStatus === "pending" && order.stage !== "cancelled";
    if (filter === "active") return !["delivered", "cancelled"].includes(order.stage);
    if (filter === "scheduled") return Boolean(order.scheduledFor) && new Date(order.scheduledFor!).getTime() > Date.now();
    if (filter === "delivered") return order.stage === "delivered";
    return true;
  });

  const advance = (order: Order) => {
    const index = stageSequence.indexOf(order.stage);
    if (index < 0 || index === stageSequence.length - 1) return;
    update((current) => ({ ...current, orders: current.orders.map((item) => item.id === order.id ? { ...item, stage: stageSequence[index + 1] } : item) }));
    notify(`تم تحديث الطلب #${order.number}`);
  };
  const collect = (order: Order) => {
    const createdAt = new Date().toISOString();
    update((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === order.id ? { ...item, paymentStatus: "paid" } : item),
      cashTransactions: [{
        id: uid(), type: "collection", method: order.paymentMethod, amount: order.total,
        direction: "in", description: `تحصيل فاتورة #${order.number}`, orderId: order.id, createdAt
      }, ...current.cashTransactions]
    }));
    notify(`تم تحصيل ${money(order.total)}`);
  };

  return (
    <div>
      <div className="stat-strip">
        <MiniStat icon={<ReceiptText />} label="طلبات اليوم" value={String(state.orders.filter((o) => o.createdAt.slice(0, 10) === todayKey()).length)} tone="green" />
        <MiniStat icon={<Clock3 />} label="تحصيلات معلقة" value={String(state.orders.filter((o) => o.paymentStatus === "pending").length)} tone="orange" />
        <MiniStat icon={<Truck />} label="خارج للتوصيل" value={String(state.orders.filter((o) => o.stage === "out_for_delivery").length)} tone="blue" />
        <MiniStat icon={<CircleDollarSign />} label="قيمة المعلق" value={money(state.orders.filter((o) => o.paymentStatus === "pending").reduce((sum, o) => sum + o.total, 0))} tone="red" />
      </div>
      <div className="panel">
        <div className="panel-head">
          <div className="filter-tabs">
            {[["all", "الكل"], ["active", "طلبات نشطة"], ["scheduled", "مجدولة"], ["pending", "تحصيل معلق"], ["delivered", "تم التسليم"]].map(([id, label]) => (
              <button className={filter === id ? "active" : ""} onClick={() => setFilter(id as typeof filter)} key={id}>{label}</button>
            ))}
          </div>
        </div>
        <div className="orders-table">
          <div className="table-row table-head"><span>الطلب</span><span>العميل</span><span>القيمة</span><span>الدفع</span><span>حالة الطلب</span><span>الإجراء</span></div>
          {filtered.map((order) => (
            <div className="table-row" key={order.id}>
              <span><strong>#{order.number}</strong><small>{order.scheduledFor ? `موعد: ${shortDate(order.scheduledFor)}` : shortDate(order.createdAt)}</small></span>
              <span><strong>{order.customerName}</strong><small>{order.customerPhone}</small></span>
              <span><strong>{money(order.total)}</strong><small>{order.items.length} أصناف</small></span>
              <span><StatusBadge type={order.paymentStatus === "paid" ? "success" : "warning"}>{order.paymentStatus === "paid" ? "تم التحصيل" : "معلق"}</StatusBadge><small>{paymentLabels[order.paymentMethod]}</small></span>
              <span><StatusBadge type={order.stage === "delivered" ? "success" : order.stage === "out_for_delivery" ? "info" : "neutral"}>{stageLabels[order.stage]}</StatusBadge></span>
              <span className="row-actions">
                <button className="icon-row-button" title="طباعة الفاتورة" onClick={() => setInvoice(order)}><Printer size={15} /></button>
                {order.paymentStatus === "pending" && !order.driverId && <button className="collect-button" onClick={() => collect(order)}><Banknote size={16} /> تحصيل</button>}
                {order.paymentStatus === "pending" && order.driverId && <StatusBadge type="info">مع {order.driver}</StatusBadge>}
                {!["delivered", "cancelled"].includes(order.stage) && <button className="soft-button" onClick={() => advance(order)}>التالي</button>}
              </span>
            </div>
          ))}
          {!filtered.length && <Empty icon={<ReceiptText />} title="لا توجد طلبات هنا" text="الطلبات الجديدة هتظهر تلقائيًا" />}
        </div>
      </div>
      {invoice && <InvoiceModal order={invoice} onClose={() => setInvoice(null)} />}
    </div>
  );
}

function InvoiceModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const printInvoice = () => {
    document.body.classList.add("print-receipt");
    window.print();
    window.setTimeout(() => document.body.classList.remove("print-receipt"), 500);
  };
  return (
    <Modal title={`فاتورة #${order.number}`} onClose={onClose}>
      <div className="receipt-paper">
        <header><CookingPot /><h2>بيتنا</h2><p>أكل بيتي معمول بحب</p></header>
        <div className="receipt-meta">
          <span>رقم الطلب <b>#{order.number}</b></span>
          <span>التاريخ <b>{shortDate(order.createdAt)}</b></span>
          {order.scheduledFor && <span>موعد التوصيل <b>{shortDate(order.scheduledFor)}</b></span>}
        </div>
        <div className="receipt-customer">
          <strong>{order.customerName}</strong>
          <span>{order.customerPhone}</span>
          <p>{order.address}</p>
        </div>
        <table>
          <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th></tr></thead>
          <tbody>{order.items.map((item) => <tr key={item.productId}><td>{item.name}</td><td>{item.quantity}</td><td>{money(item.price * item.quantity)}</td></tr>)}</tbody>
        </table>
        <div className="receipt-totals">
          <span>الأصناف <b>{money(order.subtotal)}</b></span>
          <span>التوصيل <b>{money(order.deliveryFee)}</b></span>
          {order.discount > 0 && <span>الخصم <b>- {money(order.discount)}</b></span>}
          <strong>الإجمالي <b>{money(order.total)}</b></strong>
        </div>
        <div className="receipt-footer">
          <span>{paymentLabels[order.paymentMethod]} · {order.paymentStatus === "paid" ? "تم الدفع" : "التحصيل عند التوصيل"}</span>
          {order.note && <p>ملاحظة: {order.note}</p>}
          <small>شكرًا لاختياركم بيتنا</small>
        </div>
      </div>
      <button className="primary-button print-receipt-button" onClick={printInvoice}><Printer /> طباعة الفاتورة</button>
    </Modal>
  );
}

function KitchenView({ state, update, notify }: ViewProps) {
  const [scope, setScope] = useState<"all" | "now" | "scheduled">("all");
  const activeOrders = state.orders.filter((order) => {
    if (["delivered", "cancelled"].includes(order.stage)) return false;
    const scheduled = order.scheduledFor && new Date(order.scheduledFor).getTime() > Date.now() + 60 * 60 * 1000;
    if (scope === "now") return !scheduled;
    if (scope === "scheduled") return Boolean(scheduled);
    return true;
  });
  const grouped = new Map<string, { name: string; unit: string; quantity: number; section: ProductSection | undefined }>();
  activeOrders.flatMap((order) => order.items).forEach((item) => {
    const existing = grouped.get(item.productId);
    if (existing) existing.quantity += item.quantity;
    else grouped.set(item.productId, { name: item.name, unit: item.unit, quantity: item.quantity, section: undefined });
  });
  const moveKitchenOrder = (order: Order) => {
    const next: OrderStage | null = order.stage === "confirmed" ? "preparing" : order.stage === "preparing" ? "ready" : null;
    if (!next) return;
    update((current) => ({ ...current, orders: current.orders.map((item) => item.id === order.id ? { ...item, stage: next } : item) }));
    notify(next === "ready" ? `الطلب #${order.number} جاهز` : `بدأ تحضير الطلب #${order.number}`);
  };
  const printKitchen = () => {
    document.body.classList.add("print-kitchen");
    window.print();
    window.setTimeout(() => document.body.classList.remove("print-kitchen"), 500);
  };
  return (
    <div>
      <div className="kitchen-toolbar">
        <div className="filter-tabs">
          <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>كل التحضير</button>
          <button className={scope === "now" ? "active" : ""} onClick={() => setScope("now")}>مطلوب الآن</button>
          <button className={scope === "scheduled" ? "active" : ""} onClick={() => setScope("scheduled")}>طلبات مجدولة</button>
        </div>
        <button className="soft-button print-kitchen-button" onClick={printKitchen}><Printer /> طباعة التجميع</button>
      </div>
      <div className="kitchen-layout">
      <div className="panel">
        <div className="panel-title"><div><CookingPot /><span><strong>تجميع تحضير اليوم</strong><small>إجمالي الأصناف في الطلبات النشطة</small></span></div><StatusBadge type="warning">{activeOrders.length} طلب نشط</StatusBadge></div>
        <div className="aggregation-grid">
          {[...grouped.values()].map((item) => (
            <div className="aggregation-card" key={item.name}>
              <span className="amount">{item.quantity}</span>
              <div><strong>{item.name}</strong><small>{item.quantity} × {item.unit}</small></div>
              <div className="progress-line"><i style={{ width: "35%" }} /></div>
            </div>
          ))}
          {!grouped.size && <Empty icon={<CookingPot />} title="المطبخ هادي حاليًا" text="تجميع الأصناف هيظهر مع أول طلب نشط" />}
        </div>
      </div>
      <div className="panel">
        <div className="panel-title"><div><ReceiptText /><span><strong>كروت التحضير</strong><small>مرتبة حسب الأقدم</small></span></div></div>
        <div className="kitchen-orders">
          {activeOrders.slice().reverse().map((order) => (
            <article key={order.id}>
              <header><strong>طلب #{order.number}</strong><StatusBadge type={order.stage === "ready" ? "success" : "neutral"}>{stageLabels[order.stage]}</StatusBadge></header>
              <p>{order.customerName} · {order.scheduledFor ? `موعد ${shortDate(order.scheduledFor)}` : shortDate(order.createdAt)}</p>
              <ul>{order.items.map((item) => <li key={item.productId}><b>{item.quantity}×</b> {item.name}</li>)}</ul>
              {order.note && <small className="order-note">{order.note}</small>}
              {["confirmed", "preparing"].includes(order.stage) && <button className="kitchen-action" onClick={() => moveKitchenOrder(order)}>{order.stage === "confirmed" ? "بدء التحضير" : "تم التجهيز"}</button>}
            </article>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

function DeliveryView({ state, update, notify }: ViewProps) {
  const [addingDriver, setAddingDriver] = useState(false);
  const [driverForm, setDriverForm] = useState({ name: "", phone: "", vehicle: "موتوسيكل" });
  const [settlementDriver, setSettlementDriver] = useState<Driver | null>(null);
  const unassigned = state.orders.filter((order) => order.stage === "ready" && !order.driverId);

  const assign = (order: Order, driver: Driver) => {
    update((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === order.id ? { ...item, driverId: driver.id, driver: driver.name } : item)
    }));
    notify(`تم إسناد الطلب #${order.number} إلى ${driver.name}`);
  };

  const updateDeliveryStage = (order: Order, stage: "out_for_delivery" | "delivered") => {
    update((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === order.id ? { ...item, stage } : item)
    }));
    notify(stage === "delivered" ? `تم تسليم الطلب #${order.number}` : `الطلب #${order.number} خرج للتوصيل`);
  };

  const addDriver = () => {
    if (!driverForm.name || !driverForm.phone) return;
    const driver: Driver = { id: uid(), ...driverForm, active: true, createdAt: new Date().toISOString() };
    update((current) => ({ ...current, drivers: [...current.drivers, driver] }));
    setDriverForm({ name: "", phone: "", vehicle: "موتوسيكل" });
    setAddingDriver(false);
    notify("تم إضافة المندوب");
  };

  const settle = (driver: Driver, orders: Order[], expenses: number, amountReceived: number, note: string) => {
    const createdAt = new Date().toISOString();
    const grossCollected = orders.reduce((sum, order) => sum + order.total, 0);
    const deliveryFees = orders.reduce((sum, order) => sum + order.deliveryFee, 0);
    const difference = amountReceived + expenses - grossCollected;
    const settlement: DriverSettlement = {
      id: uid(), driverId: driver.id, driverName: driver.name, orderIds: orders.map((order) => order.id),
      grossCollected, deliveryFees, expenses, amountReceived, difference, note: note || undefined, createdAt
    };
    const transactions: CashTransaction[] = [];
    if (amountReceived > 0) transactions.push({
      id: uid(), type: "collection", method: "cash", amount: amountReceived, direction: "in",
      description: `تسوية المندوب ${driver.name} — ${orders.length} طلب`, createdAt
    });
    if (expenses > 0) transactions.push({
      id: uid(), type: "expense", method: "cash", amount: expenses, direction: "out",
      description: `مصروف تسوية المندوب ${driver.name}`, createdAt
    });
    update((current) => ({
      ...current,
      orders: current.orders.map((order) => settlement.orderIds.includes(order.id)
        ? { ...order, stage: "delivered", paymentStatus: "paid", settlementId: settlement.id }
        : order),
      driverSettlements: [settlement, ...current.driverSettlements],
      cashTransactions: [...transactions, ...current.cashTransactions]
    }));
    setSettlementDriver(null);
    notify(`تمت تسوية عهدة ${driver.name}`);
  };

  return (
    <div className="delivery-page">
      <div className="delivery-heading">
        <div><Bike /><span><strong>إدارة التوصيل</strong><small>إسناد الطلبات ومتابعة عهدة كل مندوب</small></span></div>
        <button className="primary-button compact" onClick={() => setAddingDriver(true)}><UserPlus /> مندوب جديد</button>
      </div>

      <div className="stat-strip">
        <MiniStat icon={<PackageCheck />} label="جاهز للإسناد" value={String(unassigned.length)} tone="orange" />
        <MiniStat icon={<Bike />} label="خارج للتوصيل" value={String(state.orders.filter((order) => order.stage === "out_for_delivery").length)} tone="blue" />
        <MiniStat icon={<Banknote />} label="عهدة مع المندوبين" value={money(state.orders.filter((order) => order.driverId && order.paymentStatus === "pending" && !order.settlementId).reduce((sum, order) => sum + order.total, 0))} tone="red" />
        <MiniStat icon={<ClipboardCheck />} label="تسويات اليوم" value={String(state.driverSettlements.filter((item) => item.createdAt.slice(0, 10) === todayKey()).length)} tone="green" />
      </div>

      {unassigned.length > 0 && (
        <div className="panel unassigned-panel">
          <div className="panel-title"><div><PackageCheck /><span><strong>طلبات جاهزة للإسناد</strong><small>اختار المندوب المناسب لكل طلب</small></span></div></div>
          <div className="assignment-list">
            {unassigned.map((order) => (
              <div key={order.id}>
                <span><strong>#{order.number} · {order.customerName}</strong><small><MapPin /> {order.address}</small></span>
                <b>{money(order.total)}</b>
                <div className="assign-buttons">
                  {state.drivers.filter((driver) => driver.active).map((driver) => (
                    <button key={driver.id} onClick={() => assign(order, driver)}><Bike /> {driver.name}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="driver-grid">
        {state.drivers.filter((driver) => driver.active).map((driver) => {
          const assigned = state.orders.filter((order) => order.driverId === driver.id && !order.settlementId && !["cancelled"].includes(order.stage));
          const unsettled = assigned.filter((order) => order.paymentStatus === "pending" && ["out_for_delivery", "delivered"].includes(order.stage));
          const custody = unsettled.reduce((sum, order) => sum + order.total, 0);
          return (
            <article className="driver-card" key={driver.id}>
              <header>
                <span className="driver-avatar"><Bike /></span>
                <div><strong>{driver.name}</strong><small>{driver.phone} · {driver.vehicle}</small></div>
                <StatusBadge type={assigned.some((order) => order.stage === "out_for_delivery") ? "info" : "success"}>
                  {assigned.some((order) => order.stage === "out_for_delivery") ? "في التوصيل" : "متاح"}
                </StatusBadge>
              </header>
              <div className="driver-summary">
                <span><small>طلبات حالية</small><b>{assigned.length}</b></span>
                <span><small>العهدة</small><b>{money(custody)}</b></span>
              </div>
              <div className="driver-orders">
                {assigned.map((order) => (
                  <div key={order.id}>
                    <span><strong>#{order.number} · {order.customerName}</strong><small>{money(order.total)} · {stageLabels[order.stage]}</small></span>
                    {order.stage === "ready" && <button onClick={() => updateDeliveryStage(order, "out_for_delivery")}><Truck /> خروج</button>}
                    {order.stage === "out_for_delivery" && <button onClick={() => updateDeliveryStage(order, "delivered")}><Check /> تسليم</button>}
                    {order.stage === "delivered" && order.paymentStatus === "pending" && <StatusBadge type="warning">بانتظار التسوية</StatusBadge>}
                  </div>
                ))}
                {!assigned.length && <p>لا توجد طلبات مع المندوب</p>}
              </div>
              <button className="settlement-button" disabled={!unsettled.length} onClick={() => setSettlementDriver(driver)}>
                <ClipboardCheck /> تسوية العهدة {unsettled.length > 0 && `(${unsettled.length})`}
              </button>
            </article>
          );
        })}
      </div>

      <div className="panel settlements-panel">
        <div className="panel-title"><div><ClipboardCheck /><span><strong>آخر التسويات</strong><small>سجل لا يمكن تعديله بعد الحفظ</small></span></div></div>
        <div className="settlement-history">
          {state.driverSettlements.slice(0, 8).map((item) => (
            <div key={item.id}>
              <span><strong>{item.driverName}</strong><small>{shortDate(item.createdAt)} · {item.orderIds.length} طلبات</small></span>
              <span><small>العهدة</small><b>{money(item.grossCollected)}</b></span>
              <span><small>المستلم</small><b>{money(item.amountReceived)}</b></span>
              <StatusBadge type={item.difference === 0 ? "success" : "warning"}>{item.difference === 0 ? "مطابقة" : `فرق ${money(item.difference)}`}</StatusBadge>
            </div>
          ))}
          {!state.driverSettlements.length && <Empty icon={<ClipboardCheck />} title="لا توجد تسويات سابقة" text="أول تسوية عهدة هتظهر هنا" />}
        </div>
      </div>

      {addingDriver && (
        <Modal title="إضافة مندوب" onClose={() => setAddingDriver(false)}>
          <div className="form-stack">
            <label>اسم المندوب<input autoFocus value={driverForm.name} onChange={(event) => setDriverForm({ ...driverForm, name: event.target.value })} /></label>
            <label>رقم الموبايل<input value={driverForm.phone} onChange={(event) => setDriverForm({ ...driverForm, phone: event.target.value })} /></label>
            <label>وسيلة التوصيل<input value={driverForm.vehicle} onChange={(event) => setDriverForm({ ...driverForm, vehicle: event.target.value })} /></label>
            <button className="primary-button" onClick={addDriver}>حفظ المندوب</button>
          </div>
        </Modal>
      )}
      {settlementDriver && (
        <DriverSettlementModal
          driver={settlementDriver}
          orders={state.orders.filter((order) => order.driverId === settlementDriver.id && order.paymentStatus === "pending" && !order.settlementId && ["out_for_delivery", "delivered"].includes(order.stage))}
          onClose={() => setSettlementDriver(null)}
          onSettle={(orders, expenses, amountReceived, note) => settle(settlementDriver, orders, expenses, amountReceived, note)}
        />
      )}
    </div>
  );
}

function DriverSettlementModal({ driver, orders, onClose, onSettle }: {
  driver: Driver;
  orders: Order[];
  onClose: () => void;
  onSettle: (orders: Order[], expenses: number, amountReceived: number, note: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState(orders.map((order) => order.id));
  const [expenses, setExpenses] = useState(0);
  const [receivedEdited, setReceivedEdited] = useState(false);
  const [amountReceived, setAmountReceived] = useState(orders.reduce((sum, order) => sum + order.total, 0));
  const [note, setNote] = useState("");
  const selected = orders.filter((order) => selectedIds.includes(order.id));
  const gross = selected.reduce((sum, order) => sum + order.total, 0);
  const expected = Math.max(0, gross - expenses);
  const received = receivedEdited ? amountReceived : expected;
  const difference = received + expenses - gross;
  const toggleOrder = (order: Order) => setSelectedIds((current) =>
    current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id]
  );
  return (
    <Modal title={`تسوية عهدة — ${driver.name}`} onClose={onClose} wide>
      <div className="settlement-modal-grid">
        <div className="settlement-orders">
          <h3>الفواتير الداخلة في التسوية</h3>
          {orders.map((order) => (
            <button className={selectedIds.includes(order.id) ? "selected" : ""} onClick={() => toggleOrder(order)} key={order.id}>
              <span className="check-box">{selectedIds.includes(order.id) && <Check />}</span>
              <span><strong>طلب #{order.number}</strong><small>{order.customerName} · {stageLabels[order.stage]}</small></span>
              <b>{money(order.total)}</b>
            </button>
          ))}
        </div>
        <div className="settlement-calculator">
          <div><span>إجمالي العهدة</span><strong>{money(gross)}</strong></div>
          <label>مصروفات تخص المندوب<input type="number" min="0" value={expenses || ""} onChange={(event) => { setExpenses(Number(event.target.value)); setReceivedEdited(false); }} /></label>
          <label>المبلغ المستلم فعليًا<input type="number" min="0" value={received} onChange={(event) => { setAmountReceived(Number(event.target.value)); setReceivedEdited(true); }} /></label>
          <label>ملاحظة<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="سبب العجز أو المصروف إن وجد" /></label>
          <div className={`settlement-difference ${difference === 0 ? "matched" : ""}`}>
            <span>فرق التسوية</span><strong>{money(difference)}</strong>
          </div>
          <button className="primary-button" disabled={!selected.length} onClick={() => onSettle(selected, expenses, received, note)}><ClipboardCheck /> اعتماد التسوية</button>
        </div>
      </div>
    </Modal>
  );
}

function CustomersView({ state, update, notify }: ViewProps) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", zone: "" });
  const customers = state.customers.filter((customer) => customer.name.includes(search) || customer.phone.includes(search));
  const add = () => {
    if (!form.name || !form.phone || !form.address) return;
    update((current) => ({ ...current, customers: [{ id: uid(), ...form, ordersCount: 0, totalSpent: 0 }, ...current.customers] }));
    setAdding(false); setForm({ name: "", phone: "", address: "", zone: "" }); notify("تم إضافة العميل");
  };
  return (
    <div className="panel">
      <div className="panel-head">
        <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الموبايل..." /></label>
        <button className="primary-button compact" onClick={() => setAdding(true)}><UserPlus /> عميل جديد</button>
      </div>
      <div className="customer-cards">
        {customers.map((customer) => (
          <article key={customer.id}>
            <div className="customer-card-head"><span className="customer-avatar">{customer.name.charAt(0)}</span><div><strong>{customer.name}</strong><small>{customer.phone}</small></div></div>
            <p>{customer.address}</p>
            <div className="customer-metrics"><span><small>عدد الطلبات</small><b>{customer.ordersCount}</b></span><span><small>إجمالي المشتريات</small><b>{money(customer.totalSpent)}</b></span></div>
          </article>
        ))}
      </div>
      {adding && <Modal title="إضافة عميل جديد" onClose={() => setAdding(false)}>
        <div className="form-stack">
          <label>اسم العميل<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>رقم الموبايل<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>المنطقة<input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} /></label>
          <label>العنوان بالتفصيل<textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <button className="primary-button" onClick={add}>حفظ العميل</button>
        </div>
      </Modal>}
    </div>
  );
}

function ProductsView({ state, update, notify }: ViewProps) {
  const toggle = (id: string) => {
    update((current) => ({ ...current, products: current.products.map((product) => product.id === id ? { ...product, available: !product.available } : product) }));
    notify("تم تحديث توفر الصنف");
  };
  return (
    <div className="panel">
      <div className="panel-title"><div><Boxes /><span><strong>قائمة الأصناف</strong><small>{state.products.filter((p) => p.available).length} صنف متاح للبيع</small></span></div></div>
      <div className="product-management">
        {state.products.map((product) => (
          <div className={product.available ? "product-manage-row" : "product-manage-row unavailable"} key={product.id}>
            <span className="color-dot" style={{ background: product.accent }} />
            <div><strong>{product.name}</strong><small>{product.section === "cooked" ? "مطبوخ" : "طازة"} · {product.category}</small></div>
            <span>{product.unit}</span><b>{money(product.price)}</b>
            <button className={product.available ? "toggle active" : "toggle"} onClick={() => toggle(product.id)}><i /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CashView({ state, update, notify }: ViewProps) {
  const [expense, setExpense] = useState(false);
  const [expenseData, setExpenseData] = useState({ amount: 0, description: "" });
  const todayTransactions = state.cashTransactions.filter((transaction) => transaction.createdAt.slice(0, 10) === todayKey());
  const cashIn = todayTransactions.filter((t) => t.direction === "in" && t.method === "cash").reduce((sum, t) => sum + t.amount, 0);
  const cashOut = todayTransactions.filter((t) => t.direction === "out" && t.method === "cash").reduce((sum, t) => sum + t.amount, 0);
  const digital = todayTransactions.filter((t) => t.direction === "in" && t.method !== "cash").reduce((sum, t) => sum + t.amount, 0);
  const actualCash = state.shiftOpeningBalance + cashIn - cashOut;
  const addExpense = () => {
    if (!expenseData.amount || !expenseData.description) return;
    update((current) => ({ ...current, cashTransactions: [{
      id: uid(), type: "expense", method: "cash", amount: expenseData.amount, direction: "out",
      description: expenseData.description, createdAt: new Date().toISOString()
    }, ...current.cashTransactions] }));
    setExpense(false); setExpenseData({ amount: 0, description: "" }); notify("تم تسجيل المصروف");
  };
  return (
    <div>
      <div className="cash-hero">
        <div><span>الرصيد النقدي المتوقع</span><strong>{money(actualCash)}</strong><small>يشمل رصيد بداية الوردية {money(state.shiftOpeningBalance)}</small></div>
        <button className="light-button" onClick={() => setExpense(true)}><Minus /> تسجيل مصروف</button>
      </div>
      <div className="stat-strip three">
        <MiniStat icon={<Banknote />} label="نقدي داخل" value={money(cashIn)} tone="green" />
        <MiniStat icon={<CreditCard />} label="تحويلات إلكترونية" value={money(digital)} tone="blue" />
        <MiniStat icon={<CircleDollarSign />} label="مصروفات" value={money(cashOut)} tone="red" />
      </div>
      <div className="panel">
        <div className="panel-title"><div><WalletCards /><span><strong>حركات الوردية</strong><small>كل عمليات الدخول والخروج</small></span></div></div>
        <div className="transactions">
          {todayTransactions.map((transaction) => (
            <div key={transaction.id}><span className={`transaction-icon ${transaction.direction}`}><Banknote /></span><div><strong>{transaction.description}</strong><small>{shortDate(transaction.createdAt)} · {paymentLabels[transaction.method as PaymentMethod] ?? "نقدي"}</small></div><b className={transaction.direction}>{transaction.direction === "in" ? "+" : "-"} {money(transaction.amount)}</b></div>
          ))}
          {!todayTransactions.length && <Empty icon={<WalletCards />} title="لا توجد حركات اليوم" text="التحصيلات والمصروفات هتظهر هنا" />}
        </div>
      </div>
      {expense && <Modal title="تسجيل مصروف" onClose={() => setExpense(false)}><div className="form-stack">
        <label>قيمة المصروف<input type="number" min="0" value={expenseData.amount || ""} onChange={(e) => setExpenseData({ ...expenseData, amount: Number(e.target.value) })} /></label>
        <label>سبب المصروف<input autoFocus value={expenseData.description} onChange={(e) => setExpenseData({ ...expenseData, description: e.target.value })} placeholder="مثال: شراء تغليف" /></label>
        <button className="primary-button" onClick={addExpense}>تسجيل المصروف</button>
      </div></Modal>}
    </div>
  );
}

function ReportsView({ state }: { state: AppState }) {
  const orders = state.orders.filter((order) => order.createdAt.slice(0, 10) === todayKey() && order.stage !== "cancelled");
  const sales = orders.reduce((sum, order) => sum + order.total, 0);
  const collected = orders.filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.total, 0);
  const pending = sales - collected;
  const expenses = state.cashTransactions.filter((t) => t.createdAt.slice(0, 10) === todayKey() && t.direction === "out").reduce((sum, t) => sum + t.amount, 0);
  const itemTotals = new Map<string, number>();
  orders.flatMap((order) => order.items).forEach((item) => itemTotals.set(item.name, (itemTotals.get(item.name) ?? 0) + item.quantity));
  const topItems = [...itemTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(1, ...topItems.map((item) => item[1]));
  const methodTotal = (method: PaymentMethod) => orders.filter((order) => order.paymentMethod === method).reduce((sum, order) => sum + order.total, 0);
  const todaySettlements = state.driverSettlements.filter((item) => item.createdAt.slice(0, 10) === todayKey());
  return (
    <div>
      <div className="report-heading"><div><span>ملخص أداء اليوم</span><strong>{money(sales)}</strong><small>إجمالي قيمة المبيعات</small></div><div className="report-ring"><span>{orders.length}</span><small>طلب</small></div></div>
      <div className="stat-strip">
        <MiniStat icon={<Check />} label="تم تحصيله" value={money(collected)} tone="green" />
        <MiniStat icon={<Clock3 />} label="معلق" value={money(pending)} tone="orange" />
        <MiniStat icon={<CircleDollarSign />} label="مصروفات" value={money(expenses)} tone="red" />
        <MiniStat icon={<BarChart3 />} label="متوسط الطلب" value={money(orders.length ? sales / orders.length : 0)} tone="blue" />
      </div>
      <div className="report-grid">
        <div className="panel">
          <div className="panel-title"><div><BarChart3 /><span><strong>الأصناف الأكثر طلبًا</strong><small>بالكميات المباعة اليوم</small></span></div></div>
          <div className="bar-list">
            {topItems.map(([name, quantity], index) => <div key={name}><span>{index + 1}</span><strong>{name}</strong><div><i style={{ width: `${(quantity / max) * 100}%` }} /></div><b>{quantity}</b></div>)}
            {!topItems.length && <Empty icon={<BarChart3 />} title="لا توجد مبيعات اليوم" text="التحليل هيظهر بعد تسجيل الطلبات" />}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title"><div><CreditCard /><span><strong>المبيعات حسب الدفع</strong><small>قيمة الطلبات وليس حركة الخزنة</small></span></div></div>
          <div className="payment-breakdown">
            <div><span className="method-icon cash"><Banknote /></span><span><strong>نقدي</strong><small>{orders.filter((o) => o.paymentMethod === "cash").length} طلبات</small></span><b>{money(methodTotal("cash"))}</b></div>
            <div><span className="method-icon insta"><CreditCard /></span><span><strong>إنستاباي</strong><small>{orders.filter((o) => o.paymentMethod === "instapay").length} طلبات</small></span><b>{money(methodTotal("instapay"))}</b></div>
            <div><span className="method-icon voda"><Phone /></span><span><strong>فودافون كاش</strong><small>{orders.filter((o) => o.paymentMethod === "vodafone").length} طلبات</small></span><b>{money(methodTotal("vodafone"))}</b></div>
          </div>
        </div>
      </div>
      <div className="panel delivery-report">
        <div className="panel-title"><div><Bike /><span><strong>أداء التوصيل والمندوبين</strong><small>التسليمات والعهد المحصلة اليوم</small></span></div></div>
        <div className="delivery-report-grid">
          <div><small>طلبات تم توصيلها</small><strong>{orders.filter((order) => order.stage === "delivered").length}</strong></div>
          <div><small>رسوم التوصيل</small><strong>{money(orders.reduce((sum, order) => sum + order.deliveryFee, 0))}</strong></div>
          <div><small>عهد تم استلامها</small><strong>{money(todaySettlements.reduce((sum, item) => sum + item.amountReceived, 0))}</strong></div>
          <div><small>فروق التسويات</small><strong>{money(todaySettlements.reduce((sum, item) => sum + item.difference, 0))}</strong></div>
        </div>
        <div className="driver-performance">
          {state.drivers.map((driver) => {
            const delivered = orders.filter((order) => order.driverId === driver.id && order.stage === "delivered").length;
            const settlements = todaySettlements.filter((item) => item.driverId === driver.id);
            return <div key={driver.id}><span className="driver-avatar"><Bike /></span><span><strong>{driver.name}</strong><small>{delivered} توصيلات · {settlements.length} تسويات</small></span><b>{money(settlements.reduce((sum, item) => sum + item.amountReceived, 0))}</b></div>;
          })}
        </div>
      </div>
    </div>
  );
}

interface ViewProps {
  state: AppState;
  update: (updater: (current: AppState) => AppState) => void;
  notify: (message: string) => void;
}

function MiniStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return <div className={`mini-stat ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function StatusBadge({ children, type }: { children: ReactNode; type: "success" | "warning" | "info" | "neutral" }) {
  return <span className={`status-badge ${type}`}>{children}</span>;
}

function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state wide">{icon}<strong>{title}</strong><span>{text}</span></div>;
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={wide ? "modal wide" : "modal"}>
        <header><h2>{title}</h2><button onClick={onClose}><X /></button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
