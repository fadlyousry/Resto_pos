import { useEffect, useState, type ReactNode } from "react";
import {
  Banknote, BarChart3, Bike, Calculator, CalendarRange, Check,
  ChevronDown, ChevronLeft, CircleDollarSign, ClipboardCheck, Clock3, CookingPot, CreditCard,
  Edit3, Info, MapPin, MessageCircle, Minus, PackageCheck, Phone, Plus, Printer,
  ReceiptText, Save, Search, ShoppingBag, Trash2, Truck, UserPlus,
  Utensils, WalletCards, X
} from "lucide-react";
import type {
  AppState, CashTransaction, Customer, Driver, DriverSettlement, Order, OrderItem,
  OrderStage, PaymentMethod, Product, ProductSection
} from "../../domain/types";
import { CustomerFile } from "./management";
import type { ViewProps } from "../../shared/contracts";
import {
  dateKey, money, paymentLabels, shortDate, stageLabels, todayKey
} from "../../shared/format";
import { uid } from "../../shared/id";
import { Empty, MiniStat, Modal, StatusBadge } from "../../shared/ui";

export function PosView({ state, update, notify, editingOrder, onEditOrder, onFinishEditing }: ViewProps & {
  editingOrder: Order | null;
  onEditOrder: (order: Order) => void;
  onFinishEditing: () => void;
}) {
  const [section, setSection] = useState<ProductSection>("cooked");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("الكل");
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [showCustomers, setShowCustomers] = useState(false);
  const [customerCandidate, setCustomerCandidate] = useState<Customer | null>(null);
  const [customerRegistrationOpen, setCustomerRegistrationOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", zone: "", address: "", notes: "" });
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [checkout, setCheckout] = useState(false);

  useEffect(() => {
    if (!editingOrder) return;
    const savedCustomer = state.customers.find((item) => item.id === editingOrder.customerId);
    const firstSection = editingOrder.items[0]?.section
      ?? state.products.find((product) => product.id === editingOrder.items[0]?.productId)?.section;
    setCart(editingOrder.items.map((item) => ({ ...item })));
    setCustomer(savedCustomer ?? {
      id: editingOrder.customerId,
      name: editingOrder.customerName,
      phone: editingOrder.customerPhone,
      address: editingOrder.address,
      zone: "",
      ordersCount: 1,
      totalSpent: editingOrder.total
    });
    if (firstSection) setSection(firstSection);
    setCategory("الكل");
    setSearch("");
    setCheckout(false);
    setShowCustomers(false);
    setHistoryCustomer(null);
  }, [editingOrder?.id]);

  const products = state.products.filter((product) =>
    product.section === section && product.available &&
    (category === "الكل" || product.category === category) &&
    product.name.includes(search.trim())
  );
  const categories = ["الكل", ...new Set(state.products.filter((product) => product.section === section).map((product) => product.category))];
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0);
  const normalizedCustomerQuery = customerQuery.trim().toLocaleLowerCase("ar");
  const customerResults = state.customers.filter((item) =>
    item.name.toLocaleLowerCase("ar").includes(normalizedCustomerQuery) ||
    item.phone.replace(/\s/g, "").includes(normalizedCustomerQuery.replace(/\s/g, ""))
  ).slice(0, 5);
  const customerNotFound = normalizedCustomerQuery.length >= 2 && customerResults.length === 0;

  const openCustomerPicker = () => {
    setCustomerQuery("");
    setCustomerCandidate(null);
    setCustomerRegistrationOpen(false);
    setCustomerForm({ name: "", phone: "", zone: "", address: "", notes: "" });
    setShowCustomers(true);
  };
  const changeCustomerSearch = (value: string) => {
    setCustomerQuery(value);
    setCustomerCandidate(null);
    setCustomerRegistrationOpen(false);
    const looksLikePhone = /^[\d+\s-]+$/.test(value.trim());
    setCustomerForm((current) => ({
      ...current,
      name: looksLikePhone ? "" : value,
      phone: looksLikePhone ? value.replace(/[^\d+]/g, "") : ""
    }));
  };
  const confirmExistingCustomer = () => {
    if (!customerCandidate?.name.trim() || !customerCandidate.phone.trim() || !customerCandidate.address.trim()) return;
    update((current) => ({
      ...current,
      customers: current.customers.map((item) => item.id === customerCandidate.id ? customerCandidate : item)
    }));
    setCustomer(customerCandidate);
    setShowCustomers(false);
    notify("تم اختيار العميل وعنوان التوصيل");
  };
  const registerCustomerFromSearch = () => {
    if (!customerForm.name.trim() || !customerForm.phone.trim() || !customerForm.address.trim()) return;
    const item: Customer = {
      id: uid(), ...customerForm, name: customerForm.name.trim(), phone: customerForm.phone.trim(),
      address: customerForm.address.trim(), zone: customerForm.zone.trim(),
      ordersCount: 0, totalSpent: 0
    };
    update((current) => ({ ...current, customers: [item, ...current.customers] }));
    setCustomer(item);
    setShowCustomers(false);
    notify("تم تسجيل العميل واختياره للطلب");
  };

  const addProduct = (product: Product) => {
    setCart((current) => {
      const exists = current.find((item) => item.productId === product.id);
      return exists
        ? current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { productId: product.id, name: product.name, unit: product.unit, price: product.price, cost: product.cost, quantity: 1, section: product.section }];
    });
  };

  const setQuantity = (productId: string, delta: number) => {
    setCart((current) => current
      .map((item) => item.productId === productId ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0));
  };

  const saveEditedOrder = (details: CheckoutDetails) => {
    if (!customer || !editingOrder) return;
    const createdAt = new Date().toISOString();
    const total = Math.max(0, subtotal + details.deliveryFee - details.discount);
    const oldUsage = editingOrder.inventoryDeducted === false
      ? new Map<string, number>()
      : orderRecipeUsage(editingOrder.items, state);
    const newUsage = orderRecipeUsage(cart, state);
    const totalDifference = total - editingOrder.total;
    const paymentTransactions: CashTransaction[] = [];

    if (editingOrder.paymentStatus === "pending" && details.paymentStatus === "paid") {
      paymentTransactions.push({
        id: uid(), type: "collection", method: details.paymentMethod, amount: total, direction: "in",
        description: `تحصيل بعد تعديل فاتورة #${editingOrder.number}`, orderId: editingOrder.id, createdAt
      });
    } else if (editingOrder.paymentStatus === "paid" && details.paymentStatus === "pending") {
      paymentTransactions.push({
        id: uid(), type: "withdrawal", method: editingOrder.paymentMethod, amount: editingOrder.total, direction: "out",
        description: `عكس تحصيل فاتورة #${editingOrder.number}`, orderId: editingOrder.id, createdAt
      });
    } else if (editingOrder.paymentStatus === "paid" && details.paymentStatus === "paid") {
      if (editingOrder.paymentMethod !== details.paymentMethod) {
        paymentTransactions.push(
          {
            id: uid(), type: "withdrawal", method: editingOrder.paymentMethod, amount: editingOrder.total, direction: "out",
            description: `عكس طريقة دفع فاتورة #${editingOrder.number}`, orderId: editingOrder.id, createdAt
          },
          {
            id: uid(), type: "deposit", method: details.paymentMethod, amount: total, direction: "in",
            description: `إعادة تسجيل دفع فاتورة #${editingOrder.number}`, orderId: editingOrder.id, createdAt
          }
        );
      } else if (totalDifference !== 0) {
        paymentTransactions.push({
          id: uid(), type: totalDifference > 0 ? "deposit" : "withdrawal",
          method: details.paymentMethod, amount: Math.abs(totalDifference),
          direction: totalDifference > 0 ? "in" : "out",
          description: `فرق تعديل فاتورة #${editingOrder.number}`, orderId: editingOrder.id, createdAt
        });
      }
    }

    const updatedOrder: Order = {
      ...editingOrder,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      address: customer.address,
      items: cart,
      subtotal,
      deliveryFee: details.deliveryFee,
      discount: details.discount,
      total,
      paymentMethod: details.paymentMethod,
      paymentStatus: details.paymentStatus,
      scheduledFor: details.scheduledFor || undefined,
      note: details.note || undefined,
      driverId: details.driverId,
      driver: details.driver,
      deliveryCompanyId: details.deliveryCompanyId,
      deliveryCompany: details.deliveryCompany,
      inventoryDeducted: newUsage.size > 0
    };

    update((current) => {
      const movementIngredients = [...new Set([...oldUsage.keys(), ...newUsage.keys()])];
      const stockAdjustments = movementIngredients.flatMap((ingredientId) => {
        const delta = (newUsage.get(ingredientId) ?? 0) - (oldUsage.get(ingredientId) ?? 0);
        if (!delta) return [];
        const ingredient = current.ingredients.find((item) => item.id === ingredientId);
        return [{
          id: uid(),
          ingredientId,
          ingredientName: ingredient?.name ?? "مكون",
          type: delta > 0 ? "consume" as const : "adjustment" as const,
          quantity: Math.abs(delta),
          unitCost: ingredient?.unitCost ?? 0,
          description: `تسوية تعديل طلب #${editingOrder.number}`,
          orderId: editingOrder.id,
          createdAt
        }];
      });

      return {
        ...current,
        orders: current.orders.map((order) => order.id === editingOrder.id ? updatedOrder : order),
        ingredients: current.ingredients.map((ingredient) => {
          const delta = (newUsage.get(ingredient.id) ?? 0) - (oldUsage.get(ingredient.id) ?? 0);
          return { ...ingredient, stockQty: Math.max(0, ingredient.stockQty - delta) };
        }),
        stockMovements: [...stockAdjustments, ...current.stockMovements],
        customers: current.customers.map((item) => {
          if (editingOrder.customerId === customer.id && item.id === customer.id) {
            return { ...item, totalSpent: Math.max(0, item.totalSpent + totalDifference) };
          }
          if (item.id === editingOrder.customerId) {
            return {
              ...item,
              ordersCount: Math.max(0, item.ordersCount - 1),
              totalSpent: Math.max(0, item.totalSpent - editingOrder.total)
            };
          }
          if (item.id === customer.id) {
            return {
              ...item,
              ordersCount: item.ordersCount + 1,
              totalSpent: item.totalSpent + total,
              lastOrder: editingOrder.createdAt
            };
          }
          return item;
        }),
        cashTransactions: [...paymentTransactions, ...current.cashTransactions]
      };
    });

    setCart([]);
    setCustomer(null);
    setCheckout(false);
    notify(`تم تعديل الطلب #${editingOrder.number} وتسوية الحساب والمخزون`);
    onFinishEditing();
  };

  const completeOrder = (details: CheckoutDetails) => {
    if (!customer) return;
    if (editingOrder) {
      saveEditedOrder(details);
      return;
    }
    const createdAt = new Date().toISOString();
    const total = Math.max(0, subtotal + details.deliveryFee - details.discount);
    const orderId = uid();
    const consumption = new Map<string, number>();
    cart.forEach((item) => state.recipes.filter((recipe) => recipe.productId === item.productId).forEach((recipe) => {
      consumption.set(recipe.ingredientId, (consumption.get(recipe.ingredientId) ?? 0) + recipe.quantity * item.quantity);
    }));
    const stockMovements = [...consumption.entries()].map(([ingredientId, quantity]) => {
      const ingredient = state.ingredients.find((item) => item.id === ingredientId)!;
      return {
        id: uid(), ingredientId, ingredientName: ingredient?.name ?? "مكون",
        type: "consume" as const, quantity, unitCost: ingredient?.unitCost ?? 0,
        description: `استهلاك طلب #${state.nextOrderNumber}`, orderId, createdAt
      };
    });
    const order: Order = {
      id: orderId, number: state.nextOrderNumber, customerId: customer.id,
      customerName: customer.name, customerPhone: customer.phone, address: customer.address,
      items: cart, subtotal, deliveryFee: details.deliveryFee, discount: details.discount, total,
      paymentMethod: details.paymentMethod, paymentStatus: details.paymentStatus,
      stage: "confirmed", createdAt, scheduledFor: details.scheduledFor || undefined, note: details.note || undefined,
      driverId: details.driverId, driver: details.driver,
      deliveryCompanyId: details.deliveryCompanyId, deliveryCompany: details.deliveryCompany,
      inventoryDeducted: stockMovements.length > 0, source: "pos"
    };
    const transaction: CashTransaction | null = details.paymentStatus === "paid" ? {
      id: uid(), type: "sale", method: details.paymentMethod, amount: total, direction: "in",
      description: `فاتورة #${order.number}`, orderId, createdAt
    } : null;
    update((current) => ({
      ...current,
      orders: [order, ...current.orders],
      ingredients: current.ingredients.map((ingredient) => ({
        ...ingredient, stockQty: Math.max(0, ingredient.stockQty - (consumption.get(ingredient.id) ?? 0))
      })),
      stockMovements: [...stockMovements, ...current.stockMovements],
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
        {editingOrder && <div className="pos-edit-banner">
          <ClipboardCheck />
          <span>
            <strong>تعديل الطلب #{editingOrder.number}</strong>
            <small>عدّل العميل أو الأصناف ثم راجع بيانات الدفع واحفظ التعديل</small>
          </span>
          <button onClick={() => {
            setCart([]);
            setCustomer(null);
            setCheckout(false);
            onFinishEditing();
          }}>إلغاء التعديل والرجوع</button>
        </div>}
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
        <div className="cart-title">
          <div className="cart-heading">
            <span className="cart-heading-icon"><ShoppingBag /></span>
            <span><b>{editingOrder ? "تعديل الطلب" : "الطلب الحالي"}</b><small>{cart.length ? `${cart.length} صنف · ${totalUnits} وحدة` : "ابدأ بإضافة الأصناف"}</small></span>
            <strong>#{editingOrder?.number ?? state.nextOrderNumber}</strong>
          </div>
          <button className="clear-cart-button" title="تفريغ السلة" onClick={() => setCart([])} disabled={!cart.length}><Trash2 size={18} /></button>
        </div>
        <div className="customer-picker">
          {customer ? (
            <div className="selected-customer">
              <span className="customer-avatar">{customer.name.charAt(0)}</span>
              <div><strong>{customer.name}</strong><small><Phone size={12} /> {customer.phone}</small><p>{customer.address}</p></div>
              <span className="selected-customer-actions">
                <button title="تعديل عنوان التوصيل" onClick={() => { setCustomerCandidate({ ...customer }); setShowCustomers(true); }}><MapPin size={16} /></button>
                <button title="إلغاء اختيار العميل" onClick={() => setCustomer(null)}><X size={17} /></button>
              </span>
            </div>
          ) : (
            <button className="select-customer" onClick={openCustomerPicker}><UserPlus size={19} /> اختيار العميل وعنوان التوصيل <ChevronLeft size={18} /></button>
          )}
        </div>
        <div className="cart-items">
          {cart.length > 0 && <div className="cart-table-head"><span>الصنف</span><span>الكمية</span><span>الإجمالي</span><span /></div>}
          {cart.map((item) => (
            <div className="cart-item" key={item.productId}>
              <div className="cart-product-cell">
                <strong>{item.name}</strong>
                <small>{item.unit} · {money(item.price)}</small>
              </div>
              <div className="quantity">
                <button onClick={() => setQuantity(item.productId, -1)}><Minus size={15} /></button>
                <span>{item.quantity}</span>
                <button onClick={() => setQuantity(item.productId, 1)}><Plus size={15} /></button>
              </div>
              <b className="cart-line-total">{money(item.price * item.quantity)}</b>
              <button className="remove-cart-item" title="حذف الصنف" onClick={() => setQuantity(item.productId, -item.quantity)}><Trash2 /></button>
            </div>
          ))}
          {!cart.length && <div className="empty-cart"><ShoppingBag size={44} /><strong>الطلب لسه فاضي</strong><span>اختار الأصناف من المنيو</span></div>}
        </div>
        <div className="cart-summary">
          <span className="cart-summary-title">ملخص الطلب</span>
          <div><span>عدد الوحدات</span><b>{totalUnits}</b></div>
          <div className="cart-total-row"><span>الإجمالي المبدئي</span><strong>{money(subtotal)}</strong></div>
          <button className="primary-button checkout-button" disabled={!cart.length || !customer} onClick={() => setCheckout(true)}>
            {editingOrder ? "مراجعة وحفظ التعديل" : "متابعة الدفع"} <span>{money(subtotal)}</span>
          </button>
          {!customer && cart.length > 0 && <small className="hint">اختار العميل الأول لإكمال الطلب</small>}
        </div>
      </aside>

      {showCustomers && (
        <Modal title="اختيار العميل" onClose={() => setShowCustomers(false)} size="medium">
          {!customerCandidate && <label className="search-box modal-search"><Search size={18} /><input
            autoFocus
            value={customerQuery}
            onChange={(event) => changeCustomerSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && customerNotFound && !event.nativeEvent.isComposing) {
                event.preventDefault();
                setCustomerRegistrationOpen(true);
              }
            }}
            placeholder="ابحث بالاسم أو رقم الموبايل..."
          /></label>}

          {customerCandidate ? (
            <div className="customer-address-step" onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                !(event.target instanceof HTMLButtonElement)
              ) {
                event.preventDefault();
                confirmExistingCustomer();
              }
            }}>
              <button className="back-to-results" onClick={() => setCustomerCandidate(null)}><ChevronLeft /> الرجوع لنتائج البحث</button>
              <div className="customer-address-head">
                <span className="customer-avatar">{customerCandidate.name.charAt(0)}</span>
                <span><strong>{customerCandidate.name}</strong><small>{customerCandidate.phone}</small></span>
              </div>
              <div className="inline-customer-form">
                <label>اسم العميل<input value={customerCandidate.name} onChange={(event) => setCustomerCandidate({ ...customerCandidate, name: event.target.value })} /></label>
                <label>رقم الهاتف<input value={customerCandidate.phone} onChange={(event) => setCustomerCandidate({ ...customerCandidate, phone: event.target.value })} /></label>
                <label className="full-field">العنوان بالتفصيل<textarea autoFocus value={customerCandidate.address} onChange={(event) => setCustomerCandidate({ ...customerCandidate, address: event.target.value })} placeholder="اكتب عنوان التوصيل بالتفصيل" /></label>
              </div>
              <p className="address-save-note"><MapPin /> العنوان المعدل هيُحفظ في ملف العميل ويُستخدم للطلب الحالي.</p>
              <button className="primary-button customer-confirm-button" onClick={confirmExistingCustomer}>
                <Check /> تأكيد العميل والعنوان
              </button>
            </div>
          ) : customerNotFound && customerRegistrationOpen ? (
            <div className="customer-inline-register">
              <div className="not-found-title"><UserPlus /><span><strong>العميل غير مسجل</strong><small>كمّل البيانات علشان يتسجل ويتضاف للطلب</small></span></div>
              <div className="inline-customer-form">
                <label>اسم العميل<input autoFocus={!customerForm.name} value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} /></label>
                <label>رقم الهاتف<input autoFocus={!customerForm.phone} value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></label>
                <label className="full-field">العنوان بالتفصيل<textarea value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} placeholder="اكتب عنوان التوصيل بالتفصيل" /></label>
              </div>
              <button className="primary-button customer-confirm-button" onClick={registerCustomerFromSearch}><UserPlus /> تسجيل واختيار العميل</button>
            </div>
          ) : (
            <div className="customer-results">
              {customerResults.map((item) => {
                const orderCount = Math.max(item.ordersCount, state.orders.filter((order) => order.customerId === item.id).length);
                return <div className="customer-result-item" role="button" tabIndex={0} key={item.id} onClick={() => setCustomerCandidate({ ...item })} onKeyDown={(event) => event.key === "Enter" && setCustomerCandidate({ ...item })}>
                  <span className="customer-avatar">{item.name.charAt(0)}</span>
                  <div><strong>{item.name}</strong><small>{item.phone}</small><p>{item.address}</p></div>
                  <span className="customer-result-actions">
                    {orderCount > 0 && <em>{orderCount === 1 ? "طلب واحد" : `${orderCount} طلبات`}</em>}
                    <button title="فتح سجل العميل" onClick={(event) => {
                      event.stopPropagation();
                      setHistoryCustomer({ ...item });
                      setShowCustomers(false);
                    }}><Info /></button>
                    <ChevronLeft />
                  </span>
                </div>;
              })}
              {customerNotFound && <div className="customer-enter-hint">
                <UserPlus />
                <span><strong>العميل غير موجود</strong><small>اضغط Enter لتسجيله كعميل جديد</small></span>
                <kbd>Enter ↵</kbd>
              </div>}
            </div>
          )}
        </Modal>
      )}
      {historyCustomer && <CustomerFile
        customer={historyCustomer}
        state={state}
        onClose={() => { setHistoryCustomer(null); setShowCustomers(true); }}
        onEdit={(item) => {
          update((current) => ({
            ...current,
            customers: current.customers.map((customerItem) => customerItem.id === item.id ? item : customerItem),
            orders: current.orders.map((order) => order.customerId === item.id ? { ...order, customerName: item.name, customerPhone: item.phone, address: item.address } : order)
          }));
          setHistoryCustomer(item);
          setCustomer((current) => current?.id === item.id ? item : current);
          notify("تم تحديث بيانات العميل");
        }}
        onOrder={(order) => {
          setHistoryCustomer(null);
          setShowCustomers(false);
          onEditOrder(order);
        }}
      />}
      {checkout && customer && <CheckoutModal subtotal={subtotal} customer={customer} editingOrder={editingOrder} drivers={state.drivers} companies={state.deliveryCompanies} defaultFee={state.settings.defaultDeliveryFee} onClose={() => setCheckout(false)} onComplete={completeOrder} />}
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
  driverId?: string;
  driver?: string;
  deliveryCompanyId?: string;
  deliveryCompany?: string;
}

