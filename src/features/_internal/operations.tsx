import { useEffect, useState, type ReactNode } from "react";
import {
  Banknote, BarChart3, Bike, Calculator, CalendarRange, Check,
  ChevronDown, ChevronLeft, CircleDollarSign, ClipboardCheck, Clock3, CookingPot, CreditCard,
  Edit3, Info, MapPin, MessageCircle, Minus, PackageCheck, Phone, Plus, Printer,
  ReceiptText, Save, Search, ShoppingBag, Trash2, TrendingDown, TrendingUp, Truck, UserPlus,
  Utensils, WalletCards, X
} from "lucide-react";
import type {
  AppState, CashTransaction, Customer, Driver, DriverSettlement, Order, OrderItem,
  OrderStage, PaymentMethod, Product, ProductSection
} from "../../domain/types";
import { CustomerFile } from "./management";
import { InvoiceModal } from "../orders/InvoiceModal";
import type { ViewProps } from "../../shared/contracts";
import {
  dateKey, money, paymentLabels, shortDate, stageLabels, todayKey
} from "../../shared/format";
import { uid } from "../../shared/id";
import { Empty, MiniStat, Modal, StatusBadge, WorkspaceSectionHeader } from "../../shared/ui";
import { errorMessage, isDesktopRuntime, printOrderReceipts } from "../../infrastructure/desktopPrinting";

const MEALS_SECTION = "__meals";

export function PosView({ state, update, notify, editingOrder, onEditOrder, onFinishEditing }: ViewProps & {
  editingOrder: Order | null;
  onEditOrder: (order: Order) => void;
  onFinishEditing: () => void;
}) {
  const [section, setSection] = useState<ProductSection>(() => state.sections[0]?.id ?? "cooked");
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
  const [optionProduct, setOptionProduct] = useState<Product | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const hasOpenShift = state.cashShifts.some((shift) => !shift.closedAt);

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
  const meals = state.meals.filter((meal) => meal.available && meal.name.includes(search.trim()));
  const categories = section === MEALS_SECTION ? ["الكل"] : ["الكل", ...new Set(state.products.filter((product) => product.section === section).map((product) => product.category))];
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

  const addProduct = (product: Product, option = product.options?.[0]) => {
    const lineKey = `${product.id}:${option?.id ?? "base"}`;
    setCart((current) => {
      const exists = current.find((item) => `${item.productId}:${item.optionId ?? "base"}` === lineKey);
      return exists
        ? current.map((item) => `${item.productId}:${item.optionId ?? "base"}` === lineKey ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, {
          productId: product.id, optionId: option?.id, optionName: option?.name,
          name: option ? `${product.name} - ${option.name}` : product.name,
          unit: option?.unit ?? product.unit, price: option?.price ?? product.price,
          cost: option?.cost ?? product.cost, recipeMultiplier: option?.recipeMultiplier ?? 1,
          quantity: 1, section: product.section
        }];
    });
    setOptionProduct(null);
  };

  const addMeal = (meal: AppState["meals"][number]) => {
    const productId = `meal:${meal.id}`;
    const cost = meal.components.reduce((sum, component) => sum + (state.products.find((product) => product.id === component.productId)?.cost ?? 0) * component.quantity, 0);
    setCart((current) => {
      const exists = current.find((item) => item.productId === productId);
      return exists
        ? current.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, {
          productId, mealId: meal.id,
          mealComponents: meal.components.map((component) => ({ ...component })),
          name: meal.name, unit: "وجبة", price: meal.price, cost, quantity: 1,
          section: MEALS_SECTION,
          note: meal.components.map((component) => `${component.quantity}× ${component.name}`).join(" · ")
        }];
    });
  };

  const setQuantity = (productId: string, optionId: string | undefined, delta: number) => {
    setCart((current) => current
      .map((item) => item.productId === productId && item.optionId === optionId ? { ...item, quantity: item.quantity + delta } : item)
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
          return { ...ingredient, stockQty: Math.max(0, Math.round((ingredient.stockQty - delta) * 1000) / 1000) };
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
    if (!hasOpenShift) {
      setCheckout(false);
      notify("لا يمكن تسجيل الطلب قبل فتح وردية من شاشة الخزنة");
      return;
    }
    if (editingOrder) {
      saveEditedOrder(details);
      return;
    }
    const createdAt = new Date().toISOString();
    const total = Math.max(0, subtotal + details.deliveryFee - details.discount);
    const orderId = uid();
    const consumption = orderRecipeUsage(cart, state);
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
      stage: "preparing", createdAt, scheduledFor: details.scheduledFor || undefined, note: details.note || undefined,
      driverId: details.driverId, driver: details.driver,
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
        ...ingredient, stockQty: Math.max(0, Math.round((ingredient.stockQty - (consumption.get(ingredient.id) ?? 0)) * 1000) / 1000)
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
    if (state.settings.printCustomerReceipt !== false || state.settings.printKitchenReceipt !== false) {
      if (isDesktopRuntime()) {
        void printOrderReceipts(order, state.settings).catch((error) => {
          notify(`تم تسجيل الطلب #${order.number} لكن تعذرت الطباعة: ${errorMessage(error)}`);
        });
      } else {
        setReceiptOrder(order);
      }
    }
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
          {state.sections.map((item, index) => <button className={section === item.id ? `active ${index % 2 ? "fresh" : "cooked"}` : ""} onClick={() => { setSection(item.id); setCategory("الكل"); }} key={item.id}>
            {index % 2 ? <ShoppingBag /> : <Utensils />} <span><strong>{item.name}</strong><small>{state.products.filter((product) => product.section === item.id && product.available).length} صنف متاح</small></span>
          </button>)}
          <button className={section === MEALS_SECTION ? "active meals" : ""} onClick={() => { setSection(MEALS_SECTION); setCategory("الكل"); }}>
            <ShoppingBag /> <span><strong>الوجبات</strong><small>{state.meals.filter((meal) => meal.available).length} وجبة متاحة</small></span>
          </button>
        </div>
        <div className="catalog-tools">
          <label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن صنف..." /></label>
          <div className="category-list">
            {categories.map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}
          </div>
        </div>
        <div className="product-grid">
          {section === MEALS_SECTION ? meals.map((meal) => (
            <button className="product-card meal-card" onClick={() => addMeal(meal)} key={meal.id}>
              <div className="product-card-top">
                <span className="food-visual meal-visual"><ShoppingBag size={26} /></span>
                <span className="product-info">
                  <strong>{meal.name}</strong>
                  <small>{meal.components.map((item) => `${item.quantity}× ${item.name}`).join(" · ")}</small>
                </span>
              </div>
              <div className="product-card-footer">
                <span className="price-label">السعر</span>
                <span className="price-divider" />
                <span className="price-value">{money(meal.price)} ج.م</span>
              </div>
            </button>
          )) : products.map((product) => (
            <button className="product-card" onClick={() => product.options?.length ? setOptionProduct(product) : addProduct(product, undefined)} key={product.id}>
              <div className="product-card-top">
                <span className="food-visual" style={{ background: `linear-gradient(145deg, ${product.accent}30, ${product.accent}80)` }}>
                  {product.imageDataUrl ? <img src={product.imageDataUrl} alt="" /> : <Utensils size={26} style={{ color: product.accent }} />}
                </span>
                <span className="product-info">
                  <strong>{product.name}</strong>
                  <small>{product.options?.length ? `${product.options.length} مقاسات متاحة` : product.unit}</small>
                </span>
              </div>
              <div className="product-card-footer">
                <span className="price-label">السعر</span>
                <span className="price-divider" />
                <span className="price-value">
                  {product.options?.length ? `يبدأ من ${money(Math.min(...product.options.map((option) => option.price)))} ج.م` : `${money(product.price)} ج.م`}
                </span>
              </div>
            </button>
          ))}
          {section === MEALS_SECTION && !meals.length && <div className="empty-state"><ShoppingBag /><strong>مفيش وجبات متاحة</strong><span>أضف وجبات من شاشة إدارة الأصناف</span></div>}
          {section !== MEALS_SECTION && !products.length && <div className="empty-state"><Search /><strong>مفيش أصناف مطابقة</strong><span>جرّب كلمة أو تصنيف مختلف</span></div>}
        </div>
      </div>

      <aside className="cart-panel">
        <div className="customer-picker" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
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
          <strong title="رقم الطلب" style={{ padding: "7px 12px", background: "#f3f4f6", border: "1px solid #9ca3af", borderRadius: "9px", fontSize: "12px", color: "#111827", whiteSpace: "nowrap", flexShrink: 0, fontWeight: 800 }}>
            <span style={{ color: "#374151", fontWeight: 700, marginLeft: "5px" }}>رقم الطلب:</span>
            <b>#{editingOrder?.number ?? state.nextOrderNumber}</b>
          </strong>
        </div>
        <div className="cart-items">
          {cart.length > 0 && <div className="cart-table-head"><span>الصنف</span><span>الكمية</span><span>الإجمالي</span><span /></div>}
          {cart.map((item) => (
            <div className="cart-item" key={`${item.productId}:${item.optionId ?? "base"}`}>
              <div className="cart-product-cell">
                <strong>{item.name}</strong>
                <small>{item.unit} · {money(item.price)}</small>
              </div>
              <div className="quantity">
                <button onClick={() => setQuantity(item.productId, item.optionId, -1)}><Minus size={15} /></button>
                <span>{item.quantity}</span>
                <button onClick={() => setQuantity(item.productId, item.optionId, 1)}><Plus size={15} /></button>
              </div>
              <b className="cart-line-total">{money(item.price * item.quantity)}</b>
              <button className="remove-cart-item" title="حذف الصنف" onClick={() => setQuantity(item.productId, item.optionId, -item.quantity)}><Trash2 /></button>
            </div>
          ))}
          {!cart.length && <div className="empty-cart"><ShoppingBag size={44} /><strong>الطلب لسه فاضي</strong><span>اختار الأصناف من المنيو</span></div>}
        </div>
        <div className="cart-summary">
          <span className="cart-summary-title">ملخص الطلب</span>
          <div><span>عدد الوحدات</span><b>{totalUnits}</b></div>
          <div className="cart-total-row"><span>الإجمالي المبدئي</span><strong>{money(subtotal)}</strong></div>
          <button className="primary-button checkout-button" title={!hasOpenShift ? "افتح وردية من شاشة الخزنة أولًا" : ""} disabled={!cart.length || !customer || !hasOpenShift} onClick={() => setCheckout(true)}>
            {editingOrder ? "مراجعة وحفظ التعديل" : "متابعة الدفع"} <span>{money(subtotal)}</span>
          </button>
          {!customer && cart.length > 0 && <small className="hint">اختار العميل الأول لإكمال الطلب</small>}
          {!hasOpenShift && <small className="hint shift-closed-hint">الوردية مغلقة — افتح وردية من شاشة الخزنة لتسجيل الطلبات</small>}
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
      {optionProduct && <Modal title={`اختيار مقاس ${optionProduct.name}`} onClose={() => setOptionProduct(null)} size="medium">
        <div className="product-option-picker">
          <div className="product-option-picker-head"><span className="food-visual" style={{ background: `linear-gradient(145deg, ${optionProduct.accent}30, ${optionProduct.accent}80)` }}>{optionProduct.imageDataUrl ? <img src={optionProduct.imageDataUrl} alt="" /> : <Utensils />}</span><div><strong>{optionProduct.name}</strong><small>اختار المقاس أو كمية البيع المطلوبة</small></div></div>
          <div className="product-option-picker-grid">
            {optionProduct.options?.map((option) => <button type="button" key={option.id} onClick={() => addProduct(optionProduct, option)}>
              <span><strong>{option.name}</strong><small>{option.unit}</small></span>
              <b>{money(option.price)}</b>
              <Plus />
            </button>)}
          </div>
        </div>
      </Modal>}
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
      {checkout && customer && <CheckoutModal subtotal={subtotal} customer={customer} editingOrder={editingOrder} drivers={state.drivers} defaultFee={state.settings.defaultDeliveryFee} onClose={() => setCheckout(false)} onComplete={completeOrder} />}
      {receiptOrder && <InvoiceModal order={receiptOrder} settings={state.settings} autoPrint onClose={() => setReceiptOrder(null)} />}
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
}

function CheckoutModal({ subtotal, customer, editingOrder, drivers, defaultFee, onClose, onComplete }: {
  subtotal: number; customer: Customer; drivers: AppState["drivers"];
  editingOrder?: Order | null; defaultFee: number;
  onClose: () => void; onComplete: (details: CheckoutDetails) => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(editingOrder?.paymentMethod ?? "cash");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">(editingOrder?.paymentStatus ?? "pending");
  const [deliveryFee, setDeliveryFee] = useState(editingOrder?.deliveryFee ?? defaultFee);
  const [manualDiscount, setManualDiscount] = useState(editingOrder?.discount ?? 0);
  const [scheduledFor, setScheduledFor] = useState(editingOrder?.scheduledFor?.slice(0, 16) ?? "");
  const [note, setNote] = useState(editingOrder?.note ?? "");
  const [deliveryType, setDeliveryType] = useState<"later" | "driver">(
    editingOrder?.driverId ? "driver" : "later"
  );
  const [deliveryId, setDeliveryId] = useState(editingOrder?.driverId ?? "");

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
              onComplete({
                paymentMethod,
                paymentStatus,
                deliveryFee,
                discount: manualDiscount,
                scheduledFor,
                note,
                driverId: driver?.id,
                driver: driver?.name
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
    const components = item.mealComponents?.length
      ? item.mealComponents
      : [{ productId: item.productId, quantity: item.recipeMultiplier ?? 1 }];
    components.forEach((component) => state.recipes
      .filter((recipe) => recipe.productId === component.productId)
      .forEach((recipe) => {
        usage.set(recipe.ingredientId, (usage.get(recipe.ingredientId) ?? 0) + recipe.quantity * item.quantity * component.quantity);
      }));
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
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [ordersClock, setOrdersClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setOrdersClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
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
  const orderTimer = (order: Order) => {
    const seconds = Math.max(0, Math.floor((ordersClock - new Date(order.createdAt).getTime()) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const orderTimerTone = (order: Order) => {
    const minutes = Math.max(0, Math.floor((ordersClock - new Date(order.createdAt).getTime()) / 60000));
    return minutes >= state.settings.kitchenLateMinutes ? "late" : minutes >= state.settings.kitchenWarningMinutes ? "warning" : "ok";
  };
  const filtered = state.orders.filter((order) => {
    const matchesFilter =
      filter === "pending" ? order.paymentStatus === "pending"
        : filter === "active" ? order.stage !== "delivered"
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
  const deleteOrder = deleteOrderId ? state.orders.find((order) => order.id === deleteOrderId) : null;

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
  const confirmDeleteOrder = () => {
    if (!deleteOrder) return;
    const deletedAt = new Date().toISOString();
    update((current) => {
      const usage = deleteOrder.inventoryDeducted === false
        ? new Map<string, number>()
        : orderRecipeUsage(deleteOrder.items, current);
      const stockReversals = [...usage.entries()].map(([ingredientId, quantity]) => {
        const ingredient = current.ingredients.find((item) => item.id === ingredientId);
        return {
          id: uid(),
          ingredientId,
          ingredientName: ingredient?.name ?? "مكون",
          type: "adjustment" as const,
          quantity,
          unitCost: ingredient?.unitCost ?? 0,
          description: `استرجاع مخزون بعد حذف طلب #${deleteOrder.number}`,
          orderId: deleteOrder.id,
          createdAt: deletedAt
        };
      });
      const cashReversal: CashTransaction | null = deleteOrder.paymentStatus === "paid" ? {
        id: uid(),
        type: "withdrawal",
        method: deleteOrder.paymentMethod,
        amount: deleteOrder.total,
        direction: "out",
        description: `عكس تحصيل بسبب حذف فاتورة #${deleteOrder.number}`,
        orderId: deleteOrder.id,
        createdAt: deletedAt
      } : null;
      const remainingCustomerOrders = current.orders.filter(
        (order) => order.id !== deleteOrder.id && order.customerId === deleteOrder.customerId
      );
      const latestCustomerOrder = remainingCustomerOrders.reduce<Order | null>(
        (latest, order) => !latest || new Date(order.createdAt) > new Date(latest.createdAt) ? order : latest,
        null
      );

      return {
        ...current,
        orders: current.orders.filter((order) => order.id !== deleteOrder.id),
        ingredients: current.ingredients.map((ingredient) => ({
          ...ingredient,
          stockQty: Math.round((ingredient.stockQty + (usage.get(ingredient.id) ?? 0)) * 1000) / 1000
        })),
        stockMovements: [...stockReversals, ...current.stockMovements],
        cashTransactions: cashReversal ? [cashReversal, ...current.cashTransactions] : current.cashTransactions,
        customers: current.customers.map((customer) => customer.id === deleteOrder.customerId ? {
          ...customer,
          ordersCount: remainingCustomerOrders.length,
          totalSpent: remainingCustomerOrders.reduce((sum, order) => sum + order.total, 0),
          lastOrder: latestCustomerOrder?.createdAt
        } : customer),
        driverSettlements: current.driverSettlements.map((settlement) => {
          if (!settlement.orderIds.includes(deleteOrder.id)) return settlement;
          const grossCollected = Math.max(0, settlement.grossCollected - deleteOrder.total);
          return {
            ...settlement,
            orderIds: settlement.orderIds.filter((orderId) => orderId !== deleteOrder.id),
            grossCollected,
            deliveryFees: Math.max(0, settlement.deliveryFees - deleteOrder.deliveryFee),
            difference: settlement.amountReceived + settlement.expenses - grossCollected
          };
        })
      };
    });
    setDeleteOrderId(null);
    setDetailsOrderId(null);
    notify(`تم حذف الطلب #${deleteOrder.number} وتسوية المخزون والحساب`);
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
        <MiniStat icon={<Truck />} label="جاهز للتوصيل" value={String(state.orders.filter((o) => o.stage === "ready").length)} tone="blue" />
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
            <span>الطلب</span><span>التايمر</span><span>العميل</span><span>الأصناف</span><span>الإجمالي</span><span>الدفع</span><span>الحالة والتوصيل</span><span />
          </div>
          {filtered.map((order) => (
            <button className={`orders-row stage-${order.stage}`} key={order.id} onClick={() => setDetailsOrderId(order.id)}>
              <span className="order-number-cell">
                <strong>#{order.number}</strong>
                <small>{order.scheduledFor ? `موعد ${shortDate(order.scheduledFor)}` : shortDate(order.createdAt)}</small>
              </span>
              <span className={`order-live-timer ${order.stage === "delivered" ? "done" : orderTimerTone(order)}`}>
                <Clock3 />
                <strong>{order.stage === "delivered" ? "مكتمل" : orderTimer(order)}</strong>
              </span>
              <span className="order-customer-cell"><strong>{order.customerName}</strong><small><Phone size={12} /> {order.customerPhone}</small></span>
              <span className="order-items-cell">
                <strong>{order.items.slice(0, 2).map((item) => `${item.quantity}× ${item.name}`).join("، ")}</strong>
                <small>{order.items.reduce((sum, item) => sum + item.quantity, 0)} وحدة · {order.items.length} صنف</small>
              </span>
              <span className="order-total-cell"><strong>{money(order.total)}</strong><small>شامل التوصيل</small></span>
              <span className="order-payment-cell"><StatusBadge type={order.paymentStatus === "paid" ? "success" : "warning"}>{order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}</StatusBadge><small>{paymentLabels[order.paymentMethod]}</small></span>
              <span className="order-status-cell"><StatusBadge type={order.stage === "delivered" ? "success" : order.stage === "ready" ? "info" : "warning"}>{stageLabels[order.stage]}</StatusBadge><small>{order.driver || "جهة التوصيل غير محددة"}</small></span>
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
        drivers={state.drivers}
        busyDriverIds={state.orders
          .filter((order) => order.id !== detailsOrder.id && order.stage === "ready" && order.driverId)
          .map((order) => order.driverId!)}
        onAssignDriver={(driver) => {
          update((current) => ({
            ...current,
            orders: current.orders.map((order) => order.id === detailsOrder.id ? {
              ...order,
              driverId: driver.id,
              driver: driver.name,
              stage: "delivered"
            } : order)
          }));
          notify(`تم إرسال الطلب #${detailsOrder.number} مع ${driver.name} وتسجيله تم التوصيل`);
        }}
        onChangeStage={(stage) => {
          if (detailsOrder.settlementId) {
            notify("لا يمكن تغيير حالة طلب تمت تسوية عهدته");
            return;
          }
          const undoingDelivery = detailsOrder.stage === "delivered" && stage !== "delivered";
          update((current) => ({
            ...current,
            orders: current.orders.map((order) => order.id === detailsOrder.id ? {
              ...order,
              stage,
              ...(undoingDelivery ? {
                driverId: undefined,
                driver: undefined
              } : {})
            } : order)
          }));
          notify(stage === "preparing"
            ? `تم إرجاع الطلب #${detailsOrder.number} إلى قيد التجهيز`
            : stage === "ready"
              ? `الطلب #${detailsOrder.number} أصبح جاهزًا`
              : `تم تسجيل الطلب #${detailsOrder.number} تم التوصيل`);
        }}
        onDelete={() => setDeleteOrderId(detailsOrder.id)}
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
      {deleteOrder && <Modal title="تأكيد حذف الطلب" onClose={() => setDeleteOrderId(null)}>
        <div className="delete-order-confirm">
          <span className="delete-order-icon"><Trash2 /></span>
          <strong>هل تريد حذف الطلب #{deleteOrder.number}؟</strong>
          <p>طلب العميل <b>{deleteOrder.customerName}</b> سيتم حذفه نهائيًا من شاشة الطلبات وسجل العميل.</p>
          <div>
            <span>قيمة الطلب <b>{money(deleteOrder.total)}</b></span>
            <span>حالة الدفع <b>{deleteOrder.paymentStatus === "paid" ? "تم التحصيل — سيتم تسجيل عكس مالي" : "تحصيل معلق"}</b></span>
            {deleteOrder.inventoryDeducted !== false && <span>المخزون <b>سيتم إرجاع مكونات الطلب</b></span>}
          </div>
          <small>رقم الطلب المحذوف لن يُستخدم مرة أخرى.</small>
          <footer>
            <button className="soft-button" onClick={() => setDeleteOrderId(null)}>رجوع</button>
            <button className="delete-order-button" onClick={confirmDeleteOrder}><Trash2 /> تأكيد حذف الطلب</button>
          </footer>
        </div>
      </Modal>}
      {invoice && <InvoiceModal order={invoice} settings={state.settings} onClose={() => setInvoice(null)} />}
    </div>
  );
}

function OrderDetailsModal({ order, drivers, busyDriverIds, onClose, onPrint, onEdit, onWhatsApp, onUpdateCustomer, onAssignDriver, onChangeStage, onDelete, onCollect }: {
  order: Order;
  drivers: Driver[];
  busyDriverIds: string[];
  onClose: () => void;
  onPrint: () => void;
  onEdit: () => void;
  onWhatsApp: () => void;
  onUpdateCustomer: (customer: { name: string; phone: string; address: string }) => void;
  onAssignDriver: (driver: Driver) => void;
  onChangeStage: (stage: OrderStage) => void;
  onDelete: () => void;
  onCollect?: () => void;
}) {
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: order.customerName,
    phone: order.customerPhone,
    address: order.address
  });
  const [selectedDriverId, setSelectedDriverId] = useState(order.driverId ?? "");
  const [selectedStage, setSelectedStage] = useState<OrderStage>(order.stage);
  const activeDrivers = drivers.filter((driver) => driver.active);
  useEffect(() => setSelectedStage(order.stage), [order.stage]);
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
            <span className={`hero-stage-select ${selectedStage}`} title={order.settlementId ? "لا يمكن تغيير حالة طلب تمت تسوية عهدته" : "تعديل حالة الطلب"}>
              <select value={selectedStage} disabled={Boolean(order.settlementId)} onChange={(event) => setSelectedStage(event.target.value as OrderStage)}>
                <option value="preparing">قيد التجهيز</option>
                <option value="ready">جاهز</option>
                <option value="delivered">تم التوصيل</option>
              </select>
              <ChevronDown />
            </span>
            {selectedStage !== order.stage && !order.settlementId && <button className="save-hero-stage" onClick={() => onChangeStage(selectedStage)}><Check /> حفظ</button>}
            <StatusBadge type={order.paymentStatus === "paid" ? "success" : "warning"}>{order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}</StatusBadge>
          </div>
        </div>

        <div className="order-details-layout">
          <div className="order-details-main">
            <div className="order-details-section-title"><ShoppingBag /><span><strong>أصناف الطلب</strong><small>{order.items.length} صنف مسجل</small></span></div>
            <div className="order-details-items">
              <div className="order-details-items-head"><span>الصنف</span><span>الكمية</span><span>الوحدة</span><span>السعر</span><span>الإجمالي</span></div>
              {order.items.map((item) => <div key={`${item.productId}:${item.optionId ?? "base"}`}>
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
              <span><b>{order.driver || "لم يتم تحديد جهة التوصيل"}</b></span>
              <span><CreditCard /> {paymentLabels[order.paymentMethod]}</span>
              {order.scheduledFor && <span><Clock3 /> موعد التوصيل: {shortDate(order.scheduledFor)}</span>}
            </div>
            {order.stage === "ready" && <div className="order-info-card order-driver-picker">
              <strong><Bike /> اختيار مندوب التوصيل</strong>
              <p>اختار المندوب اللي هيستلم الطلب الجاهز.</p>
              <div className="order-driver-picker-list">
                {activeDrivers.map((driver) => {
                  const busy = busyDriverIds.includes(driver.id);
                  return <button type="button" className={selectedDriverId === driver.id ? "active" : ""} key={driver.id} onClick={() => setSelectedDriverId(driver.id)}>
                    <span className="driver-pick-icon"><Bike /></span>
                    <span><b>{driver.name}</b><small>{driver.phone}{driver.vehicle ? ` · ${driver.vehicle}` : ""}</small></span>
                    <em>{busy ? "عنده طلب جاهز" : "متاح"}</em>
                    {selectedDriverId === driver.id && <Check />}
                  </button>;
                })}
                {!activeDrivers.length && <span className="no-active-drivers">لا يوجد مناديب نشطون. أضف مندوبًا من شاشة التوصيل.</span>}
              </div>
              <button type="button" className="confirm-driver-pick" disabled={!selectedDriverId} onClick={() => {
                const driver = activeDrivers.find((item) => item.id === selectedDriverId);
                if (driver) onAssignDriver(driver);
              }}><Truck /> تأكيد وإرسال مع المندوب</button>
            </div>}
            {order.note && <div className="order-info-card order-note-card"><strong><ClipboardCheck /> ملاحظات الطلب</strong><p>{order.note}</p></div>}
          </aside>
        </div>

        <div className="order-details-actions">
          <button className="primary-button" onClick={onEdit}><ClipboardCheck /> تعديل داخل نقطة البيع</button>
          {onCollect && <button className="collect-button" onClick={onCollect}><Banknote /> تسجيل التحصيل</button>}
          <button className="soft-button whatsapp-detail" onClick={onWhatsApp}><MessageCircle /> إرسال واتساب</button>
          <button className="soft-button" onClick={onPrint}><Printer /> طباعة الفاتورة</button>
          <button className="delete-order-action" onClick={onDelete}><Trash2 /> حذف الطلب</button>
        </div>
      </div>
    </Modal>
  );
}

export function KitchenView({ state, update, notify }: ViewProps) {
  const [scope, setScope] = useState<"all" | "now" | "scheduled">("all");
  const [kitchenSection, setKitchenSection] = useState<"all" | ProductSection>("all");
  const [query, setQuery] = useState("");
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const itemSection = (item: OrderItem) => item.section ?? state.products.find((product) => product.id === item.productId)?.section;
  const sectionItems = (order: Order) => order.items.filter((item) => kitchenSection === "all" || itemSection(item) === kitchenSection);
  const normalizedQuery = query.trim().toLocaleLowerCase("ar");
  const activeOrders = state.orders.filter((order) => {
    if (order.stage !== "preparing") return false;
    const scheduled = order.scheduledFor && new Date(order.scheduledFor).getTime() > clock + 60 * 60 * 1000;
    if (scope === "now" && scheduled) return false;
    if (scope === "scheduled" && !scheduled) return false;
    if (!sectionItems(order).length) return false;
    return !normalizedQuery
      || String(order.number).includes(normalizedQuery.replace("#", ""))
      || order.customerName.toLocaleLowerCase("ar").includes(normalizedQuery)
      || order.items.some((item) => item.name.toLocaleLowerCase("ar").includes(normalizedQuery));
  }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const moveKitchenOrder = (order: Order) => {
    update((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === order.id ? {
        ...item,
        stage: "ready"
      } : item)
    }));
    notify(`اكتمل تحضير الطلب #${order.number} وأصبح جاهزًا للتوصيل`);
  };
  const elapsed = (order: Order) => Math.max(0, Math.floor((clock - new Date(order.createdAt).getTime()) / 60000));
  const timerTone = (minutes: number) => minutes >= state.settings.kitchenLateMinutes ? "late" : minutes >= state.settings.kitchenWarningMinutes ? "warning" : "ok";
  const timerText = (order: Order) => {
    const seconds = Math.max(0, Math.floor((clock - new Date(order.createdAt).getTime()) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const totalUnits = activeOrders.reduce((sum, order) => sum + sectionItems(order).reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  const warningOrders = activeOrders.filter((order) => timerTone(elapsed(order)) === "warning").length;
  const lateOrders = activeOrders.filter((order) => timerTone(elapsed(order)) === "late").length;
  return (
    <div className="workflow-page kitchen-workflow">
      <div className="workflow-stats">
        <MiniStat icon={<ReceiptText />} label="طلبات في المطبخ" value={String(activeOrders.length)} tone="green" />
        <MiniStat icon={<Utensils />} label="إجمالي الوحدات" value={String(totalUnits)} tone="blue" />
        <MiniStat icon={<Clock3 />} label="تحتاج انتباه" value={String(warningOrders)} tone="orange" />
        <MiniStat icon={<Info />} label="طلبات متأخرة" value={String(lateOrders)} tone="red" />
      </div>
      <div className="panel kitchen-orders-panel">
        <WorkspaceSectionHeader
          title="لوحة تشغيل المطبخ"
          subtitle="طلبات التحضير مرتبة تلقائيًا من الأقدم للأحدث"
          actions={<span className="workflow-live"><i /> تحديث مباشر</span>}
        />
        <div className="workflow-toolbar">
          <label className="search-box workflow-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث برقم الطلب أو العميل أو الصنف..." /></label>
          <div className="filter-tabs kitchen-scopes">
            <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>كل الطلبات</button>
            <button className={scope === "now" ? "active" : ""} onClick={() => setScope("now")}>مطلوب الآن</button>
            <button className={scope === "scheduled" ? "active" : ""} onClick={() => setScope("scheduled")}>المجدولة</button>
          </div>
          <div className="filter-tabs kitchen-sections">
            <button className={kitchenSection === "all" ? "active" : ""} onClick={() => setKitchenSection("all")}>الكل</button>
            {state.sections.map((item) => <button className={kitchenSection === item.id ? "active" : ""} onClick={() => setKitchenSection(item.id)} key={item.id}>{item.name}</button>)}
            <button className={kitchenSection === MEALS_SECTION ? "active" : ""} onClick={() => setKitchenSection(MEALS_SECTION)}>الوجبات</button>
          </div>
        </div>
        <div className="kitchen-board">
          {activeOrders.map((order) => (
            <article className={`kitchen-ticket timed-order ${timerTone(elapsed(order))}`} key={order.id}>
            <header>
              <span><small>طلب</small><strong>#{order.number}</strong></span>
              <span className={`kitchen-timer ${timerTone(elapsed(order))}`}><Clock3 /> {timerText(order)}</span>
            </header>
            <div className="kitchen-ticket-customer">
              <strong>{order.customerName}</strong>
              <small>{order.scheduledFor ? `موعد ${shortDate(order.scheduledFor)}` : shortDate(order.createdAt)}</small>
            </div>
            <div className="kitchen-ticket-summary">
              <span>{sectionItems(order).length} صنف</span>
              <span>{sectionItems(order).reduce((sum, item) => sum + item.quantity, 0)} وحدة</span>
              <StatusBadge type="warning">{stageLabels[order.stage]}</StatusBadge>
            </div>
            <ul>{sectionItems(order).map((item) => <li key={`${item.productId}:${item.optionId ?? "base"}`}><b>{item.quantity}×</b><span>{item.name}{item.note && <small>{item.note}</small>}</span><em>{item.mealId ? "وجبة" : state.sections.find((section) => section.id === itemSection(item))?.name ?? "قسم"}</em></li>)}</ul>
            {order.note && <small className="order-note"><Info /> {order.note}</small>}
            <button className="kitchen-action" onClick={() => moveKitchenOrder(order)}><Check /> تم التحضير — جاهز للتوصيل</button>
            </article>
          ))}
          {!activeOrders.length && <div className="workflow-empty"><Empty icon={<CookingPot />} title={query ? "لا توجد طلبات مطابقة" : "المطبخ هادئ حاليًا"} text={query ? "جرّب البحث برقم طلب أو اسم آخر" : "طلبات التحضير الجديدة ستظهر هنا تلقائيًا"} /></div>}
        </div>
      </div>
    </div>
  );
}

export function DeliveryView({ state, update, notify }: ViewProps) {
  const [addingDriver, setAddingDriver] = useState(false);
  const [driverForm, setDriverForm] = useState({ name: "", phone: "", vehicle: "موتوسيكل" });
  const [settlementDriver, setSettlementDriver] = useState<Driver | null>(null);
  const [settlementOrderId, setSettlementOrderId] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [driverSearch, setDriverSearch] = useState("");
  const [driverScope, setDriverScope] = useState<"all" | "available" | "busy" | "custody">("all");
  const unassigned = state.orders.filter((order) => order.stage === "ready" && !order.driverId);
  const activeDrivers = state.drivers.filter((driver) => driver.active);
  const driverOrders = (driverId: string) => state.orders.filter((order) => order.driverId === driverId && !order.settlementId);
  const driverCustody = (driverId: string) => driverOrders(driverId)
    .filter((order) => order.paymentStatus === "pending" && order.stage === "delivered")
    .reduce((sum, order) => sum + order.total, 0);
  const visibleDrivers = activeDrivers.filter((driver) => {
    const orders = driverOrders(driver.id);
    const custody = driverCustody(driver.id);
    return driver.name.includes(driverSearch.trim()) || driver.phone.includes(driverSearch.trim())
      ? (driverScope === "all" || (driverScope === "available" && !orders.length) || (driverScope === "busy" && orders.length > 0) || (driverScope === "custody" && custody > 0))
      : false;
  });

  const assign = (order: Order, driver: Driver) => {
    update((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === order.id ? {
        ...item, driverId: driver.id, driver: driver.name, stage: "delivered"
      } : item)
    }));
    notify(`تم إرسال الطلب #${order.number} مع ${driver.name} وتسجيله تم التوصيل`);
  };

  const markDelivered = (order: Order) => {
    update((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === order.id ? { ...item, stage: "delivered" } : item)
    }));
    notify(`تم توصيل الطلب #${order.number}`);
  };

  const addDriver = () => {
    if (!driverForm.name || !driverForm.phone) return;
    const driver: Driver = { id: uid(), ...driverForm, active: true, createdAt: new Date().toISOString() };
    update((current) => ({ ...current, drivers: [...current.drivers, driver] }));
    setDriverForm({ name: "", phone: "", vehicle: "موتوسيكل" });
    setAddingDriver(false);
    notify("تم إضافة المندوب");
  };

  const settle = (driver: Driver, orders: Order[], expenses: number, amountReceived: number, note: string, paymentMethod: PaymentMethod) => {
    const createdAt = new Date().toISOString();
    const grossCollected = orders.reduce((sum, order) => sum + order.total, 0);
    const deliveryFees = orders.reduce((sum, order) => sum + order.deliveryFee, 0);
    const difference = amountReceived + expenses - grossCollected;
    const settlement: DriverSettlement = {
      id: uid(), driverId: driver.id, driverName: driver.name, orderIds: orders.map((order) => order.id),
      paymentMethod, grossCollected, deliveryFees, expenses, amountReceived, difference, note: note || undefined, createdAt
    };
    const transactions: CashTransaction[] = [];
    if (amountReceived + expenses > 0) transactions.push({
      id: uid(), type: "collection", method: paymentMethod, amount: amountReceived + expenses, direction: "in",
      description: `إجمالي تسوية المندوب ${driver.name} — ${orders.length} طلب — ${paymentLabels[paymentMethod]}`, createdAt
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
    setSettlementOrderId(null);
    notify(`تمت تسوية عهدة ${driver.name}`);
  };

  return (
    <div className="delivery-page">
      <section className="delivery-hero">
        <div><span><Bike /></span><div><strong>لوحة التوصيل والمناديب</strong><small>وزّع الطلبات الجاهزة وتابع العهد والتسويات من مكان واحد</small></div></div>
        <button className="primary-button compact" onClick={() => { setDriverForm({ name: "", phone: "", vehicle: "موتوسيكل" }); setAddingDriver(true); }}><UserPlus /> إضافة مندوب</button>
      </section>

      <div className="stat-strip">
        <MiniStat icon={<PackageCheck />} label="جاهز للإسناد" value={String(unassigned.length)} tone="orange" />
        <MiniStat icon={<Bike />} label="تم التوصيل اليوم" value={String(state.orders.filter((order) => order.stage === "delivered" && dateKey(order.createdAt) === todayKey()).length)} tone="blue" />
        <MiniStat icon={<Banknote />} label="عهدة مع المندوبين" value={money(state.orders.filter((order) => order.driverId && order.paymentStatus === "pending" && !order.settlementId).reduce((sum, order) => sum + order.total, 0))} tone="red" />
        <MiniStat icon={<ClipboardCheck />} label="تسويات اليوم" value={String(state.driverSettlements.filter((item) => dateKey(item.createdAt) === todayKey()).length)} tone="green" />
      </div>

      {unassigned.length > 0 && (
        <div className="panel unassigned-panel delivery-ready-panel">
          <div className="panel-title"><div><PackageCheck /><span><strong>طلبات جاهزة للتوزيع</strong><small>حدد المندوب ثم أرسل الطلب فورًا للتوصيل</small></span></div><b className="ready-orders-count">{unassigned.length} طلب</b></div>
          <div className="assignment-list">
            {unassigned.map((order) => (
              <div key={order.id}>
                <span><strong>طلب #{order.number} · {order.customerName}</strong><small><MapPin /> {order.address}</small></span>
                <span className="assignment-order-total"><small>الإجمالي</small><b>{money(order.total)}</b></span>
                <div className="assign-buttons">
                  <select defaultValue="" onChange={(event) => {
                    const driver = activeDrivers.find((item) => item.id === event.target.value);
                    if (driver) assign(order, driver);
                  }}><option value="" disabled>اختار مندوبًا</option>{activeDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name} · {driverOrders(driver.id).length} طلبات</option>)}</select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="delivery-drivers-section">
        <div className="delivery-drivers-head">
          <div><strong>فريق التوصيل</strong><small>{visibleDrivers.length} مندوب ظاهر من {activeDrivers.length} نشط</small></div>
          <label className="search-box"><Search /><input value={driverSearch} onChange={(event) => setDriverSearch(event.target.value)} placeholder="ابحث باسم المندوب أو الهاتف..." /></label>
          <div className="driver-scope-filter"><button className={driverScope === "all" ? "active" : ""} onClick={() => setDriverScope("all")}>الكل</button><button className={driverScope === "available" ? "active" : ""} onClick={() => setDriverScope("available")}>متاح</button><button className={driverScope === "busy" ? "active" : ""} onClick={() => setDriverScope("busy")}>مشغول</button><button className={driverScope === "custody" ? "active warning" : ""} onClick={() => setDriverScope("custody")}>عهدة معلقة</button></div>
        </div>
        <div className="driver-grid">
        {visibleDrivers.map((driver) => {
          const assigned = driverOrders(driver.id);
          const unsettled = assigned.filter((order) => order.paymentStatus === "pending" && order.stage === "delivered");
          const custody = unsettled.reduce((sum, order) => sum + order.total, 0);
          const hasReady = assigned.some((order) => order.stage === "ready");
          return (
            <article className={`driver-card ${hasReady ? "busy" : ""}`} key={driver.id}>
              <header>
                <span className="driver-avatar"><Bike /></span>
                <div><strong>{driver.name}</strong><small>{driver.phone} · {driver.vehicle}</small></div>
                <StatusBadge type={hasReady ? "info" : custody > 0 ? "warning" : "success"}>
                  {hasReady ? "مشغول" : custody > 0 ? "بانتظار تسوية" : "متاح"}
                </StatusBadge>
              </header>
              <div className="driver-summary">
                <span><small>طلبات حالية</small><b>{assigned.length}</b></span>
                <span><small>عهدة معلقة</small><b>{money(custody)}</b></span>
                <span><small>تم اليوم</small><b>{state.orders.filter((order) => order.driverId === driver.id && order.stage === "delivered" && dateKey(order.createdAt) === todayKey()).length}</b></span>
              </div>
              <div className="driver-orders">
                {assigned.slice(0, 3).map((order) => (
                  <div key={order.id}>
                    <span><strong>#{order.number} · {order.customerName}</strong><small>{money(order.total)} · {stageLabels[order.stage]}</small></span>
                    {order.stage === "ready" && <button onClick={() => markDelivered(order)}><Check /> تم التوصيل</button>}
                    {order.stage === "delivered" && order.paymentStatus === "pending" && <StatusBadge type="warning">بانتظار التسوية</StatusBadge>}
                  </div>
                ))}
                {!assigned.length && <p>لا توجد طلبات مع المندوب</p>}
              </div>
              <footer className="driver-card-actions"><button className="driver-profile-button" onClick={() => setSelectedDriver(driver)}><Info /> ملف المندوب</button><button className="settlement-button" disabled={!unsettled.length} onClick={() => { setSettlementOrderId(null); setSettlementDriver(driver); }}><ClipboardCheck /> تسوية {unsettled.length > 0 && `(${unsettled.length})`}</button></footer>
            </article>
          );
        })}
        {!visibleDrivers.length && <Empty icon={<Bike />} title="لا توجد نتائج للمناديب" text="غيّر البحث أو الفلتر الحالي" />}
        </div>
      </section>

      {addingDriver && (
        <Modal title="إضافة مندوب جديد" onClose={() => setAddingDriver(false)} size="medium">
          <div className="driver-editor-modal">
            <div className="driver-editor-hero"><span><Bike /></span><div><strong>بيانات مندوب التوصيل</strong><small>أضف بيانات التواصل ووسيلة التوصيل ليظهر في قائمة التوزيع فورًا</small></div></div>
            <div className="driver-editor-fields">
              <label><span>اسم المندوب <em>*</em></span><div><UserPlus /><input autoFocus value={driverForm.name} onChange={(event) => setDriverForm({ ...driverForm, name: event.target.value })} placeholder="اكتب الاسم بالكامل" /></div></label>
              <label><span>رقم الموبايل <em>*</em></span><div><Phone /><input inputMode="tel" value={driverForm.phone} onChange={(event) => setDriverForm({ ...driverForm, phone: event.target.value })} placeholder="01xxxxxxxxx" /></div></label>
              <label className="full-field"><span>وسيلة التوصيل</span><div><Bike /><input list="driver-vehicle-options" value={driverForm.vehicle} onChange={(event) => setDriverForm({ ...driverForm, vehicle: event.target.value })} placeholder="مثال: موتوسيكل" /><datalist id="driver-vehicle-options"><option value="موتوسيكل" /><option value="عجلة" /><option value="سيارة" /></datalist></div></label>
            </div>
            <div className="driver-editor-note"><Check /><span>سيتم تفعيل المندوب تلقائيًا وسيظهر ضمن مناديب التوزيع.</span></div>
            <div className="driver-editor-actions"><button className="soft-button" onClick={() => setAddingDriver(false)}>إلغاء</button><button className="primary-button" disabled={!driverForm.name.trim() || !driverForm.phone.trim()} onClick={addDriver}><Save /> حفظ وإضافة المندوب</button></div>
          </div>
        </Modal>
      )}
      {selectedDriver && <DriverProfileModal
        driver={selectedDriver}
        orders={driverOrders(selectedDriver.id)}
        onClose={() => setSelectedDriver(null)}
        onSettle={(order) => {
          setSettlementOrderId(order?.id ?? null);
          setSelectedDriver(null);
          setSettlementDriver(selectedDriver);
        }}
        onDelivered={markDelivered}
      />}
      {settlementDriver && (
        <DriverSettlementModal
          driver={settlementDriver}
          orders={state.orders.filter((order) => order.driverId === settlementDriver.id && order.paymentStatus === "pending" && !order.settlementId && order.stage === "delivered" && (!settlementOrderId || order.id === settlementOrderId))}
          onClose={() => { setSettlementDriver(null); setSettlementOrderId(null); }}
          onSettle={(orders, expenses, amountReceived, note, paymentMethod) => settle(settlementDriver, orders, expenses, amountReceived, note, paymentMethod)}
        />
      )}
    </div>
  );
}

function DriverProfileModal({ driver, orders, onClose, onSettle, onDelivered }: {
  driver: Driver;
  orders: Order[];
  onClose: () => void;
  onSettle: (order?: Order) => void;
  onDelivered: (order: Order) => void;
}) {
  const unsettled = orders.filter((order) => order.paymentStatus === "pending" && order.stage === "delivered");
  const custody = unsettled.reduce((sum, order) => sum + order.total, 0);
  return <Modal title={`ملف المندوب: ${driver.name}`} onClose={onClose} size="wide">
    <div className="driver-profile-modal">
      <div className="driver-profile-hero"><span className="driver-avatar"><Bike /></span><div><strong>{driver.name}</strong><small><Phone /> {driver.phone}</small><small><Bike /> {driver.vehicle || "وسيلة التوصيل غير محددة"}</small></div><div className="driver-profile-stats"><span><small>طلبات حالية</small><b>{orders.length}</b></span><span><small>طلبات للتحصيل</small><b>{unsettled.length}</b></span><span><small>العهدة المعلقة</small><b>{money(custody)}</b></span></div></div>
      <section className="driver-profile-orders driver-profile-orders-full">
        <div className="driver-profile-title"><span><PackageCheck /></span><div><strong>الطلبات مع المندوب</strong><small>{orders.length ? `${orders.length} طلبات تحتاج متابعة` : "لا توجد طلبات حالية"}</small></div></div>
        {!!orders.length && <div className="driver-profile-table-head"><span>الطلب والعميل</span><span>العنوان</span><span>الإجمالي</span><span>الحالة</span><span>الإجراء</span></div>}
        <div className="driver-profile-orders-list">{orders.map((order) => <div className="driver-profile-order-row" key={order.id}>
          <span><strong>طلب #{order.number}</strong><small>{order.customerName} · {order.customerPhone}</small></span>
          <span className="driver-order-address">{order.address}</span>
          <b>{money(order.total)}</b>
          <span>{order.stage === "ready" ? <StatusBadge type="info">مع المندوب</StatusBadge> : <StatusBadge type={order.paymentStatus === "pending" ? "warning" : "success"}>{order.paymentStatus === "pending" ? "تحصيل معلق" : "تم التحصيل"}</StatusBadge>}</span>
          <span className="driver-order-actions">{order.stage === "ready" && <button onClick={() => onDelivered(order)}><Check /> تم التوصيل</button>}{order.stage === "delivered" && order.paymentStatus === "pending" && <button className="settle-single-order" onClick={() => onSettle(order)}><ClipboardCheck /> تسوية الطلب</button>}</span>
        </div>)}{!orders.length && <div className="simple-empty"><Bike /><span>المندوب متاح لاستلام طلبات جديدة</span></div>}</div>
        <footer className="driver-profile-footer"><span><small>إجمالي العهدة المطلوب تسويتها</small><strong>{money(custody)}</strong></span><button className="settlement-button" disabled={!unsettled.length} onClick={() => onSettle()}><ClipboardCheck /> تسوية العهدة {unsettled.length ? `(${unsettled.length})` : ""}</button></footer>
      </section>
    </div>
  </Modal>;
}

function DriverSettlementModal({ driver, orders, onClose, onSettle }: {
  driver: Driver;
  orders: Order[];
  onClose: () => void;
  onSettle: (orders: Order[], expenses: number, amountReceived: number, note: string, paymentMethod: PaymentMethod) => void;
}) {
  const [selectedIds, setSelectedIds] = useState(orders.map((order) => order.id));
  const [expenses, setExpenses] = useState(0);
  const [receivedEdited, setReceivedEdited] = useState(false);
  const [amountReceived, setAmountReceived] = useState(orders.reduce((sum, order) => sum + order.total, 0));
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
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
      <div className="settlement-modal-head">
        <span><ClipboardCheck /></span>
        <div><strong>مراجعة وتسوية عهدة المندوب</strong><small>حدد الطلبات وطريقة استلام المبلغ ثم راجع فرق التسوية قبل الاعتماد</small></div>
      </div>
      <div className="settlement-modal-grid">
        <div className="settlement-orders">
          <div className="settlement-section-title"><span><strong>الفواتير الداخلة في التسوية</strong><small>{selected.length} من {orders.length} طلب محدد</small></span><b>{money(gross)}</b></div>
          {orders.map((order) => (
            <button className={selectedIds.includes(order.id) ? "selected" : ""} onClick={() => toggleOrder(order)} key={order.id}>
              <span className="check-box">{selectedIds.includes(order.id) && <Check />}</span>
              <span><strong>طلب #{order.number}</strong><small>{order.customerName} · {stageLabels[order.stage]}</small></span>
              <b>{money(order.total)}</b>
            </button>
          ))}
        </div>
        <div className="settlement-calculator">
          <div className="settlement-total"><span>إجمالي العهدة المحددة</span><strong>{money(gross)}</strong></div>
          <fieldset className="settlement-payment-methods">
            <legend>طريقة استلام العهدة</legend>
            <button type="button" className={paymentMethod === "cash" ? "active" : ""} onClick={() => setPaymentMethod("cash")}><Banknote /><span><strong>نقدي</strong><small>استلام بالخزنة</small></span><i>{paymentMethod === "cash" && <Check />}</i></button>
            <button type="button" className={paymentMethod === "instapay" ? "active" : ""} onClick={() => setPaymentMethod("instapay")}><CreditCard /><span><strong>إنستاباي</strong><small>تحويل بنكي</small></span><i>{paymentMethod === "instapay" && <Check />}</i></button>
            <button type="button" className={paymentMethod === "vodafone" ? "active" : ""} onClick={() => setPaymentMethod("vodafone")}><Phone /><span><strong>فودافون كاش</strong><small>تحويل محفظة</small></span><i>{paymentMethod === "vodafone" && <Check />}</i></button>
          </fieldset>
          <label>مصروفات تخص المندوب<input type="number" min="0" value={expenses || ""} onChange={(event) => { setExpenses(Number(event.target.value)); setReceivedEdited(false); }} /></label>
          <label>المبلغ المستلم فعليًا<input type="number" min="0" value={received} onChange={(event) => { setAmountReceived(Number(event.target.value)); setReceivedEdited(true); }} /></label>
          <label>ملاحظة<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="سبب العجز أو المصروف إن وجد" /></label>
          <div className={`settlement-difference ${difference === 0 ? "matched" : ""}`}>
            <span>فرق التسوية</span><strong>{money(difference)}</strong>
          </div>
          <button className="primary-button settlement-submit" disabled={!selected.length} onClick={() => onSettle(selected, expenses, received, note, paymentMethod)}><ClipboardCheck /> اعتماد التسوية بـ{paymentLabels[paymentMethod]}</button>
        </div>
      </div>
    </Modal>
  );
}

export function CashView({ state, update, notify }: ViewProps) {
  const [cashTab, setCashTab] = useState<"treasury" | "shift" | "daily">("treasury");
  const [transactionMethodFilter, setTransactionMethodFilter] = useState<"all" | PaymentMethod>("all");
  const [dailyMethodFilter, setDailyMethodFilter] = useState<"all" | PaymentMethod>("all");
  const [expense, setExpense] = useState(false);
  const [expenseData, setExpenseData] = useState<{ amount: number; description: string; method: PaymentMethod }>({ amount: 0, description: "", method: "cash" });
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [openingShift, setOpeningShift] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [openingAmount, setOpeningAmount] = useState(0);
  const [closingData, setClosingData] = useState({ actualCash: 0, note: "" });
  const activeShift = state.cashShifts.find((shift) => !shift.closedAt);
  const viewedShift = activeShift ?? state.cashShifts[0];
  const selectedTransactions = state.cashTransactions.filter((transaction) => dateKey(transaction.createdAt) === selectedDate);
  const selectedShifts = state.cashShifts.filter((shift) => dateKey(shift.openedAt) === selectedDate);
  const selectedOpeningBalance = selectedShifts.reduce((sum, shift) => sum + shift.openingBalance, 0);
  const dailyRevenueTransactions = selectedTransactions.filter((transaction) =>
    transaction.direction === "in" && (transaction.type === "sale" || transaction.type === "collection")
  );
  const dailySalesRevenue = dailyRevenueTransactions.filter((transaction) => transaction.type === "sale").reduce((sum, transaction) => sum + transaction.amount, 0);
  const dailyCollections = dailyRevenueTransactions.filter((transaction) => transaction.type === "collection").reduce((sum, transaction) => sum + transaction.amount, 0);
  const dailyOperationalExpenses = selectedTransactions.filter((transaction) => transaction.type === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
  const dailyRevenue = dailySalesRevenue + dailyCollections;
  const dailyNet = dailyRevenue - dailyOperationalExpenses;
  const dailyOrders = state.orders.filter((order) => dateKey(order.createdAt) === selectedDate);
  const dailyOrderCount = dailyOrders.length;
  const dailyAvgOrder = dailyOrderCount ? dailyOrders.reduce((sum, order) => sum + order.total, 0) / dailyOrderCount : 0;
  const dailyPending = dailyOrders.filter((order) => order.paymentStatus === "pending").reduce((sum, order) => sum + order.total, 0);
  const dailyDiscounts = dailyOrders.reduce((sum, order) => sum + order.discount, 0);
  const dailyDeliveryFees = dailyOrders.reduce((sum, order) => sum + order.deliveryFee, 0);
  const yesterdayDateKey = (() => { const d = new Date(selectedDate + "T00:00:00"); d.setDate(d.getDate() - 1); return dateKey(d); })();
  const yesterdayRevenue = state.cashTransactions
    .filter((transaction) => dateKey(transaction.createdAt) === yesterdayDateKey && transaction.direction === "in" && (transaction.type === "sale" || transaction.type === "collection"))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const revenueChangePercent = yesterdayRevenue ? ((dailyRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : null;
  const dailyMethodRevenue = (method: PaymentMethod) => {
    const incoming = dailyRevenueTransactions.filter((transaction) => transaction.method === method);
    const methodExpenses = selectedTransactions.filter((transaction) => transaction.method === method && transaction.type === "expense");
    const amount = incoming.reduce((sum, transaction) => sum + transaction.amount, 0);
    const outgoing = methodExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
    return { amount, outgoing, net: amount - outgoing, count: incoming.length, share: dailyRevenue ? (amount / dailyRevenue) * 100 : 0 };
  };
  const dailyShiftRows = [...selectedShifts]
    .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime())
    .map((shift) => {
      const openedAt = new Date(shift.openedAt).getTime();
      const closedAt = shift.closedAt ? new Date(shift.closedAt).getTime() : Number.POSITIVE_INFINITY;
      const transactions = selectedTransactions.filter((transaction) => {
        const time = new Date(transaction.createdAt).getTime();
        return time >= openedAt && time <= closedAt;
      });
      const incomeFor = (method: PaymentMethod) => transactions
        .filter((transaction) => transaction.direction === "in" && (transaction.type === "sale" || transaction.type === "collection") && transaction.method === method)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const revenue = incomeFor("cash") + incomeFor("instapay") + incomeFor("vodafone");
      const expenses = transactions.filter((transaction) => transaction.type === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
      return { shift, cash: incomeFor("cash"), instapay: incomeFor("instapay"), vodafone: incomeFor("vodafone"), revenue, expenses, net: revenue - expenses, transactions: transactions.length };
    });
  const shiftTransactions = viewedShift
    ? state.cashTransactions.filter((transaction) => {
      const time = new Date(transaction.createdAt).getTime();
      return time >= new Date(viewedShift.openedAt).getTime()
        && (!viewedShift.closedAt || time <= new Date(viewedShift.closedAt).getTime());
    })
    : [];
  const displayedTransactions = cashTab === "shift" ? shiftTransactions : selectedTransactions;
  const filteredTransactions = transactionMethodFilter === "all"
    ? displayedTransactions
    : displayedTransactions.filter((transaction) => transaction.method === transactionMethodFilter);
  const displayedOpeningBalance = cashTab === "shift" ? (viewedShift?.openingBalance ?? 0) : selectedOpeningBalance;
  const methodSummary = (method: PaymentMethod) => {
    const transactions = displayedTransactions.filter((transaction) => transaction.method === method);
    const incoming = transactions.filter((transaction) => transaction.direction === "in").reduce((sum, transaction) => sum + transaction.amount, 0);
    const outgoing = transactions.filter((transaction) => transaction.direction === "out").reduce((sum, transaction) => sum + transaction.amount, 0);
    return { incoming, outgoing, count: transactions.length, balance: incoming - outgoing + (method === "cash" ? displayedOpeningBalance : 0) };
  };
  const cashSummary = methodSummary("cash");
  const instapaySummary = methodSummary("instapay");
  const vodafoneSummary = methodSummary("vodafone");
  const totalBalance = cashSummary.balance + instapaySummary.balance + vodafoneSummary.balance;
  const orderNumberById = new Map(state.orders.map((order) => [order.id, order.number]));
  const balanceAfter = new Map<string, number>();
  const runningBalance: Record<PaymentMethod, number> = { cash: displayedOpeningBalance, instapay: 0, vodafone: 0 };
  [...displayedTransactions].reverse().forEach((transaction) => {
    const method = transaction.method as PaymentMethod;
    runningBalance[method] += transaction.direction === "in" ? transaction.amount : -transaction.amount;
    balanceAfter.set(transaction.id, runningBalance[method]);
  });
  const transactionTypeLabels: Record<CashTransaction["type"], string> = {
    sale: "إيراد بيع", collection: "تحصيل عهدة", expense: "مصروف", deposit: "إيداع", withdrawal: "سحب"
  };
  const activeShiftTransactions = activeShift ? shiftTransactions : [];
  const expectedClosingCash = activeShift
    ? activeShift.openingBalance + activeShiftTransactions
      .filter((transaction) => transaction.method === "cash")
      .reduce((sum, transaction) => sum + (transaction.direction === "in" ? transaction.amount : -transaction.amount), 0)
    : 0;
  const openShift = () => {
    const openedAt = new Date().toISOString();
    const shift = { id: uid(), openedAt, openingBalance: Math.max(0, openingAmount) };
    update((current) => ({
      ...current,
      cashShifts: [shift, ...current.cashShifts],
      shiftOpeningBalance: shift.openingBalance,
      shiftOpenedAt: openedAt
    }));
    setSelectedDate(todayKey());
    setOpeningShift(false);
    setOpeningAmount(0);
    notify("تم فتح الوردية بنجاح");
  };
  const closeShift = () => {
    if (!activeShift) return;
    const actualCash = Math.max(0, closingData.actualCash);
    const closedAt = new Date().toISOString();
    update((current) => ({
      ...current,
      cashShifts: current.cashShifts.map((shift) => shift.id === activeShift.id ? {
        ...shift, closedAt, expectedCash: expectedClosingCash, actualCash,
        difference: actualCash - expectedClosingCash, note: closingData.note || undefined
      } : shift)
    }));
    setClosingShift(false);
    setClosingData({ actualCash: 0, note: "" });
    notify("تم إغلاق الوردية وتسجيل نتيجة الجرد");
  };
  const addExpense = () => {
    if (!activeShift) { notify("افتح وردية أولًا قبل تسجيل المصروف"); return; }
    if (!expenseData.amount || !expenseData.description) return;
    update((current) => ({ ...current, cashTransactions: [{
      id: uid(), type: "expense", method: expenseData.method, amount: expenseData.amount, direction: "out",
      description: expenseData.description, createdAt: new Date().toISOString()
    }, ...current.cashTransactions] }));
    setExpense(false); setExpenseData({ amount: 0, description: "", method: "cash" }); notify("تم تسجيل المصروف");
  };
  return (
    <div className="cash-page">
      <div className="cash-view-tabs">
        <button className={cashTab === "treasury" ? "active" : ""} onClick={() => setCashTab("treasury")}><WalletCards /><span><strong>الخزنة</strong><small>الأرصدة والحركات حسب التاريخ</small></span></button>
        <button className={cashTab === "shift" ? "active" : ""} onClick={() => setCashTab("shift")}><Clock3 /><span><strong>الوردية</strong><small>متابعة وفتح وإغلاق الوردية</small></span><b className={activeShift ? "open" : "closed"}>{activeShift ? "مفتوحة" : "مغلقة"}</b></button>
        <button className={cashTab === "daily" ? "active" : ""} onClick={() => setCashTab("daily")}><BarChart3 /><span><strong>الإيراد اليومي</strong><small>تجميع ومقارنة كل ورديات اليوم</small></span></button>
      </div>
      <div className="cash-hero">
        <div>
          <span>{cashTab === "treasury" ? `إجمالي أرصدة يوم ${selectedDate}` : cashTab === "daily" ? `إجمالي إيراد يوم ${selectedDate}` : activeShift ? "إجمالي أموال الوردية الحالية" : "إجمالي أموال آخر وردية"}</span>
          <strong>{money(cashTab === "daily" ? dailyRevenue : totalBalance)}</strong>
          <small>{cashTab === "treasury" ? "إجمالي النقدي وإنستاباي وفودافون كاش في التاريخ المحدد" : cashTab === "daily" ? `${dailyOrderCount} طلب · ${selectedShifts.length} وردية · ${dailyRevenueTransactions.length} حركة` : viewedShift ? `${activeShift ? "مفتوحة منذ" : "أُغلقت"} ${shortDate(activeShift?.openedAt ?? viewedShift.closedAt ?? viewedShift.openedAt)}` : "لم يتم تسجيل أي وردية بعد"}</small>
          {cashTab === "daily" && revenueChangePercent !== null && <span className={`revenue-change ${revenueChangePercent >= 0 ? "up" : "down"}`}>{revenueChangePercent >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {revenueChangePercent >= 0 ? "+" : ""}{revenueChangePercent.toFixed(1)}% مقارنة بأمس ({money(yesterdayRevenue)})</span>}
        </div>
        <div className="cash-hero-actions">
          {cashTab !== "daily" && <button className="light-button" disabled={!activeShift} onClick={() => setExpense(true)}><Minus /> تسجيل مصروف</button>}
          {cashTab === "shift" && (activeShift
            ? <button className="light-button close-shift-button" onClick={() => { setClosingData({ actualCash: expectedClosingCash, note: "" }); setClosingShift(true); }}><X /> إغلاق الوردية</button>
            : <button className="light-button open-shift-button" onClick={() => setOpeningShift(true)}><Plus /> فتح وردية</button>)}
        </div>
      </div>
      {cashTab !== "shift" && <div className="cash-date-filter">
        <div><CalendarRange /><span><strong>{cashTab === "daily" ? "تاريخ تقرير الإيراد" : "فلترة الخزنة بالتاريخ"}</strong><small>{cashTab === "daily" ? "اختر اليوم المطلوب لتجميع كل وردياته" : "اعرض أرصدة وحركات يوم محدد"}</small></span></div>
        <div className="cash-date-actions">
          <button className={selectedDate === todayKey() ? "active" : ""} onClick={() => setSelectedDate(todayKey())}>اليوم</button>
          <button onClick={() => { const date = new Date(); date.setDate(date.getDate() - 1); setSelectedDate(dateKey(date)); }}>أمس</button>
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
        </div>
      </div>}
      {cashTab === "shift" && viewedShift && <div className="cash-shifts-summary">
        <article>
          <span className={`cash-shift-status ${viewedShift.closedAt ? "closed" : "open"}`}>{viewedShift.closedAt ? "مغلقة" : "مفتوحة"}</span>
          <span><small>وقت الفتح</small><b>{shortDate(viewedShift.openedAt)}</b></span>
          <span><small>رصيد البداية</small><b>{money(viewedShift.openingBalance)}</b></span>
          <span><small>{viewedShift.closedAt ? "وقت الإغلاق" : "النقدي المتوقع"}</small><b>{viewedShift.closedAt ? shortDate(viewedShift.closedAt) : money(expectedClosingCash)}</b></span>
          <span><small>فرق الجرد</small><b className={(viewedShift.difference ?? 0) === 0 ? "matched" : "different"}>{viewedShift.closedAt ? money(viewedShift.difference ?? 0) : "—"}</b></span>
        </article>
      </div>}
      {cashTab === "shift" && !viewedShift && <div className="shift-empty-state"><Clock3 /><div><strong>لم تبدأ أي وردية بعد</strong><small>افتح أول وردية وحدد الرصيد النقدي الموجود في الدرج.</small></div><button className="primary-button compact" onClick={() => setOpeningShift(true)}><Plus /> فتح وردية</button></div>}
      {cashTab !== "daily" && <><div className="cash-method-cards">
        <CashMethodCard icon={<Banknote />} label="الخزنة النقدية" hint={cashTab === "shift" ? `رصيد بداية الوردية ${money(displayedOpeningBalance)}` : `رصيد افتتاح اليوم ${money(selectedOpeningBalance)}`} summary={cashSummary} tone="cash" />
        <CashMethodCard icon={<CreditCard />} label="إنستاباي" hint={cashTab === "shift" ? "تحويلات إنستاباي داخل الوردية" : "التحويلات البنكية في التاريخ المحدد"} summary={instapaySummary} tone="instapay" />
        <CashMethodCard icon={<Phone />} label="فودافون كاش" hint={cashTab === "shift" ? "تحويلات المحفظة داخل الوردية" : "تحويلات المحفظة في التاريخ المحدد"} summary={vodafoneSummary} tone="vodafone" />
      </div>
      <div className="panel cash-transactions-panel">
        <div className="panel-title cash-transactions-title">
          <div><WalletCards /><span><strong>{cashTab === "shift" ? "حركات الوردية" : `سجل حركات ${selectedDate}`}</strong><small>{cashTab === "shift" ? "كل الأموال الداخلة والخارجة منذ فتح الوردية" : "تفاصيل الأموال الداخلة والخارجة موزعة حسب وسيلة الدفع"}</small></span></div>
          <div className="transaction-method-filter">
            <button className={transactionMethodFilter === "all" ? "active" : ""} onClick={() => setTransactionMethodFilter("all")}>الكل</button>
            <button className={transactionMethodFilter === "cash" ? "active" : ""} onClick={() => setTransactionMethodFilter("cash")}><Banknote /> نقدي</button>
            <button className={transactionMethodFilter === "instapay" ? "active" : ""} onClick={() => setTransactionMethodFilter("instapay")}><CreditCard /> إنستاباي</button>
            <button className={transactionMethodFilter === "vodafone" ? "active" : ""} onClick={() => setTransactionMethodFilter("vodafone")}><Phone /> فودافون كاش</button>
          </div>
          <b>{filteredTransactions.length}{transactionMethodFilter !== "all" ? ` من ${displayedTransactions.length}` : ""} حركة</b>
        </div>
        <div className="cash-transactions-scroll">
          {!!filteredTransactions.length && <div className="cash-transactions-head"><span>الوقت</span><span>البيان والمرجع</span><span>النوع</span><span>الوسيلة</span><span>الاتجاه</span><span>المبلغ</span><span>الرصيد بعد الحركة</span></div>}
          <div className="cash-transactions-table">
          {filteredTransactions.map((transaction) => (
            <div className="cash-transaction-row" key={transaction.id}>
              <span className="cash-transaction-date">{shortDate(transaction.createdAt)}</span>
              <span className="cash-transaction-description"><strong>{transaction.description}</strong><small>{transaction.orderId && orderNumberById.has(transaction.orderId) ? `مرجع الطلب #${orderNumberById.get(transaction.orderId)}` : "حركة مسجلة بالنظام"}</small></span>
              <span><b className="transaction-type">{transactionTypeLabels[transaction.type]}</b></span>
              <span><b className={`transaction-method ${transaction.method}`}>{transaction.method === "cash" ? <Banknote /> : transaction.method === "instapay" ? <CreditCard /> : <Phone />}{paymentLabels[transaction.method as PaymentMethod] ?? "نقدي"}</b></span>
              <span><b className={`transaction-direction ${transaction.direction}`}>{transaction.direction === "in" ? "وارد" : "صادر"}</b></span>
              <b className={`transaction-amount ${transaction.direction}`}>{transaction.direction === "in" ? "+" : "-"} {money(transaction.amount)}</b>
              <b className="transaction-balance">{money(balanceAfter.get(transaction.id) ?? 0)}</b>
            </div>
          ))}
          {!filteredTransactions.length && <Empty icon={<WalletCards />} title={transactionMethodFilter !== "all" ? "لا توجد حركات بطريقة الدفع المحددة" : cashTab === "shift" ? "لا توجد حركات في الوردية" : "لا توجد حركات في هذا التاريخ"} text={transactionMethodFilter !== "all" ? "اختر طريقة دفع أخرى أو اعرض كل الحركات" : cashTab === "shift" ? "الحركات الجديدة ستظهر هنا بعد بدء البيع أو تسجيل مصروف" : "غيّر التاريخ أو ابدأ تسجيل حركات جديدة"} />}
          </div>
        </div>
      </div></>}
      {cashTab === "daily" && <DailyRevenueView
        date={selectedDate}
        revenue={dailyRevenue}
        sales={dailySalesRevenue}
        collections={dailyCollections}
        expenses={dailyOperationalExpenses}
        net={dailyNet}
        methods={{
          cash: dailyMethodRevenue("cash"),
          instapay: dailyMethodRevenue("instapay"),
          vodafone: dailyMethodRevenue("vodafone")
        }}
        shifts={dailyShiftRows}
        transactions={dailyRevenueTransactions}
        methodFilter={dailyMethodFilter}
        onMethodFilter={setDailyMethodFilter}
        orderNumberById={orderNumberById}
        transactionTypeLabels={transactionTypeLabels}
        orderCount={dailyOrderCount}
        avgOrder={dailyAvgOrder}
        pending={dailyPending}
        discounts={dailyDiscounts}
        deliveryFees={dailyDeliveryFees}
        revenueChange={revenueChangePercent}
        yesterdayRevenue={yesterdayRevenue}
      />}
      {expense && <Modal title="تسجيل مصروف" onClose={() => setExpense(false)}><div className="form-stack cash-expense-form">
        <fieldset className="settlement-payment-methods"><legend>الدفع من</legend>
          <button type="button" className={expenseData.method === "cash" ? "active" : ""} onClick={() => setExpenseData({ ...expenseData, method: "cash" })}><Banknote /><span><strong>نقدي</strong></span><i>{expenseData.method === "cash" && <Check />}</i></button>
          <button type="button" className={expenseData.method === "instapay" ? "active" : ""} onClick={() => setExpenseData({ ...expenseData, method: "instapay" })}><CreditCard /><span><strong>إنستاباي</strong></span><i>{expenseData.method === "instapay" && <Check />}</i></button>
          <button type="button" className={expenseData.method === "vodafone" ? "active" : ""} onClick={() => setExpenseData({ ...expenseData, method: "vodafone" })}><Phone /><span><strong>فودافون كاش</strong></span><i>{expenseData.method === "vodafone" && <Check />}</i></button>
        </fieldset>
        <label>قيمة المصروف<input type="number" min="0" value={expenseData.amount || ""} onChange={(e) => setExpenseData({ ...expenseData, amount: Number(e.target.value) })} /></label>
        <label>سبب المصروف<input autoFocus value={expenseData.description} onChange={(e) => setExpenseData({ ...expenseData, description: e.target.value })} placeholder="مثال: شراء تغليف" /></label>
        <button className="primary-button" onClick={addExpense}>تسجيل المصروف</button>
      </div></Modal>}
      {openingShift && <Modal title="فتح وردية جديدة" onClose={() => setOpeningShift(false)}><div className="shift-operation-modal">
        <div className="shift-operation-hero open"><span><Plus /></span><div><strong>بدء يوم عمل جديد</strong><small>سجّل المبلغ النقدي الموجود فعليًا في درج الكاشير قبل أول عملية بيع.</small></div></div>
        <label>رصيد بداية الوردية<input autoFocus type="number" min="0" value={openingAmount || ""} onChange={(event) => setOpeningAmount(Number(event.target.value))} /></label>
        <div className="shift-operation-note"><Info /> إنستاباي وفودافون كاش يبدأ رصيدهما اليومي من صفر، والرصيد الافتتاحي يخص النقدي فقط.</div>
        <button className="primary-button" onClick={openShift}><Plus /> فتح الوردية الآن</button>
      </div></Modal>}
      {closingShift && activeShift && <Modal title="إغلاق الوردية" onClose={() => setClosingShift(false)}><div className="shift-operation-modal">
        <div className="shift-operation-hero close"><span><WalletCards /></span><div><strong>جرد وإغلاق الوردية</strong><small>عدّ النقدي الموجود فعليًا في الدرج ثم أدخل قيمته للمقارنة مع رصيد النظام.</small></div></div>
        <div className="shift-closing-summary"><span><small>رصيد البداية</small><b>{money(activeShift.openingBalance)}</b></span><span><small>النقدي المتوقع</small><b>{money(expectedClosingCash)}</b></span></div>
        <label>النقدي الفعلي في الدرج<input autoFocus type="number" min="0" value={closingData.actualCash || ""} onChange={(event) => setClosingData({ ...closingData, actualCash: Number(event.target.value) })} /></label>
        <div className={`shift-difference ${closingData.actualCash - expectedClosingCash === 0 ? "matched" : ""}`}><span>فرق الجرد</span><strong>{money(closingData.actualCash - expectedClosingCash)}</strong></div>
        <label>ملاحظات الإغلاق<textarea value={closingData.note} onChange={(event) => setClosingData({ ...closingData, note: event.target.value })} placeholder="سبب العجز أو الزيادة إن وجد" /></label>
        <button className="primary-button close-shift-confirm" onClick={closeShift}><Check /> اعتماد وإغلاق الوردية</button>
      </div></Modal>}
    </div>
  );
}

function CashMethodCard({ icon, label, hint, summary, tone }: {
  icon: ReactNode;
  label: string;
  hint: string;
  summary: { incoming: number; outgoing: number; count: number; balance: number };
  tone: "cash" | "instapay" | "vodafone";
}) {
  return <article className={`cash-method-card ${tone}`}>
    <header><span>{icon}</span><div><strong>{label}</strong><small>{hint}</small></div></header>
    <div className="cash-method-balance"><small>الرصيد الحالي</small><strong>{money(summary.balance)}</strong></div>
    <footer><span><small>وارد</small><b>+ {money(summary.incoming)}</b></span><span><small>صادر</small><b>- {money(summary.outgoing)}</b></span><span><small>الحركات</small><b>{summary.count}</b></span></footer>
  </article>;
}

function DailyRevenueView({ date, revenue, sales, collections, expenses, net, methods, shifts, transactions, methodFilter, onMethodFilter, orderNumberById, transactionTypeLabels, orderCount, avgOrder, pending, discounts, deliveryFees, revenueChange }: {
  date: string;
  revenue: number;
  sales: number;
  collections: number;
  expenses: number;
  net: number;
  methods: Record<PaymentMethod, { amount: number; outgoing: number; net: number; count: number; share: number }>;
  shifts: Array<{
    shift: AppState["cashShifts"][number];
    cash: number;
    instapay: number;
    vodafone: number;
    revenue: number;
    expenses: number;
    net: number;
    transactions: number;
  }>;
  transactions: CashTransaction[];
  methodFilter: "all" | PaymentMethod;
  onMethodFilter: (method: "all" | PaymentMethod) => void;
  orderNumberById: Map<string, number>;
  transactionTypeLabels: Record<CashTransaction["type"], string>;
  orderCount: number;
  avgOrder: number;
  pending: number;
  discounts: number;
  deliveryFees: number;
  revenueChange: number | null;
  yesterdayRevenue: number;
}) {
  const filtered = methodFilter === "all" ? transactions : transactions.filter((transaction) => transaction.method === methodFilter);
  const shiftForTransaction = (transaction: CashTransaction) => shifts.find(({ shift }) => {
    const time = new Date(transaction.createdAt).getTime();
    return time >= new Date(shift.openedAt).getTime() && (!shift.closedAt || time <= new Date(shift.closedAt).getTime());
  });
  const totalShiftRevenue = shifts.reduce((sum, r) => sum + r.revenue, 0);
  const maxShiftRevenue = Math.max(1, ...shifts.map((r) => r.revenue));
  const outsideShiftRevenue = revenue - totalShiftRevenue;
  return <div className="daily-revenue-view">
    <div className="daily-revenue-kpis">
      <MiniStat icon={<CircleDollarSign />} label="إجمالي الإيراد" value={money(revenue)} tone="green" />
      <MiniStat icon={<ReceiptText />} label="مبيعات مباشرة" value={money(sales)} tone="blue" />
      <MiniStat icon={<Banknote />} label="تحصيل عهد المناديب" value={money(collections)} tone="orange" />
    </div>
    <div className="daily-revenue-kpis">
      <MiniStat icon={<BarChart3 />} label="صافي اليوم" value={money(net)} tone={net >= 0 ? "green" : "red"} />
      <MiniStat icon={<ClipboardCheck />} label={`الطلبات (${orderCount})`} value={money(avgOrder) + " متوسط"} tone="blue" />
      <MiniStat icon={<Minus />} label="المصروفات التشغيلية" value={money(expenses)} tone="red" />
    </div>
    <div className="daily-info-strip">
      <span><Clock3 size={15} /><small>معلق مع المناديب</small><b>{money(pending)}</b></span>
      {discounts > 0 && <span><Calculator size={15} /><small>خصومات اليوم</small><b>{money(discounts)}</b></span>}
      {deliveryFees > 0 && <span><Truck size={15} /><small>رسوم التوصيل</small><b>{money(deliveryFees)}</b></span>}
      {revenueChange !== null && <span className={`revenue-change-inline ${revenueChange >= 0 ? "up" : "down"}`}>{revenueChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}<small>مقارنة بأمس</small><b>{revenueChange >= 0 ? "+" : ""}{revenueChange.toFixed(1)}%</b></span>}
    </div>

    <section className="daily-method-section">
      <div className="daily-section-heading"><div><CreditCard /><span><strong>الإيراد حسب طريقة الدفع</strong><small>نسبة ومبلغ كل وسيلة من إجمالي إيراد اليوم</small></span></div><span><small>صافي حركة اليوم</small><b>{money(net)}</b></span></div>
      <div className="daily-method-grid">
        <DailyMethodCard icon={<Banknote />} label="نقدي" tone="cash" data={methods.cash} />
        <DailyMethodCard icon={<CreditCard />} label="إنستاباي" tone="instapay" data={methods.instapay} />
        <DailyMethodCard icon={<Phone />} label="فودافون كاش" tone="vodafone" data={methods.vodafone} />
      </div>
    </section>

    <section className="daily-shifts-panel">
      <div className="daily-section-heading"><div><Clock3 /><span><strong>إيراد كل وردية</strong><small>{shifts.length ? `${shifts.length} وردية مسجلة يوم ${date}` : "لا توجد ورديات في التاريخ المحدد"}</small></span></div><b>{money(totalShiftRevenue)}</b></div>
      {!!shifts.length && <div className="daily-shifts-table-scroll">
        <div className="daily-shifts-table-head"><span>الوردية</span><span>الفترة</span><span>نقدي</span><span>إنستاباي</span><span>فودافون كاش</span><span>المصروفات</span><span>الإيراد</span><span>الصافي</span></div>
        {shifts.map(({ shift, cash, instapay, vodafone, revenue: sr, expenses: se, net: sn }, index) => {
          const mins = shift.closedAt ? Math.round((new Date(shift.closedAt).getTime() - new Date(shift.openedAt).getTime()) / 60000) : Math.round((Date.now() - new Date(shift.openedAt).getTime()) / 60000);
          const dur = mins >= 60 ? `${Math.floor(mins / 60)} ساعة ${mins % 60 ? `${mins % 60} د` : ""}` : `${mins} دقيقة`;
          return <div className="daily-shift-row" key={shift.id}>
            <span><strong>وردية {index + 1}</strong><small className={`cash-shift-status ${shift.closedAt ? "closed" : "open"}`}>{shift.closedAt ? "مغلقة" : "مفتوحة"}</small><small className="shift-duration">{dur}</small></span>
            <span><b>{new Intl.DateTimeFormat("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit" }).format(new Date(shift.openedAt))}</b><small>إلى {shift.closedAt ? new Intl.DateTimeFormat("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit" }).format(new Date(shift.closedAt)) : "الآن"}</small></span>
            <b>{money(cash)}</b><b>{money(instapay)}</b><b>{money(vodafone)}</b><b className="out">{money(se)}</b><b>{money(sr)}</b><b className={sn >= 0 ? "net" : "out"}>{money(sn)}</b>
            <div className="shift-bar"><i style={{ width: `${(sr / maxShiftRevenue) * 100}%` }} /></div>
          </div>;
        })}
        <div className="daily-shift-row daily-shift-totals">
          <span><strong>الإجمالي</strong></span><span />
          <b>{money(shifts.reduce((s, r) => s + r.cash, 0))}</b>
          <b>{money(shifts.reduce((s, r) => s + r.instapay, 0))}</b>
          <b>{money(shifts.reduce((s, r) => s + r.vodafone, 0))}</b>
          <b className="out">{money(shifts.reduce((s, r) => s + r.expenses, 0))}</b>
          <b>{money(totalShiftRevenue)}</b>
          <b className={shifts.reduce((s, r) => s + r.net, 0) >= 0 ? "net" : "out"}>{money(shifts.reduce((s, r) => s + r.net, 0))}</b>
        </div>
        {outsideShiftRevenue > 0 && <div className="daily-shift-outside-note"><Info size={14} /><span>يوجد {money(outsideShiftRevenue)} إيراد مسجل خارج نطاق الورديات</span></div>}
      </div>}
      {!shifts.length && <Empty icon={<Clock3 />} title="لا توجد ورديات في هذا اليوم" text="اختر تاريخًا آخر أو افتح وردية جديدة" />}
    </section>

    <section className="panel daily-revenue-transactions">
      <div className="panel-title cash-transactions-title">
        <div><ReceiptText /><span><strong>تفاصيل إيرادات اليوم</strong><small>المبيعات والتحصيلات الواردة فقط</small></span></div>
        <div className="transaction-method-filter">
          <button className={methodFilter === "all" ? "active" : ""} onClick={() => onMethodFilter("all")}>الكل</button>
          <button className={methodFilter === "cash" ? "active" : ""} onClick={() => onMethodFilter("cash")}><Banknote /> نقدي</button>
          <button className={methodFilter === "instapay" ? "active" : ""} onClick={() => onMethodFilter("instapay")}><CreditCard /> إنستاباي</button>
          <button className={methodFilter === "vodafone" ? "active" : ""} onClick={() => onMethodFilter("vodafone")}><Phone /> فودافون كاش</button>
        </div>
        <b>{filtered.length} حركة</b>
      </div>
      <div className="daily-revenue-table-scroll">
        {!!filtered.length && <div className="daily-revenue-table-head"><span>الوقت</span><span>الفاتورة / البيان</span><span>الوردية</span><span>النوع</span><span>طريقة الدفع</span><span>المبلغ</span></div>}
        {filtered.map((transaction) => {
          const shiftRow = shiftForTransaction(transaction);
          const shiftIndex = shiftRow ? shifts.indexOf(shiftRow) + 1 : 0;
          const orderNum = transaction.orderId ? orderNumberById.get(transaction.orderId) : undefined;
          return <div className="daily-revenue-row" key={transaction.id}>
            <span>{shortDate(transaction.createdAt)}</span>
            <span>{orderNum !== undefined && <b className="invoice-num">#{orderNum}</b>}<strong>{transaction.description}</strong><small>{transaction.orderId && orderNumberById.has(transaction.orderId) ? `مرجع الطلب #${orderNumberById.get(transaction.orderId)}` : "حركة مسجلة بالنظام"}</small></span>
            <b>{shiftIndex ? `وردية ${shiftIndex}` : "خارج وردية"}</b>
            <span><b className="transaction-type">{transactionTypeLabels[transaction.type]}</b></span>
            <span><b className={`transaction-method ${transaction.method}`}>{transaction.method === "cash" ? <Banknote /> : transaction.method === "instapay" ? <CreditCard /> : <Phone />}{paymentLabels[transaction.method as PaymentMethod]}</b></span>
            <b className="daily-revenue-amount">+ {money(transaction.amount)}</b>
          </div>;
        })}
        {!filtered.length && <Empty icon={<ReceiptText />} title="لا توجد إيرادات مطابقة" text="غيّر التاريخ أو طريقة الدفع لعرض نتائج أخرى" />}
      </div>
    </section>
  </div>;
}

function DailyMethodCard({ icon, label, tone, data }: {
  icon: ReactNode;
  label: string;
  tone: "cash" | "instapay" | "vodafone";
  data: { amount: number; outgoing: number; net: number; count: number; share: number };
}) {
  return <article className={`daily-method-card ${tone}`}>
    <header><span>{icon}</span><div><strong>{label}</strong><small>{data.count} حركة إيراد</small></div><b>{data.share.toFixed(1)}%</b></header>
    <div className="daily-method-amount"><small>إجمالي الوارد</small><strong>{money(data.amount)}</strong></div>
    <div className="daily-method-progress"><i style={{ width: `${Math.min(100, data.share)}%` }} /></div>
    <footer><span>مصروفات <b>{money(data.outgoing)}</b></span><span>الصافي <b>{money(data.net)}</b></span></footer>
  </article>;
}

export function ReportsView({ state }: { state: AppState }) {
  const orders = state.orders.filter((order) => dateKey(order.createdAt) === todayKey());
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