function CheckoutModal({ subtotal, customer, editingOrder, drivers, companies, defaultFee, onClose, onComplete }: {
  subtotal: number; customer: Customer; drivers: AppState["drivers"];
  editingOrder?: Order | null; companies: AppState["deliveryCompanies"]; defaultFee: number;
  onClose: () => void; onComplete: (details: CheckoutDetails) => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(editingOrder?.paymentMethod ?? "cash");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">(editingOrder?.paymentStatus ?? "pending");
  const [deliveryFee, setDeliveryFee] = useState(editingOrder?.deliveryFee ?? defaultFee);
  const [manualDiscount, setManualDiscount] = useState(editingOrder?.discount ?? 0);
  const [scheduledFor, setScheduledFor] = useState(editingOrder?.scheduledFor?.slice(0, 16) ?? "");
  const [note, setNote] = useState(editingOrder?.note ?? "");
  const [deliveryType, setDeliveryType] = useState<"later" | "driver" | "company">(
    editingOrder?.driverId ? "driver" : editingOrder?.deliveryCompanyId ? "company" : "later"
  );
  const [deliveryId, setDeliveryId] = useState(editingOrder?.driverId ?? editingOrder?.deliveryCompanyId ?? "");

  const discount = manualDiscount;
  const total = Math.max(0, subtotal + deliveryFee - discount);

  return (
    <Modal title={editingOrder ? `مراجعة تعديل الطلب #${editingOrder.number}` : "تأكيد الطلب والدفع"} onClose={onClose} size="wide">
      <div className="checkout-grid">
        <div className="checkout-main-fields">
          {/* Customer info header */}
          <div className="checkout-customer-banner">
            <span className="customer-avatar-badge">{customer.name.charAt(0)}</span>
            <div className="customer-banner-info">
              <strong>{customer.name}</strong>
              <div className="customer-banner-meta">
                <span><MapPin size={13} /> {customer.address || "بدون عنوان مخصص"}</span>
                {customer.phone && <span><Phone size={13} /> {customer.phone}</span>}
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="checkout-section">
            <h3 className="section-title"><CreditCard size={16} /> طريقة الدفع</h3>
            <div className="payment-options">
              <PaymentOption
                active={paymentMethod === "cash"}
                icon={<Banknote size={24} />}
                label="نقدي"
                method="cash"
                onClick={() => setPaymentMethod("cash")}
              />
              <PaymentOption
                active={paymentMethod === "instapay"}
                icon={<WalletCards size={24} />}
                label="إنستاباي"
                method="instapay"
                onClick={() => { setPaymentMethod("instapay"); setPaymentStatus("paid"); }}
              />
              <PaymentOption
                active={paymentMethod === "vodafone"}
                icon={<Phone size={24} />}
                label="فودافون كاش"
                method="vodafone"
                onClick={() => { setPaymentMethod("vodafone"); setPaymentStatus("paid"); }}
              />
            </div>
          </div>

          {/* Payment Status */}
          <div className="checkout-section">
            <h3 className="section-title"><Clock3 size={16} /> حالة التحصيل</h3>
            <div className="status-options">
              <button
                type="button"
                className={paymentStatus === "paid" ? "active paid" : ""}
                onClick={() => setPaymentStatus("paid")}
              >
                <Check size={18} />
                <span>تم التحصيل فوراً</span>
              </button>
              <button
                type="button"
                className={paymentStatus === "pending" ? "active pending" : ""}
                onClick={() => setPaymentStatus("pending")}
              >
                <Clock3 size={18} />
                <span>معلق مع الدليفري</span>
              </button>
            </div>
          </div>

          {/* Delivery Target */}
          <div className="checkout-section">
            <h3 className="section-title"><Truck size={16} /> جهة التوصيل</h3>
            <div className="delivery-choice">
              <button
                type="button"
                className={deliveryType === "later" ? "active" : ""}
                onClick={() => { setDeliveryType("later"); setDeliveryId(""); }}
              >
                <Clock3 size={18} />
                <span>تحديد لاحقاً</span>
              </button>
              <button
                type="button"
                className={deliveryType === "driver" ? "active" : ""}
                onClick={() => { setDeliveryType("driver"); setDeliveryId(drivers.find((item) => item.active)?.id ?? ""); }}
              >
                <Bike size={18} />
                <span>مندوب المطعم</span>
              </button>
              <button
                type="button"
                className={deliveryType === "company" ? "active" : ""}
                onClick={() => {
                  setDeliveryType("company");
                  const company = companies.find((item) => item.active);
                  setDeliveryId(company?.id ?? "");
                  if (company) setDeliveryFee(company.baseFee);
                }}
              >
                <Truck size={18} />
                <span>شركة توصيل</span>
              </button>
            </div>

            {deliveryType === "driver" && (
              <label className="delivery-select">
                <span>اختيار المندوب</span>
                <select value={deliveryId} onChange={(event) => setDeliveryId(event.target.value)}>
                  <option value="">اختر مندوب التوصيل...</option>
                  {drivers.filter((item) => item.active).map((item) => (
                    <option value={item.id} key={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
            )}

            {deliveryType === "company" && (
              <label className="delivery-select">
                <span>اختيار الشركة</span>
                <select value={deliveryId} onChange={(event) => {
                  setDeliveryId(event.target.value);
                  const company = companies.find((item) => item.id === event.target.value);
                  if (company) setDeliveryFee(company.baseFee);
                }}>
                  <option value="">اختر شركة التوصيل...</option>
                  {companies.filter((item) => item.active).map((item) => (
                    <option value={item.id} key={item.id}>{item.name} — {money(item.baseFee)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Schedule & Notes */}
          <div className="form-row">
            <label>
              <span>موعد التوصيل</span>
              <input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} />
            </label>
            <label>
              <span>ملاحظات الطلب</span>
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثال: الاتصال قبل الوصول بـ 10 دقائق" />
            </label>
          </div>
        </div>

        {/* Right/Summary Card */}
        <div className="total-card">
          <div className="total-card-top">
            <div className="total-card-header">
              <ReceiptText size={22} />
              <h3>ملخص الحساب</h3>
            </div>

            <div className="summary-line">
              <span>قيمة الأصناف</span>
              <b>{money(subtotal)}</b>
            </div>

            <div className="summary-line input-line">
              <span>مصاريف التوصيل</span>
              <div className="currency-input-wrapper">
                <input
                  type="number"
                  min="0"
                  value={deliveryFee}
                  onChange={(event) => setDeliveryFee(Math.max(0, Number(event.target.value)))}
                />
              </div>
            </div>

            <div className="summary-line input-line">
              <span>خصم يدوي</span>
              <div className="currency-input-wrapper">
                <input
                  type="number"
                  min="0"
                  value={manualDiscount}
                  onChange={(event) => setManualDiscount(Math.max(0, Number(event.target.value)))}
                />
              </div>
            </div>
          </div>

          <div className="total-card-bottom">
            <hr />

            <div className="grand-total">
              <span>الإجمالي النهائي</span>
              <strong>{money(total)}</strong>
            </div>

            <button className="primary-button checkout-submit-btn" onClick={() => {
              const driver = deliveryType === "driver" ? drivers.find((item) => item.id === deliveryId) : undefined;
              const company = deliveryType === "company" ? companies.find((item) => item.id === deliveryId) : undefined;
              onComplete({
                paymentMethod,
                paymentStatus,
                deliveryFee,
                discount: manualDiscount,
                scheduledFor,
                note,
                driverId: driver?.id,
                driver: driver?.name,
                deliveryCompanyId: company?.id,
                deliveryCompany: company?.name
              });
            }}>
              <PackageCheck size={22} />
              <span>{editingOrder ? "حفظ تعديل الطلب" : "تأكيد الطلب والدفع"}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PaymentOption({ active, icon, label, method, onClick }: {
  active: boolean; icon: ReactNode; label: string; method: string; onClick: () => void;
}) {
  return (
    <button type="button" className={`payment-card ${method} ${active ? "active" : ""}`} onClick={onClick}>
      <span className="payment-icon">{icon}</span>
      <span className="payment-label">{label}</span>
      {active && <span className="option-check-badge"><Check size={12} /></span>}
    </button>
  );
}

function orderRecipeUsage(items: OrderItem[], state: AppState) {
  const usage = new Map<string, number>();
  items.forEach((item) => {
    state.recipes
      .filter((recipe) => recipe.productId === item.productId)
      .forEach((recipe) => {
        usage.set(recipe.ingredientId, (usage.get(recipe.ingredientId) ?? 0) + recipe.quantity * item.quantity);
      });
  });
  return usage;
}

type OrderDatePreset = "all" | "today" | "yesterday" | "last7" | "month" | "custom";

export function OrdersView({ state, update, notify, onEditOrder }: ViewProps & { onEditOrder: (order: Order) => void }) {
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "scheduled" | "delivered">("all");
  const [search, setSearch] = useState("");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<OrderDatePreset>("today");
  const [dateFrom, setDateFrom] = useState<string>(todayKey);
  const [dateTo, setDateTo] = useState<string>(todayKey);
  const [draftDatePreset, setDraftDatePreset] = useState<OrderDatePreset>("today");
  const [draftDateFrom, setDraftDateFrom] = useState<string>(todayKey);
  const [draftDateTo, setDraftDateTo] = useState<string>(todayKey);
  const [invoice, setInvoice] = useState<Order | null>(null);
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const normalizedSearch = search.trim().toLocaleLowerCase("ar");
  const searchDigits = normalizedSearch.replace(/\D/g, "");
  const searchOrderNumber = normalizedSearch.replace("#", "").trim();
  const displayFilterDate = (value: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    day: "numeric", month: "short", year: "numeric"
  }).format(new Date(`${value}T12:00:00`));
  const dateFilterLabel = datePreset === "all" ? "كل التواريخ"
    : datePreset === "today" ? "اليوم"
      : datePreset === "yesterday" ? "أمس"
        : datePreset === "last7" ? "آخر 7 أيام"
          : datePreset === "month" ? "هذا الشهر"
            : dateFrom && dateTo ? `${displayFilterDate(dateFrom)} – ${displayFilterDate(dateTo)}`
              : dateFrom ? `من ${displayFilterDate(dateFrom)}` : dateTo ? `حتى ${displayFilterDate(dateTo)}` : "فترة مخصصة";
  const selectDatePreset = (preset: Exclude<OrderDatePreset, "all" | "custom">) => {
    const today = new Date();
    let from = "";
    let to = "";
    if (preset === "today") from = to = dateKey(today);
    if (preset === "yesterday") {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      from = to = dateKey(yesterday);
    }
    if (preset === "last7") {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      from = dateKey(start);
      to = dateKey(today);
    }
    if (preset === "month") {
      from = dateKey(new Date(today.getFullYear(), today.getMonth(), 1));
      to = dateKey(today);
    }
    setDraftDatePreset(preset);
    setDraftDateFrom(from);
    setDraftDateTo(to);
  };
  const toggleDateFilter = () => {
    if (!dateFilterOpen) {
      setDraftDatePreset(datePreset);
      setDraftDateFrom(dateFrom);
      setDraftDateTo(dateTo);
    }
    setDateFilterOpen((open) => !open);
  };
  const applyDateFilter = () => {
    const hasDate = Boolean(draftDateFrom || draftDateTo);
    setDatePreset(hasDate ? (draftDatePreset === "all" ? "custom" : draftDatePreset) : "all");
    setDateFrom(draftDateFrom);
    setDateTo(draftDateTo);
    setDateFilterOpen(false);
  };
  const clearDateFilter = () => {
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
    setDraftDatePreset("all");
    setDraftDateFrom("");
    setDraftDateTo("");
    setDateFilterOpen(false);
  };
  const filtered = state.orders.filter((order) => {
    const matchesFilter =
      filter === "pending" ? order.paymentStatus === "pending" && order.stage !== "cancelled"
        : filter === "active" ? !["delivered", "cancelled"].includes(order.stage)
          : filter === "scheduled" ? Boolean(order.scheduledFor) && new Date(order.scheduledFor!).getTime() > Date.now()
            : filter === "delivered" ? order.stage === "delivered"
              : true;
    const matchesSearch = !normalizedSearch
      || order.customerName.toLocaleLowerCase("ar").includes(normalizedSearch)
      || Boolean(searchDigits && order.customerPhone.replace(/\D/g, "").includes(searchDigits))
      || Boolean(searchOrderNumber && String(order.number).includes(searchOrderNumber));
    const orderDate = dateKey(order.createdAt);
    const matchesDate = (!dateFrom || orderDate >= dateFrom) && (!dateTo || orderDate <= dateTo);
    return matchesFilter && matchesSearch && matchesDate;
  });
  const detailsOrder = detailsOrderId ? state.orders.find((order) => order.id === detailsOrderId) : null;

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
  const openWhatsApp = (order: Order) => {
    const phone = order.customerPhone.replace(/\D/g, "").replace(/^0/, "20");
    const items = order.items.map((item) => `${item.quantity}× ${item.name}`).join("، ");
    const message = [
      `أهلًا ${order.customerName} 👋`,
      `تم تأكيد طلبك رقم #${order.number} من ${state.settings.restaurantName}.`,
      `الطلب: ${items}`,
      `الإجمالي: ${money(order.total)}`,
      order.scheduledFor ? `موعد التوصيل: ${shortDate(order.scheduledFor)}` : "هنبلغك أول ما الطلب يخرج للتوصيل.",
      `شكرًا لاختيارك ${state.settings.restaurantName} ❤️`
    ].join("\n");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="orders-page">
      <div className="stat-strip">
        <MiniStat icon={<ReceiptText />} label="طلبات اليوم" value={String(state.orders.filter((o) => dateKey(o.createdAt) === todayKey()).length)} tone="green" />
        <MiniStat icon={<Clock3 />} label="تحصيلات معلقة" value={String(state.orders.filter((o) => o.paymentStatus === "pending").length)} tone="orange" />
        <MiniStat icon={<Truck />} label="خارج للتوصيل" value={String(state.orders.filter((o) => o.stage === "out_for_delivery").length)} tone="blue" />
        <MiniStat icon={<CircleDollarSign />} label="قيمة المعلق" value={money(state.orders.filter((o) => o.paymentStatus === "pending").reduce((sum, o) => sum + o.total, 0))} tone="red" />
      </div>
      <div className="panel orders-panel">
        <div className="panel-head orders-toolbar">
          <label className="search-box orders-search">
            <Search size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم العميل أو رقم الهاتف أو رقم الطلب..." />
          </label>
          <div className="orders-filter-controls">
            <div className="orders-date-filter-wrap">
              <button className={`orders-date-filter-button ${datePreset !== "all" ? "active" : ""}`} onClick={toggleDateFilter}>
                <CalendarRange />
                <span><strong>{dateFilterLabel}</strong></span>
                <ChevronDown className={dateFilterOpen ? "open" : ""} />
              </button>
              {dateFilterOpen && <div className="orders-date-popover">
                <div className="orders-date-quick">
                  {([
                    ["today", "اليوم"],
                    ["yesterday", "أمس"],
                    ["last7", "آخر 7 أيام"],
                    ["month", "هذا الشهر"]
                  ] as const).map(([id, label]) => (
                    <button className={draftDatePreset === id ? "active" : ""} key={id} onClick={() => selectDatePreset(id)}>{label}</button>
                  ))}
                </div>
                <div className="orders-date-divider" />
                <strong className="orders-custom-date-title">تاريخ مخصص:</strong>
                <div className="orders-custom-date">
                  <label><span>من:</span><input type="date" value={draftDateFrom} onChange={(event) => {
                    const value = event.target.value;
                    setDraftDatePreset("custom");
                    setDraftDateFrom(value);
                    if (value && draftDateTo && value > draftDateTo) setDraftDateTo(value);
                  }} /></label>
                  <label><span>إلى:</span><input type="date" value={draftDateTo} onChange={(event) => {
                    const value = event.target.value;
                    setDraftDatePreset("custom");
                    setDraftDateTo(value);
                    if (value && draftDateFrom && value < draftDateFrom) setDraftDateFrom(value);
                  }} /></label>
                </div>
                <div className="orders-date-actions">
                  <button className="apply" onClick={applyDateFilter}>تطبيق</button>
                  <button className="clear" onClick={clearDateFilter}>مسح</button>
                </div>
              </div>}
            </div>
            <div className="filter-tabs">
              {[["all", "الكل"], ["active", "طلبات نشطة"], ["scheduled", "مجدولة"], ["pending", "تحصيل معلق"], ["delivered", "تم التسليم"]].map(([id, label]) => (
                <button className={filter === id ? "active" : ""} onClick={() => setFilter(id as typeof filter)} key={id}>{label}</button>
              ))}
            </div>
          </div>
          <div className="orders-toolbar-meta">
            <span className="orders-result-count">{filtered.length} طلب</span>
          </div>
        </div>
        <div className="orders-table">
          <div className="orders-row orders-head">
            <span>الطلب</span><span>العميل</span><span>الأصناف</span><span>الإجمالي</span><span>الدفع</span><span>الحالة والتوصيل</span><span />
          </div>
          {filtered.map((order) => (
            <button className="orders-row" key={order.id} onClick={() => setDetailsOrderId(order.id)}>
              <span className="order-number-cell">
                <strong>#{order.number}</strong>
                <small>{order.scheduledFor ? `موعد ${shortDate(order.scheduledFor)}` : shortDate(order.createdAt)}</small>
              </span>
              <span className="order-customer-cell"><strong>{order.customerName}</strong><small><Phone size={12} /> {order.customerPhone}</small></span>
              <span className="order-items-cell">
                <strong>{order.items.slice(0, 2).map((item) => `${item.quantity}× ${item.name}`).join("، ")}</strong>
                <small>{order.items.reduce((sum, item) => sum + item.quantity, 0)} وحدة · {order.items.length} صنف</small>
              </span>
              <span className="order-total-cell"><strong>{money(order.total)}</strong><small>شامل التوصيل</small></span>
              <span><StatusBadge type={order.paymentStatus === "paid" ? "success" : "warning"}>{order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}</StatusBadge><small>{paymentLabels[order.paymentMethod]}</small></span>
              <span><StatusBadge type={order.stage === "delivered" ? "success" : order.stage === "out_for_delivery" ? "info" : order.stage === "cancelled" ? "danger" : "neutral"}>{stageLabels[order.stage]}</StatusBadge><small>{order.driver || order.deliveryCompany || "جهة التوصيل غير محددة"}</small></span>
              <span className="order-row-arrow"><ChevronLeft /></span>
            </button>
          ))}
          {!filtered.length && <Empty
            icon={<ReceiptText />}
            title={search || datePreset !== "all" ? "لا توجد طلبات مطابقة" : "لا توجد طلبات هنا"}
            text={datePreset !== "all" ? "غيّر فترة التاريخ أو امسح الفلتر لعرض طلبات أخرى" : search ? "راجع اسم العميل أو رقم الهاتف أو رقم الطلب" : "الطلبات الجديدة هتظهر تلقائيًا"}
          />}
        </div>
      </div>
      {detailsOrder && <OrderDetailsModal
        order={detailsOrder}
        onUpdateCustomer={(customer) => {
          update((current) => ({
            ...current,
            customers: current.customers.map((item) => item.id === detailsOrder.customerId ? {
              ...item,
              name: customer.name,
              phone: customer.phone,
              address: customer.address
            } : item),
            orders: current.orders.map((item) => item.customerId === detailsOrder.customerId ? {
              ...item,
              customerName: customer.name,
              customerPhone: customer.phone,
              address: customer.address
            } : item)
          }));
          notify("تم تحديث بيانات العميل");
        }}
        onClose={() => setDetailsOrderId(null)}
        onPrint={() => {
          setDetailsOrderId(null);
          setInvoice(detailsOrder);
        }}
        onEdit={() => {
          setDetailsOrderId(null);
          onEditOrder(detailsOrder);
        }}
        onWhatsApp={() => openWhatsApp(detailsOrder)}
        onCollect={detailsOrder.paymentStatus === "pending" ? () => collect(detailsOrder) : undefined}
      />}
      {invoice && <InvoiceModal order={invoice} settings={state.settings} onClose={() => setInvoice(null)} />}
    </div>
  );
}

function OrderDetailsModal({ order, onClose, onPrint, onEdit, onWhatsApp, onUpdateCustomer, onCollect }: {
  order: Order;
  onClose: () => void;
  onPrint: () => void;
  onEdit: () => void;
  onWhatsApp: () => void;
  onUpdateCustomer: (customer: { name: string; phone: string; address: string }) => void;
  onCollect?: () => void;
}) {
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: order.customerName,
    phone: order.customerPhone,
    address: order.address
  });
  const cancelCustomerEdit = () => {
    setCustomerForm({ name: order.customerName, phone: order.customerPhone, address: order.address });
    setEditingCustomer(false);
  };
  const saveCustomer = () => {
    const customer = {
      name: customerForm.name.trim(),
      phone: customerForm.phone.trim(),
      address: customerForm.address.trim()
    };
    if (!customer.name || !customer.phone || !customer.address) return;
    onUpdateCustomer(customer);
    setEditingCustomer(false);
  };

  return (
    <Modal title={`تفاصيل الطلب رقم ${order.number}`} onClose={onClose} size="wide">
      <div className="order-details">
        <div className="order-details-hero">
          <span className="order-details-icon"><ReceiptText /></span>
          <span className="order-details-number">
            <small>رقم الطلب</small>
            <strong>#{order.number}</strong>
          </span>
          <span className="order-details-date">
            <Clock3 />
            <small>تاريخ الطلب</small>
            <strong>{shortDate(order.createdAt)}</strong>
          </span>
          <div className="order-details-statuses">
            <StatusBadge type={order.stage === "delivered" ? "success" : order.stage === "out_for_delivery" ? "info" : order.stage === "cancelled" ? "danger" : "neutral"}>{stageLabels[order.stage]}</StatusBadge>
            <StatusBadge type={order.paymentStatus === "paid" ? "success" : "warning"}>{order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}</StatusBadge>
          </div>
        </div>

        <div className="order-details-layout">
          <div className="order-details-main">
            <div className="order-details-section-title"><ShoppingBag /><span><strong>أصناف الطلب</strong><small>{order.items.length} صنف مسجل</small></span></div>
            <div className="order-details-items">
              <div className="order-details-items-head"><span>الصنف</span><span>الكمية</span><span>الوحدة</span><span>السعر</span><span>الإجمالي</span></div>
              {order.items.map((item) => <div key={item.productId}>
                <span><strong>{item.name}</strong>{item.note && <small>{item.note}</small>}</span>
                <b>{item.quantity}</b>
                <span className="order-item-unit">{item.unit}</span>
                <span>{money(item.price)}</span>
                <strong>{money(item.price * item.quantity)}</strong>
              </div>)}
            </div>
            <div className="order-details-totals">
              <span><small>قيمة الأصناف</small><b>{money(order.subtotal)}</b></span>
              <span><small>التوصيل</small><b>{money(order.deliveryFee)}</b></span>
              <span><small>الخصم</small><b>{money(order.discount)}</b></span>
              <span className="final"><small>الإجمالي النهائي</small><strong>{money(order.total)}</strong></span>
            </div>
          </div>

          <aside className="order-details-side">
            <div className="order-info-card customer-info-card">
              <div className="order-info-card-head">
                <strong><Info /> بيانات العميل</strong>
                {!editingCustomer && <button type="button" onClick={() => setEditingCustomer(true)}><Edit3 /> تعديل</button>}
              </div>
              {editingCustomer ? <form className="customer-details-form" onSubmit={(event) => { event.preventDefault(); saveCustomer(); }}>
                <label>اسم العميل<input autoFocus value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} /></label>
                <label>رقم الهاتف<input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></label>
                <label>العنوان بالتفصيل<textarea value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} /></label>
                <div>
                  <button type="submit" className="customer-details-save"><Save /> حفظ</button>
                  <button type="button" className="customer-details-cancel" onClick={cancelCustomerEdit}>إلغاء</button>
                </div>
              </form> : <>
                <span><b>{order.customerName}</b></span>
                <span><Phone /> {order.customerPhone}</span>
                <span><MapPin /> {order.address}</span>
              </>}
            </div>
            <div className="order-info-card">
              <strong><Truck /> التوصيل والدفع</strong>
              <span><b>{order.driver || order.deliveryCompany || "لم يتم تحديد جهة التوصيل"}</b></span>
              <span><CreditCard /> {paymentLabels[order.paymentMethod]}</span>
              {order.scheduledFor && <span><Clock3 /> موعد التوصيل: {shortDate(order.scheduledFor)}</span>}
            </div>
            {order.note && <div className="order-info-card order-note-card"><strong><ClipboardCheck /> ملاحظات الطلب</strong><p>{order.note}</p></div>}
          </aside>
        </div>

        <div className="order-details-actions">
          <button className="primary-button" onClick={onEdit}><ClipboardCheck /> تعديل داخل نقطة البيع</button>
          {onCollect && <button className="collect-button" onClick={onCollect}><Banknote /> تسجيل التحصيل</button>}
          <button className="soft-button whatsapp-detail" onClick={onWhatsApp}><MessageCircle /> إرسال واتساب</button>
          <button className="soft-button" onClick={onPrint}><Printer /> طباعة الفاتورة</button>
        </div>
      </div>
    </Modal>
  );
}

function InvoiceModal({ order, settings, onClose }: { order: Order; settings: AppState["settings"]; onClose: () => void }) {
  const printInvoice = () => {
    document.body.classList.add("print-receipt");
    window.print();
    window.setTimeout(() => document.body.classList.remove("print-receipt"), 500);
  };
  return (
    <Modal title={`فاتورة #${order.number}`} onClose={onClose}>
      <div className="receipt-paper">
        <header>{settings.logoDataUrl ? <img className="receipt-logo" src={settings.logoDataUrl} alt="" /> : <CookingPot />}<h2>{settings.restaurantName}</h2><p>{settings.subtitle}</p>{settings.phone && <small>{settings.phone}</small>}{settings.address && <small>{settings.address}</small>}</header>
        <div className="receipt-meta">
          <span>رقم الطلب <b>#{order.number}</b></span>
          <span>التاريخ <b>{shortDate(order.createdAt)}</b></span>
          {order.scheduledFor && <span>موعد التوصيل <b>{shortDate(order.scheduledFor)}</b></span>}
        </div>
        <div className="receipt-customer">
          <strong className="receipt-customer-line">
            {order.customerName}
            <span dir="ltr">{order.customerPhone}</span>
          </strong>
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
          {order.note && <p>ملاحظة: {order.note}</p>}
          <small>{settings.invoiceFooter}</small>
        </div>
      </div>
      <button className="primary-button print-receipt-button" onClick={printInvoice}><Printer /> طباعة الفاتورة</button>
    </Modal>
  );
}

export function KitchenView({ state, update, notify }: ViewProps) {
  const [scope, setScope] = useState<"all" | "now" | "scheduled">("all");
  const [kitchenSection, setKitchenSection] = useState<"all" | ProductSection>("all");
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const itemSection = (item: OrderItem) => item.section ?? state.products.find((product) => product.id === item.productId)?.section;
  const sectionItems = (order: Order) => order.items.filter((item) => kitchenSection === "all" || itemSection(item) === kitchenSection);
  const activeOrders = state.orders.filter((order) => {
    if (["out_for_delivery", "delivered", "cancelled"].includes(order.stage)) return false;
    const scheduled = order.scheduledFor && new Date(order.scheduledFor).getTime() > Date.now() + 60 * 60 * 1000;
    if (scope === "now" && scheduled) return false;
    if (scope === "scheduled" && !scheduled) return false;
    return sectionItems(order).length > 0;
  });
  const grouped = new Map<string, { name: string; unit: string; quantity: number; section: ProductSection | undefined }>();
  activeOrders.flatMap(sectionItems).forEach((item) => {
    const existing = grouped.get(item.productId);
    if (existing) existing.quantity += item.quantity;
    else grouped.set(item.productId, { name: item.name, unit: item.unit, quantity: item.quantity, section: undefined });
  });
  const moveKitchenOrder = (order: Order) => {
    const next: OrderStage | null = order.stage === "confirmed" ? "preparing" : order.stage === "preparing" ? "packing" : order.stage === "packing" ? "ready" : null;
    if (!next) return;
    update((current) => ({ ...current, orders: current.orders.map((item) => item.id === order.id ? { ...item, stage: next } : item) }));
    notify(next === "ready" ? `الطلب #${order.number} جاهز` : next === "packing" ? `الطلب #${order.number} دخل التغليف` : `بدأ تحضير الطلب #${order.number}`);
  };
  const elapsed = (order: Order) => Math.max(0, Math.floor((clock - new Date(order.createdAt).getTime()) / 60000));
  const timerTone = (minutes: number) => minutes >= state.settings.kitchenLateMinutes ? "late" : minutes >= state.settings.kitchenWarningMinutes ? "warning" : "ok";
  const timerText = (order: Order) => {
    const seconds = Math.max(0, Math.floor((clock - new Date(order.createdAt).getTime()) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const printKitchen = () => {
    document.body.classList.add("print-kitchen");
    window.print();
    window.setTimeout(() => document.body.classList.remove("print-kitchen"), 500);
  };
  return (
    <div>
      <div className="kitchen-toolbar">
        <div className="filter-tabs kitchen-scopes">
          <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>كل التحضير</button>
          <button className={scope === "now" ? "active" : ""} onClick={() => setScope("now")}>مطلوب الآن</button>
          <button className={scope === "scheduled" ? "active" : ""} onClick={() => setScope("scheduled")}>طلبات مجدولة</button>
        </div>
        <div className="filter-tabs kitchen-sections">
          <button className={kitchenSection === "all" ? "active" : ""} onClick={() => setKitchenSection("all")}>الكل</button>
          <button className={kitchenSection === "cooked" ? "active" : ""} onClick={() => setKitchenSection("cooked")}>مطبخ مطبوخ</button>
          <button className={kitchenSection === "fresh" ? "active" : ""} onClick={() => setKitchenSection("fresh")}>تجهيز طازة</button>
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
            <article className={`timed-order ${timerTone(elapsed(order))}`} key={order.id}>
              <header><strong>طلب #{order.number}</strong><span className={`kitchen-timer ${timerTone(elapsed(order))}`}><Clock3 /> {timerText(order)}</span><StatusBadge type={order.stage === "ready" ? "success" : order.stage === "packing" ? "warning" : "neutral"}>{stageLabels[order.stage]}</StatusBadge></header>
              <p>{order.customerName} · {order.scheduledFor ? `موعد ${shortDate(order.scheduledFor)}` : shortDate(order.createdAt)}</p>
              <div className="kitchen-card-meta"><span>{sectionItems(order).reduce((sum, item) => sum + item.quantity, 0)} وحدة</span>{order.driver && <span>مندوب: {order.driver}</span>}{order.deliveryCompany && <span>شركة: {order.deliveryCompany}</span>}</div>
              <ul>{sectionItems(order).map((item) => <li key={item.productId}><b>{item.quantity}×</b> {item.name}<em>{itemSection(item) === "cooked" ? "مطبوخ" : "طازة"}</em></li>)}</ul>
              {order.note && <small className="order-note">{order.note}</small>}
              {["confirmed", "preparing", "packing"].includes(order.stage) && <button className="kitchen-action" onClick={() => moveKitchenOrder(order)}>{order.stage === "confirmed" ? "بدء التحضير" : order.stage === "preparing" ? "إرسال للتغليف" : "تم التغليف والطلب جاهز"}</button>}
            </article>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

export function DeliveryView({ state, update, notify }: ViewProps) {
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
    if (amountReceived + expenses > 0) transactions.push({
      id: uid(), type: "collection", method: "cash", amount: amountReceived + expenses, direction: "in",
      description: `إجمالي تسوية المندوب ${driver.name} — ${orders.length} طلب`, createdAt
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
        <MiniStat icon={<ClipboardCheck />} label="تسويات اليوم" value={String(state.driverSettlements.filter((item) => dateKey(item.createdAt) === todayKey()).length)} tone="green" />
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
    <Modal title={`تسوية عهدة — ${driver.name}`} onClose={onClose} size="wide">
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

export function CashView({ state, update, notify }: ViewProps) {
  const [expense, setExpense] = useState(false);
  const [expenseData, setExpenseData] = useState({ amount: 0, description: "" });
  const todayTransactions = state.cashTransactions.filter((transaction) => dateKey(transaction.createdAt) === todayKey());
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

export function ReportsView({ state }: { state: AppState }) {
  const orders = state.orders.filter((order) => dateKey(order.createdAt) === todayKey() && order.stage !== "cancelled");
  const sales = orders.reduce((sum, order) => sum + order.total, 0);
  const collected = orders.filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.total, 0);
  const pending = sales - collected;
  const expenses = state.cashTransactions.filter((t) => dateKey(t.createdAt) === todayKey() && t.direction === "out").reduce((sum, t) => sum + t.amount, 0);
  const productCost = (productId: string) => state.products.find((product) => product.id === productId)?.cost ?? 0;
  const costOfSales = orders.flatMap((order) => order.items).reduce((sum, item) => sum + (item.cost ?? productCost(item.productId)) * item.quantity, 0);
  const itemRevenue = orders.flatMap((order) => order.items).reduce((sum, item) => sum + item.price * item.quantity, 0);
  const grossProfit = itemRevenue - costOfSales;
  const itemTotals = new Map<string, number>();
  orders.flatMap((order) => order.items).forEach((item) => itemTotals.set(item.name, (itemTotals.get(item.name) ?? 0) + item.quantity));
  const topItems = [...itemTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(1, ...topItems.map((item) => item[1]));
  const methodTotal = (method: PaymentMethod) => orders.filter((order) => order.paymentMethod === method).reduce((sum, order) => sum + order.total, 0);
  const todaySettlements = state.driverSettlements.filter((item) => dateKey(item.createdAt) === todayKey());
  return (
    <div>
      <div className="report-heading"><div><span>ملخص أداء اليوم</span><strong>{money(sales)}</strong><small>إجمالي قيمة المبيعات</small></div><div className="report-ring"><span>{orders.length}</span><small>طلب</small></div></div>
      <div className="stat-strip">
        <MiniStat icon={<Check />} label="تم تحصيله" value={money(collected)} tone="green" />
        <MiniStat icon={<Clock3 />} label="معلق" value={money(pending)} tone="orange" />
        <MiniStat icon={<CircleDollarSign />} label="مصروفات" value={money(expenses)} tone="red" />
        <MiniStat icon={<BarChart3 />} label="متوسط الطلب" value={money(orders.length ? sales / orders.length : 0)} tone="blue" />
      </div>
      <div className="profit-strip">
        <div><span><Calculator /><small>تكلفة الأصناف المباعة</small></span><strong>{money(costOfSales)}</strong></div>
        <div><span><CircleDollarSign /><small>مجمل ربح الأصناف</small></span><strong>{money(grossProfit)}</strong></div>
        <div><span><BarChart3 /><small>هامش الربح</small></span><strong>{itemRevenue ? `${Math.round((grossProfit / itemRevenue) * 100)}%` : "0%"}</strong></div>
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
