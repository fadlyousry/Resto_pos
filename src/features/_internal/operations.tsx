import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight, Banknote, BarChart3, Bike, Calculator, CalendarRange, Check,
  ChevronDown, ChevronLeft, CircleDollarSign, ClipboardCheck, Clock3, CookingPot, CreditCard,
  Edit3, Info, MapPin, MessageCircle, Minus, PackageCheck, Phone, Plus, Printer,
  ReceiptText, Save, Search, ShoppingBag, Trash2, TrendingDown, TrendingUp, Truck, UserPlus,
  Utensils, WalletCards, X, Shuffle, BadgeDollarSign
} from "lucide-react";
import type {
  AppState, CashTransaction, Customer, Driver, DriverSettlement, MenuSection, Order, OrderItem,
  OrderStage, PaymentMethod, Product, ProductSection, Meal, MealComponent, MealChoiceGroup, MealChoiceItem
} from "../../domain/types";
import { CustomerFile } from "./management";
import { InvoiceModal } from "../orders/InvoiceModal";
import type { ViewProps } from "../../shared/contracts";
import {
  dateKey, dateTimeValue, money, orderDisplayNumber, paymentLabels, shortDate, stageLabels, todayKey
} from "../../shared/format";
import { uid } from "../../shared/id";
import { purchasesTreasuryId, salesTreasuryId, treasuryName, transactionTreasuryId } from "../../shared/treasury";
import { Empty, MiniStat, Modal, StatusBadge } from "../../shared/ui";
import { errorMessage, isDesktopRuntime, printOrderReceipts } from "../../infrastructure/desktopPrinting";
import { playOrderConfirmedSound } from "../../shared/sound";

const MEALS_SECTION = "__meals";

function nextShiftOrderNumber(state: AppState) {
  const defaultTreasuryId = salesTreasuryId(state);
  const activeShift = state.cashShifts.find((shift) =>
    !shift.closedAt && (shift.treasuryId ?? defaultTreasuryId) === defaultTreasuryId
  );
  if (!activeShift) return 101;
  return state.orders.reduce(
    (highest, order) => order.shiftId === activeShift.id
      ? Math.max(highest, order.shiftNumber ?? 100)
      : highest,
    100
  ) + 1;
}

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
  const [customizingMeal, setCustomizingMeal] = useState<Meal | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const hasOpenShift = state.cashShifts.some((shift) =>
    !shift.closedAt && (shift.treasuryId ?? salesTreasuryId(state)) === salesTreasuryId(state)
  );

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
    !product.isMealComponent &&
    product.section === section && product.available &&
    (category === "الكل" || product.category === category) &&
    product.name.includes(search.trim())
  );
  const meals = state.meals.filter((meal) => meal.available && meal.name.includes(search.trim()));
  const categories = section === MEALS_SECTION ? ["الكل"] : ["الكل", ...new Set(state.products.filter((product) => !product.isMealComponent && product.section === section).map((product) => product.category).filter(Boolean))];
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0);
  const normalizedCustomerQuery = customerQuery.trim().toLocaleLowerCase("ar");
  const searchDigits = customerQuery.trim().replace(/\D/g, "");
  const customerResults = customerQuery.trim()
    ? state.customers.filter((item) =>
        item.name.toLocaleLowerCase("ar").includes(normalizedCustomerQuery) ||
        (searchDigits.length > 0 && item.phone.replace(/\D/g, "").includes(searchDigits)) ||
        item.address.toLocaleLowerCase("ar").includes(normalizedCustomerQuery)
      ).slice(0, 8)
    : state.customers.slice(0, 5);

  const openCustomerPicker = () => {
    setCustomerQuery("");
    setCustomerCandidate(null);
    setCustomerRegistrationOpen(false);
    setCustomerForm({ name: "", phone: "", zone: "", address: "", notes: "" });
    setShowCustomers(true);
  };

  const openNewCustomerForm = (initialQuery = customerQuery) => {
    const trimmed = initialQuery.trim();
    const looksLikePhone = /^[\d+\s-]+$/.test(trimmed) && trimmed.replace(/\D/g, "").length > 0;
    setCustomerForm({
      name: looksLikePhone ? "" : trimmed,
      phone: looksLikePhone ? trimmed.replace(/[^\d+]/g, "") : "",
      zone: "",
      address: "",
      notes: ""
    });
    setCustomerCandidate(null);
    setCustomerRegistrationOpen(true);
  };

  const changeCustomerSearch = (value: string) => {
    setCustomerQuery(value);
    setCustomerCandidate(null);
    const looksLikePhone = /^[\d+\s-]+$/.test(value.trim()) && value.trim().replace(/\D/g, "").length > 0;
    setCustomerForm((current) => ({
      ...current,
      name: looksLikePhone ? "" : value.trim(),
      phone: looksLikePhone ? value.trim().replace(/[^\d+]/g, "") : ""
    }));
  };

  const confirmExistingCustomer = () => {
    if (!customerCandidate) return;
    const name = customerCandidate.name.trim();
    const phone = customerCandidate.phone.trim();
    const address = customerCandidate.address.trim();

    if (!name || name.length < 2) {
      notify("يرجى إدخال اسم العميل (حرفين على الأقل)");
      return;
    }
    if (!phone || phone.replace(/\D/g, "").length < 8) {
      notify("يرجى إدخال رقم هاتف صحيح");
      return;
    }
    if (!address) {
      notify("يرجى إدخال عنوان التوصيل");
      return;
    }

    const updatedCandidate: Customer = {
      ...customerCandidate,
      name,
      phone,
      address
    };

    update((current) => ({
      ...current,
      customers: current.customers.map((item) => item.id === updatedCandidate.id ? updatedCandidate : item),
      orders: current.orders.map((order) => order.customerId === updatedCandidate.id ? {
        ...order,
        customerName: updatedCandidate.name,
        customerPhone: updatedCandidate.phone,
        address: updatedCandidate.address
      } : order)
    }));
    setCustomer(updatedCandidate);
    setShowCustomers(false);
    setCustomerCandidate(null);
    notify("تم اختيار العميل وعنوان التوصيل");
  };

  const registerCustomerFromSearch = () => {
    const name = customerForm.name.trim();
    const phone = customerForm.phone.trim();
    const address = customerForm.address.trim();

    if (!name || name.length < 2) {
      notify("يرجى إدخال اسم العميل (حرفين على الأقل)");
      return;
    }
    if (!phone || phone.replace(/\D/g, "").length < 8) {
      notify("يرجى إدخال رقم هاتف صحيح للعميل (8 أرقام على الأقل)");
      return;
    }
    if (!address) {
      notify("يرجى إدخال عنوان التوصيل");
      return;
    }

    const item: Customer = {
      id: uid(),
      name,
      phone,
      address,
      zone: customerForm.zone.trim(),
      notes: customerForm.notes.trim(),
      ordersCount: 0,
      totalSpent: 0
    };
    update((current) => ({ ...current, customers: [item, ...current.customers] }));
    setCustomer(item);
    setShowCustomers(false);
    setCustomerRegistrationOpen(false);
    setCustomerCandidate(null);
    notify(`تم تسجيل العميل "${name}" واختياره للطلب`);
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
    const cost = meal.components.reduce((sum, component) => {
      const product = state.products.find((p) => p.id === component.productId);
      const option = component.optionId ? product?.options?.find((opt) => opt.id === component.optionId) : null;
      const compCost = option?.cost ?? component.cost ?? product?.cost ?? 0;
      return sum + compCost * component.quantity;
    }, 0);
    setCart((current) => {
      const exists = current.find((item) => item.productId === productId);
      return exists
        ? current.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, {
          productId, mealId: meal.id,
          mealComponents: meal.components.map((component) => ({ ...component })),
          name: meal.name, unit: "وجبة", price: meal.price, cost, quantity: 1,
          section: MEALS_SECTION,
          note: meal.components.map((component) => `${component.quantity}× ${component.name}${component.optionName ? ` (${component.optionName})` : ""}`).join(" · ")
        }];
    });
  };

  const handleMealClick = (meal: Meal) => {
    const hasOptions = Boolean(meal.options && meal.options.length > 0);
    const hasChoices = Boolean(meal.choiceGroups && meal.choiceGroups.length > 0);
    if (hasOptions || hasChoices) {
      setCustomizingMeal(meal);
    } else {
      addMeal(meal);
    }
  };

  const addCustomizedMealToCart = (item: {
    mealId: string;
    optionId?: string;
    optionName?: string;
    name: string;
    price: number;
    cost: number;
    mealComponents: MealComponent[];
    note: string;
  }) => {
    const productId = `meal:${item.mealId}:${item.optionId ?? "base"}:${uid()}`;
    setCart((current) => [
      ...current,
      {
        productId,
        mealId: item.mealId,
        optionId: item.optionId,
        optionName: item.optionName,
        name: item.name,
        unit: "وجبة",
        price: item.price,
        cost: item.cost,
        quantity: 1,
        section: MEALS_SECTION,
        mealComponents: item.mealComponents,
        note: item.note
      }
    ]);
    setCustomizingMeal(null);
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
    const orderTreasuryId = editingOrder.treasuryId ?? salesTreasuryId(state);

    if (editingOrder.paymentStatus === "pending" && details.paymentStatus === "paid") {
      paymentTransactions.push({
        id: uid(), type: "collection", method: details.paymentMethod, amount: total, direction: "in",
        description: `تحصيل بعد تعديل فاتورة #${orderDisplayNumber(editingOrder)}`, orderId: editingOrder.id, treasuryId: orderTreasuryId, createdAt
      });
    } else if (editingOrder.paymentStatus === "paid" && details.paymentStatus === "pending") {
      paymentTransactions.push({
        id: uid(), type: "withdrawal", method: editingOrder.paymentMethod, amount: editingOrder.total, direction: "out",
        description: `عكس تحصيل فاتورة #${orderDisplayNumber(editingOrder)}`, orderId: editingOrder.id, treasuryId: orderTreasuryId, createdAt
      });
    } else if (editingOrder.paymentStatus === "paid" && details.paymentStatus === "paid") {
      if (editingOrder.paymentMethod !== details.paymentMethod) {
        paymentTransactions.push(
          {
            id: uid(), type: "withdrawal", method: editingOrder.paymentMethod, amount: editingOrder.total, direction: "out",
            description: `عكس طريقة دفع فاتورة #${orderDisplayNumber(editingOrder)}`, orderId: editingOrder.id, treasuryId: orderTreasuryId, createdAt
          },
          {
            id: uid(), type: "deposit", method: details.paymentMethod, amount: total, direction: "in",
            description: `إعادة تسجيل دفع فاتورة #${orderDisplayNumber(editingOrder)}`, orderId: editingOrder.id, treasuryId: orderTreasuryId, createdAt
          }
        );
      } else if (totalDifference !== 0) {
        paymentTransactions.push({
          id: uid(), type: totalDifference > 0 ? "deposit" : "withdrawal",
          method: details.paymentMethod, amount: Math.abs(totalDifference),
          direction: totalDifference > 0 ? "in" : "out",
          description: `فرق تعديل فاتورة #${orderDisplayNumber(editingOrder)}`, orderId: editingOrder.id, treasuryId: orderTreasuryId, createdAt
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
      inventoryDeducted: newUsage.size > 0,
      treasuryId: orderTreasuryId
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
          description: `تسوية تعديل طلب #${orderDisplayNumber(editingOrder)}`,
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
    playOrderConfirmedSound();
    notify(`تم تعديل الطلب #${orderDisplayNumber(editingOrder)} وتسوية الحساب والمخزون`);
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
    const orderTreasuryId = salesTreasuryId(state);
    const activeShift = state.cashShifts.find((shift) =>
      !shift.closedAt && (shift.treasuryId ?? orderTreasuryId) === orderTreasuryId
    )!;
    const shiftNumber = nextShiftOrderNumber(state);
    const consumption = orderRecipeUsage(cart, state);
    const stockMovements = [...consumption.entries()].map(([ingredientId, quantity]) => {
      const ingredient = state.ingredients.find((item) => item.id === ingredientId)!;
      return {
        id: uid(), ingredientId, ingredientName: ingredient?.name ?? "مكون",
        type: "consume" as const, quantity, unitCost: ingredient?.unitCost ?? 0,
        description: `استهلاك طلب #${shiftNumber}`, orderId, createdAt
      };
    });
    const order: Order = {
      id: orderId, number: state.nextOrderNumber, shiftNumber, shiftId: activeShift.id, customerId: customer.id,
      customerName: customer.name, customerPhone: customer.phone, address: customer.address,
      items: cart, subtotal, deliveryFee: details.deliveryFee, discount: details.discount, total,
      paymentMethod: details.paymentMethod, paymentStatus: details.paymentStatus,
      stage: "preparing", createdAt, scheduledFor: details.scheduledFor || undefined, note: details.note || undefined,
      driverId: details.driverId, driver: details.driver,
      inventoryDeducted: stockMovements.length > 0, source: "pos", treasuryId: orderTreasuryId
    };
    const transaction: CashTransaction | null = details.paymentStatus === "paid" ? {
      id: uid(), type: "sale", method: details.paymentMethod, amount: total, direction: "in",
      description: `فاتورة #${orderDisplayNumber(order)}`, orderId, treasuryId: orderTreasuryId, createdAt
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
    playOrderConfirmedSound();
    notify(`تم تسجيل الطلب #${orderDisplayNumber(order)}`);
    if (state.settings.printCustomerReceipt !== false || state.settings.printKitchenReceipt !== false) {
      if (isDesktopRuntime()) {
        void printOrderReceipts(order, state.settings).catch((error) => {
          notify(`تم تسجيل الطلب #${orderDisplayNumber(order)} لكن تعذرت الطباعة: ${errorMessage(error)}`);
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
            <strong>تعديل الطلب #{orderDisplayNumber(editingOrder)}</strong>
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
            {index % 2 ? <ShoppingBag /> : <Utensils />} <span><strong>{item.name}</strong><small>{state.products.filter((product) => !product.isMealComponent && product.section === item.id && product.available).length} صنف متاح</small></span>
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
          {section === MEALS_SECTION ? meals.map((meal) => {
            const hasOptions = Boolean(meal.options && meal.options.length > 0);
            const hasChoices = Boolean(meal.choiceGroups && meal.choiceGroups.length > 0);
            const minPrice = hasOptions ? Math.min(...meal.options!.map((o) => o.price)) : meal.price;
            const subtitleText = [
              meal.components.map((item) => `${item.quantity}× ${item.name}${item.optionName ? ` (${item.optionName})` : ""}`).join(" · "),
              hasChoices ? `${meal.choiceGroups!.length} خيارات تبديل (إما ده أو ده)` : ""
            ].filter(Boolean).join(" | ");

            return (
              <button className="product-card meal-card" onClick={() => handleMealClick(meal)} key={meal.id}>
                <div className="product-card-top">
                  <span className="food-visual meal-visual"><ShoppingBag size={26} /></span>
                  <span className="product-info">
                    <strong>{meal.name}</strong>
                    <small>{subtitleText}</small>
                  </span>
                </div>
                <div className="product-card-footer">
                  <span className="price-label">السعر</span>
                  <span className="price-divider" />
                  <span className="price-value">
                    {hasOptions ? `يبدأ من ${money(minPrice)} ج.م` : `${money(meal.price)} ج.م`}
                  </span>
                </div>
              </button>
            );
          }) : products.map((product) => (
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
            <b>#{editingOrder ? orderDisplayNumber(editingOrder) : nextShiftOrderNumber(state)}</b>
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
        <Modal
          title={customerRegistrationOpen ? "تسجيل عميل جديد" : customerCandidate ? "تأكيد بيانات العميل" : "اختيار العميل"}
          onClose={() => {
            setShowCustomers(false);
            setCustomerCandidate(null);
            setCustomerRegistrationOpen(false);
          }}
          size="medium"
        >
          {customerRegistrationOpen ? (
            <div className="customer-inline-register" onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                !(event.target instanceof HTMLButtonElement) &&
                !(event.target instanceof HTMLTextAreaElement)
              ) {
                event.preventDefault();
                registerCustomerFromSearch();
              }
            }}>
              <button type="button" className="back-to-results" onClick={() => setCustomerRegistrationOpen(false)}>
                <ChevronLeft /> الرجوع لنتائج البحث
              </button>
              <div className="not-found-title">
                <UserPlus />
                <span>
                  <strong>تسجيل عميل جديد للطلب</strong>
                  <small>اكتب بيانات العميل وسيتم حفظه تلقائيًا في سجل العملاء وتعيينه للطلب الحالي</small>
                </span>
              </div>
              <div className="inline-customer-form">
                <label>
                  <span>اسم العميل <em style={{ color: "#dc2626" }}>*</em></span>
                  <input
                    autoFocus={!customerForm.name}
                    value={customerForm.name}
                    onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })}
                    placeholder="اكتب اسم العميل بالكامل"
                  />
                </label>
                <label>
                  <span>رقم الهاتف <em style={{ color: "#dc2626" }}>*</em></span>
                  <input
                    autoFocus={Boolean(customerForm.name) && !customerForm.phone}
                    value={customerForm.phone}
                    onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })}
                    placeholder="01xxxxxxxxx"
                    inputMode="tel"
                  />
                </label>
                <label className="full-field">
                  <span>العنوان بالتفصيل <em style={{ color: "#dc2626" }}>*</em></span>
                  <textarea
                    autoFocus={Boolean(customerForm.name && customerForm.phone)}
                    value={customerForm.address}
                    onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })}
                    placeholder="المنطقة، الشارع، رقم العقار، الدور وأقرب علامة مميزة"
                  />
                </label>
                <label className="full-field">
                  <span>ملاحظات إضافية <i style={{ color: "#6b7280", fontStyle: "normal", fontSize: "11px" }}>(اختياري)</i></span>
                  <input
                    value={customerForm.notes}
                    onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })}
                    placeholder="أي تعليمات خاصة بالتوصيل أو الاتصال"
                  />
                </label>
              </div>
              <button type="button" className="primary-button customer-confirm-button" onClick={registerCustomerFromSearch}>
                <UserPlus size={18} /> حفظ واختيار العميل للطلب
              </button>
            </div>
          ) : customerCandidate ? (
            <div className="customer-address-step" onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                !(event.target instanceof HTMLButtonElement) &&
                !(event.target instanceof HTMLTextAreaElement)
              ) {
                event.preventDefault();
                confirmExistingCustomer();
              }
            }}>
              <button type="button" className="back-to-results" onClick={() => setCustomerCandidate(null)}>
                <ChevronLeft /> الرجوع لنتائج البحث
              </button>
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
              <button type="button" className="primary-button customer-confirm-button" onClick={confirmExistingCustomer}>
                <Check /> تأكيد العميل والعنوان
              </button>
            </div>
          ) : (
            <div>
              <div className="customer-search-bar-row">
                <label className="search-box modal-search" style={{ flex: 1, margin: 0 }}>
                  <Search size={18} />
                  <input
                    autoFocus
                    value={customerQuery}
                    onChange={(event) => changeCustomerSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        openNewCustomerForm();
                      }
                    }}
                    placeholder="ابحث بالاسم أو رقم الموبايل أو العنوان..."
                  />
                  {customerQuery && (
                    <button
                      type="button"
                      style={{ border: 0, background: "transparent", color: "#6b7280", cursor: "pointer", display: "grid", placeItems: "center", padding: "4px" }}
                      onClick={() => changeCustomerSearch("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                <button
                  type="button"
                  className="primary-button"
                  style={{ whiteSpace: "nowrap", minHeight: "46px", padding: "0 14px", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 800, flexShrink: 0 }}
                  onClick={() => openNewCustomerForm()}
                >
                  <UserPlus size={17} /> عميل جديد
                </button>
              </div>

              <div className="customer-results">
                {customerResults.length > 0 && (
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#6b7280", margin: "2px 0 4px" }}>
                    {customerQuery.trim() ? `العملاء المطابقون للبحث (${customerResults.length}):` : "العملاء المسجلون مؤخرًا:"}
                  </div>
                )}
                {customerResults.map((item) => {
                  const orderCount = Math.max(item.ordersCount, state.orders.filter((order) => order.customerId === item.id).length);
                  return (
                    <div
                      className="customer-result-item"
                      role="button"
                      tabIndex={0}
                      key={item.id}
                      onClick={() => setCustomerCandidate({ ...item })}
                      onKeyDown={(event) => event.key === "Enter" && setCustomerCandidate({ ...item })}
                    >
                      <span className="customer-avatar">{item.name.charAt(0)}</span>
                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.phone}</small>
                        <p>{item.address}</p>
                      </div>
                      <span className="customer-result-actions">
                        {orderCount > 0 && <em>{orderCount === 1 ? "طلب واحد" : `${orderCount} طلبات`}</em>}
                        <button
                          type="button"
                          title="فتح سجل العميل"
                          onClick={(event) => {
                            event.stopPropagation();
                            setHistoryCustomer({ ...item });
                            setShowCustomers(false);
                          }}
                        >
                          <Info />
                        </button>
                        <ChevronLeft />
                      </span>
                    </div>
                  );
                })}

                {customerResults.length === 0 && customerQuery.trim().length > 0 && (
                  <div
                    className="customer-enter-hint"
                    role="button"
                    tabIndex={0}
                    onClick={() => openNewCustomerForm()}
                    onKeyDown={(e) => { if (e.key === "Enter") openNewCustomerForm(); }}
                    style={{ cursor: "pointer" }}
                  >
                    <UserPlus />
                    <span>
                      <strong>لا يوجد عميل مسجل باسم أو رقم "{customerQuery.trim()}"</strong>
                      <small>اضغط هنا أو اضغط Enter لتسجيله كعميل جديد الآن</small>
                    </span>
                    <kbd>Enter ↵</kbd>
                  </div>
                )}

                {customerResults.length === 0 && customerQuery.trim().length === 0 && (
                  <div
                    className="customer-enter-hint"
                    role="button"
                    tabIndex={0}
                    onClick={() => openNewCustomerForm()}
                    onKeyDown={(e) => { if (e.key === "Enter") openNewCustomerForm(); }}
                    style={{ cursor: "pointer" }}
                  >
                    <UserPlus />
                    <span>
                      <strong>لم يتم تسجيل أي عملاء بعد</strong>
                      <small>اضغط هنا لتسجيل أول عميل في النظام</small>
                    </span>
                    <kbd>عميل جديد +</kbd>
                  </div>
                )}
              </div>
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
      {customizingMeal && (
        <MealCustomizerModal
          meal={customizingMeal}
          state={state}
          onAdd={addCustomizedMealToCart}
          onClose={() => setCustomizingMeal(null)}
        />
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
      {checkout && customer && <CheckoutModal subtotal={subtotal} customer={customer} editingOrder={editingOrder} drivers={state.drivers} defaultFee={state.settings.defaultDeliveryFee} onClose={() => setCheckout(false)} onComplete={completeOrder} />}
      {receiptOrder && <InvoiceModal order={receiptOrder} settings={state.settings} autoPrint onClose={() => setReceiptOrder(null)} />}
    </div>
  );
}

function MealCustomizerModal({
  meal,
  state,
  onAdd,
  onClose
}: {
  meal: Meal;
  state: AppState;
  onAdd: (customizedItem: {
    mealId: string;
    optionId?: string;
    optionName?: string;
    name: string;
    price: number;
    cost: number;
    mealComponents: MealComponent[];
    note: string;
  }) => void;
  onClose: () => void;
}) {
  const hasOptions = Boolean(meal.options && meal.options.length > 0);
  const [selectedOptionId, setSelectedOptionId] = useState<string>(() => meal.options?.[0]?.id ?? "");

  const [selectedChoices, setSelectedChoices] = useState<Record<string, Array<{ productId: string; optionId?: string }>>>(() => {
    const initial: Record<string, Array<{ productId: string; optionId?: string }>> = {};
    meal.choiceGroups?.forEach((group) => {
      if (group.defaultChoiceProductId) {
        initial[group.id] = [{ productId: group.defaultChoiceProductId, optionId: group.defaultChoiceOptionId }];
      } else {
        initial[group.id] = [];
      }
    });
    return initial;
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedOption = hasOptions ? meal.options?.find((o) => o.id === selectedOptionId) : undefined;
  const basePrice = selectedOption ? selectedOption.price : meal.price;

  let choiceExtraTotal = 0;
  const chosenComponents: MealComponent[] = [
    ...meal.components.map((comp) => ({ ...comp }))
  ];

  meal.choiceGroups?.forEach((group) => {
    const selections = selectedChoices[group.id] ?? [];
    selections.forEach((sel) => {
      const choice = group.choices.find((c) => c.productId === sel.productId && c.optionId === sel.optionId)
        ?? group.choices.find((c) => c.productId === sel.productId);
      if (choice) {
        choiceExtraTotal += choice.extraPrice ?? 0;
        chosenComponents.push({
          productId: choice.productId,
          optionId: choice.optionId,
          optionName: choice.optionName,
          name: choice.name,
          unit: choice.unit,
          price: choice.price,
          cost: choice.cost,
          recipeMultiplier: choice.recipeMultiplier ?? 1,
          quantity: choice.quantity || 1
        });
      }
    });
  });

  const totalMealPrice = basePrice + choiceExtraTotal;

  const totalCost = chosenComponents.reduce((sum, component) => {
    const product = state.products.find((p) => p.id === component.productId);
    const option = component.optionId ? product?.options?.find((opt) => opt.id === component.optionId) : null;
    const compCost = option?.cost ?? component.cost ?? product?.cost ?? 0;
    return sum + compCost * component.quantity;
  }, 0);

  const mealName = selectedOption ? `${meal.name} (${selectedOption.name})` : meal.name;

  const notesList = [
    ...meal.components.map((c) => `${c.quantity}× ${c.name}${c.optionName ? ` (${c.optionName})` : ""}`),
    ...Object.entries(selectedChoices).map(([groupId, selections]) => {
      const group = meal.choiceGroups?.find((g) => g.id === groupId);
      if (!group || !selections.length) return "";
      const itemsStr = selections.map((sel) => {
        const choice = group.choices.find((c) => c.productId === sel.productId && c.optionId === sel.optionId)
          ?? group.choices.find((c) => c.productId === sel.productId);
        return choice ? `${choice.name}${choice.optionName ? ` (${choice.optionName})` : ""}` : "";
      }).filter(Boolean).join(" + ");
      return itemsStr ? `${group.name}: ${itemsStr}` : "";
    }).filter(Boolean)
  ];

  const handleToggleChoice = (group: MealChoiceGroup, choice: MealChoiceItem) => {
    setSelectedChoices((prev) => {
      const current = prev[group.id] ?? [];
      const isSelected = current.some((c) => c.productId === choice.productId && c.optionId === choice.optionId);

      if (group.multiple) {
        // Multi-select checkbox mode
        if (isSelected) {
          return {
            ...prev,
            [group.id]: current.filter((c) => !(c.productId === choice.productId && c.optionId === choice.optionId))
          };
        } else {
          return {
            ...prev,
            [group.id]: [...current, { productId: choice.productId, optionId: choice.optionId }]
          };
        }
      } else {
        // Single select mode
        if (isSelected) {
          if (group.required === false) {
            return { ...prev, [group.id]: [] };
          }
          return prev;
        } else {
          return {
            ...prev,
            [group.id]: [{ productId: choice.productId, optionId: choice.optionId }]
          };
        }
      }
    });
  };

  const handleConfirm = () => {
    if (meal.choiceGroups) {
      for (const group of meal.choiceGroups) {
        const selections = selectedChoices[group.id] ?? [];
        if (group.required !== false && selections.length === 0) {
          setValidationError(`يرجى تحديد خيار لمجموعة: ${group.name}`);
          return;
        }
      }
    }
    setValidationError(null);
    onAdd({
      mealId: meal.id,
      optionId: selectedOption?.id,
      optionName: selectedOption?.name,
      name: mealName,
      price: totalMealPrice,
      cost: totalCost,
      mealComponents: chosenComponents,
      note: notesList.join(" · ")
    });
  };

  return (
    <Modal title={`تخصيص وجبة: ${meal.name}`} onClose={onClose} size="wide">
      <div className="meal-customizer-modal" style={{ display: "grid", gap: "16px", padding: "6px" }}>
        {hasOptions && meal.options && (
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#166534", fontWeight: 800, fontSize: "13px" }}>
              <BadgeDollarSign size={18} /> 1. اختر حجم الوجبة:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px" }}>
              {meal.options.map((opt) => {
                const isSelected = opt.id === selectedOptionId;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => setSelectedOptionId(opt.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      padding: "12px",
                      borderRadius: "10px",
                      border: `2px solid ${isSelected ? "#16a34a" : "#e5e7eb"}`,
                      background: isSelected ? "#f0fdf4" : "#fff",
                      cursor: "pointer",
                      transition: "all 0.15s"
                    }}
                  >
                    <strong style={{ fontSize: "14px", color: isSelected ? "#15803d" : "#1f2937" }}>{opt.name}</strong>
                    <b style={{ fontSize: "15px", color: "#16a34a" }}>{money(opt.price)} ج.م</b>
                    {isSelected && <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "#dcfce7", color: "#15803d", fontWeight: 800 }}>✓ محدد</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {meal.choiceGroups && meal.choiceGroups.length > 0 && (
          <div style={{ display: "grid", gap: "14px" }}>
            {meal.choiceGroups.map((group, gIdx) => {
              const currentSelections = selectedChoices[group.id] ?? [];
              return (
                <div key={group.id} style={{ display: "grid", gap: "8px", padding: "12px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 800, fontSize: "13px", color: "#1e40af" }}>
                      <Shuffle size={16} /> {hasOptions ? `${gIdx + 2}. ` : `${gIdx + 1}. `}{group.name}:
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {group.multiple && (
                        <span style={{ fontSize: "10px", color: "#065f46", background: "#d1fae5", padding: "2px 7px", borderRadius: "4px", fontWeight: 700 }}>
                          اختيار متعدد
                        </span>
                      )}
                      {group.required !== false ? (
                        <span style={{ fontSize: "10px", color: "#1e40af", background: "#dbeafe", padding: "2px 7px", borderRadius: "4px", fontWeight: 700 }}>إجباري</span>
                      ) : (
                        <span style={{ fontSize: "10px", color: "#64748b", background: "#e2e8f0", padding: "2px 7px", borderRadius: "4px", fontWeight: 600 }}>اختياري</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px" }}>
                    {group.choices.map((choice) => {
                      const isSelected = currentSelections.some((c) => c.productId === choice.productId && c.optionId === choice.optionId);
                      return (
                        <button
                          type="button"
                          key={`${choice.productId}:${choice.optionId ?? "base"}`}
                          onClick={() => handleToggleChoice(group, choice)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: `2px solid ${isSelected ? "#2563eb" : "#cbd5e1"}`,
                            background: isSelected ? "#eff6ff" : "#fff",
                            cursor: "pointer",
                            textAlign: "right",
                            transition: "all 0.15s"
                          }}
                        >
                          <div style={{ display: "grid", gap: "2px" }}>
                            <strong style={{ fontSize: "12px", color: isSelected ? "#1e40af" : "#1f2937" }}>{choice.name}{choice.optionName ? ` (${choice.optionName})` : ""}</strong>
                            {choice.extraPrice ? <small style={{ fontSize: "10px", color: "#b45309", fontWeight: 700 }}>+{money(choice.extraPrice)} ج.م</small> : <small style={{ fontSize: "9px", color: "#64748b" }}>مشمل ضمن الوجبة</small>}
                          </div>
                          {isSelected ? (
                            <div style={{ width: "20px", height: "20px", borderRadius: group.multiple ? "4px" : "50%", background: "#2563eb", display: "grid", placeItems: "center" }}>
                              <Check size={13} color="#fff" />
                            </div>
                          ) : (
                            <div style={{ width: "20px", height: "20px", borderRadius: group.multiple ? "4px" : "50%", border: "1.5px solid #cbd5e1", background: "#fff" }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {validationError && (
          <div style={{ padding: "8px 12px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: "8px", fontSize: "12px", fontWeight: 700 }}>
            {validationError}
          </div>
        )}

        {meal.components.length > 0 && (
          <div style={{ padding: "10px 12px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#4b5563", display: "block", marginBottom: "4px" }}>المكونات المرفقة تلقائياً مع الوجبة:</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {meal.components.map((c) => (
                <span key={`${c.productId}:${c.optionId ?? "base"}`} style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "5px", background: "#fff", border: "1px solid #d1d5db", color: "#374151" }}>
                  <b>{c.quantity}×</b> {c.name}{c.optionName ? ` (${c.optionName})` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid #e5e7eb" }}>
          <div>
            <span style={{ fontSize: "11px", color: "#6b7280" }}>إجمالي سعر الوجبة:</span>
            <b style={{ fontSize: "20px", color: "#15803d", display: "block" }}>{money(totalMealPrice)} ج.م</b>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="soft-button" onClick={onClose}>إلغاء</button>
            <button type="button" className="primary-button" onClick={handleConfirm} style={{ paddingInline: "20px" }}>
              <Plus size={16} /> إضافة الوجبة إلى الطلب ({money(totalMealPrice)} ج.م)
            </button>
          </div>
        </div>
      </div>
    </Modal>
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
    <Modal title={editingOrder ? `مراجعة تعديل الطلب #${orderDisplayNumber(editingOrder)}` : "تأكيد الطلب والدفع"} onClose={onClose} size="wide">
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
    if (item.mealComponents?.length) {
      item.mealComponents.forEach((component) => {
        const product = state.products.find((p) => p.id === component.productId);
        const option = component.optionId ? product?.options?.find((opt) => opt.id === component.optionId) : null;
        const multiplier = component.recipeMultiplier ?? option?.recipeMultiplier ?? 1;
        state.recipes
          .filter((recipe) => recipe.productId === component.productId)
          .forEach((recipe) => {
            usage.set(recipe.ingredientId, (usage.get(recipe.ingredientId) ?? 0) + recipe.quantity * item.quantity * component.quantity * multiplier);
          });
      });
    } else {
      const multiplier = item.recipeMultiplier ?? 1;
      state.recipes
        .filter((recipe) => recipe.productId === item.productId)
        .forEach((recipe) => {
          usage.set(recipe.ingredientId, (usage.get(recipe.ingredientId) ?? 0) + recipe.quantity * item.quantity * multiplier);
        });
    }
  });
  return usage;
}

type OrderDatePreset = "all" | "today" | "yesterday" | "last7" | "month" | "custom";

export function OrdersView({ state, update, notify, onEditOrder }: ViewProps & { onEditOrder: (order: Order) => void }) {
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "scheduled" | "delivered" | "returned">("all");
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
  const offsetDateKey = (value: string, days: number) => {
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const selectDatePreset = (preset: Exclude<OrderDatePreset, "all" | "custom">) => {
    const today = todayKey();
    let from = "";
    let to = "";
    if (preset === "today") from = to = today;
    if (preset === "yesterday") from = to = offsetDateKey(today, -1);
    if (preset === "last7") {
      from = offsetDateKey(today, -6);
      to = today;
    }
    if (preset === "month") {
      from = `${today.slice(0, 7)}-01`;
      to = today;
    }
    setDraftDatePreset(preset);
    setDraftDateFrom(from);
    setDraftDateTo(to);
    setDatePreset(preset);
    setDateFrom(from);
    setDateTo(to);
    setDateFilterOpen(false);
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
    const seconds = Math.max(0, Math.floor((ordersClock - dateTimeValue(order.createdAt)) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const orderTimerTone = (order: Order) => {
    const minutes = Math.max(0, Math.floor((ordersClock - dateTimeValue(order.createdAt)) / 60000));
    return minutes >= state.settings.kitchenLateMinutes ? "late" : minutes >= state.settings.kitchenWarningMinutes ? "warning" : "ok";
  };
  const filtered = state.orders.filter((order) => {
    const matchesFilter =
      filter === "pending" ? order.paymentStatus === "pending" && order.stage !== "returned"
        : filter === "active" ? order.stage !== "delivered" && order.stage !== "returned"
          : filter === "scheduled" ? order.stage !== "returned" && Boolean(order.scheduledFor) && dateTimeValue(order.scheduledFor!) > Date.now()
            : filter === "delivered" ? order.stage === "delivered"
              : filter === "returned" ? order.stage === "returned"
              : true;
    const matchesSearch = !normalizedSearch
      || order.customerName.toLocaleLowerCase("ar").includes(normalizedSearch)
      || Boolean(searchDigits && order.customerPhone.replace(/\D/g, "").includes(searchDigits))
      || Boolean(searchOrderNumber && (
        String(orderDisplayNumber(order)).includes(searchOrderNumber)
        || String(order.number).includes(searchOrderNumber)
      ));
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
        direction: "in", description: `تحصيل فاتورة #${orderDisplayNumber(order)}`, orderId: order.id,
        treasuryId: order.treasuryId ?? salesTreasuryId(current), createdAt
      }, ...current.cashTransactions]
    }));
    notify(`تم تحصيل ${money(order.total)}`);
  };
  const reopenReturnedOrder = (order: Order) => {
    if (order.stage !== "returned") return;
    update((current) => {
      const reopenedOrder: Order = {
        ...order,
        stage: "ready",
        paymentStatus: order.paymentRefunded ? "pending" : order.paymentStatus,
        driverId: undefined,
        driver: undefined,
        returnReason: undefined,
        returnedAt: undefined
      };
      const successfulCustomerOrders = current.orders
        .filter((item) => item.id !== order.id && item.customerId === order.customerId && item.stage !== "returned")
        .concat(reopenedOrder)
        .sort((left, right) => dateTimeValue(right.createdAt) - dateTimeValue(left.createdAt));
      return {
        ...current,
        orders: current.orders.map((item) => item.id === order.id ? reopenedOrder : item),
        customers: current.customers.map((customer) => customer.id === order.customerId ? {
          ...customer,
          ordersCount: customer.ordersCount + 1,
          totalSpent: customer.totalSpent + order.total,
          lastOrder: successfulCustomerOrders[0]?.createdAt
        } : customer)
      };
    });
    notify(`تمت إعادة فتح الطلب #${orderDisplayNumber(order)} وأصبح جاهزًا للتوزيع`);
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
          description: `استرجاع مخزون بعد حذف طلب #${orderDisplayNumber(deleteOrder)}`,
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
        description: `عكس تحصيل بسبب حذف فاتورة #${orderDisplayNumber(deleteOrder)}`,
        orderId: deleteOrder.id,
        treasuryId: deleteOrder.treasuryId ?? salesTreasuryId(current),
        createdAt: deletedAt
      } : null;
      const remainingCustomerOrders = current.orders.filter(
        (order) => order.id !== deleteOrder.id && order.customerId === deleteOrder.customerId
      );
      const latestCustomerOrder = remainingCustomerOrders.reduce<Order | null>(
        (latest, order) => !latest || dateTimeValue(order.createdAt) > dateTimeValue(latest.createdAt) ? order : latest,
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
    notify(`تم حذف الطلب #${orderDisplayNumber(deleteOrder)} وتسوية المخزون والحساب`);
  };
  const openWhatsApp = (order: Order) => {
    const phone = order.customerPhone.replace(/\D/g, "").replace(/^0/, "20");
    const items = order.items.map((item) => `${item.quantity}× ${item.name}`).join("، ");
    const message = [
      `أهلًا ${order.customerName} 👋`,
      `تم تأكيد طلبك رقم #${orderDisplayNumber(order)} من ${state.settings.restaurantName}.`,
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
        <MiniStat icon={<Clock3 />} label="تحصيلات معلقة" value={String(state.orders.filter((o) => o.paymentStatus === "pending" && o.stage !== "returned").length)} tone="orange" />
        <MiniStat icon={<Truck />} label="جاهز للتوصيل" value={String(state.orders.filter((o) => o.stage === "ready").length)} tone="blue" />
        <MiniStat icon={<CircleDollarSign />} label="قيمة المعلق" value={money(state.orders.filter((o) => o.paymentStatus === "pending" && o.stage !== "returned").reduce((sum, o) => sum + o.total, 0))} tone="red" />
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
              {[["all", "الكل"], ["active", "طلبات نشطة"], ["scheduled", "مجدولة"], ["pending", "تحصيل معلق"], ["delivered", "تم التسليم"], ["returned", "رفض الاستلام"]].map(([id, label]) => (
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
                <strong>#{orderDisplayNumber(order)}</strong>
                <small>{order.scheduledFor ? `موعد ${shortDate(order.scheduledFor)}` : shortDate(order.createdAt)}</small>
              </span>
              <span className={`order-live-timer ${order.stage === "delivered" || order.stage === "returned" ? "done" : orderTimerTone(order)}`}>
                <Clock3 />
                <strong>{order.stage === "returned" ? "مرتجع" : order.stage === "delivered" ? "مكتمل" : orderTimer(order)}</strong>
              </span>
              <span className="order-customer-cell"><strong>{order.customerName}</strong><small><Phone size={12} /> {order.customerPhone}</small></span>
              <span className="order-items-cell">
                <strong>{order.items.slice(0, 2).map((item) => `${item.quantity}× ${item.name}`).join("، ")}</strong>
                <small>{order.items.reduce((sum, item) => sum + item.quantity, 0)} وحدة · {order.items.length} صنف</small>
              </span>
              <span className="order-total-cell"><strong>{money(order.total)}</strong><small>شامل التوصيل</small></span>
              <span className="order-payment-cell"><StatusBadge type={order.stage === "returned" ? "neutral" : order.paymentStatus === "paid" ? "success" : "warning"}>{order.stage === "returned" ? (order.paymentStatus === "paid" ? "تم رد المبلغ" : "بدون تحصيل") : order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}</StatusBadge><small>{paymentLabels[order.paymentMethod]}</small></span>
              <span className="order-status-cell"><StatusBadge type={order.stage === "returned" ? "danger" : order.stage === "delivered" ? "success" : order.stage === "ready" ? "info" : "warning"}>{stageLabels[order.stage]}</StatusBadge><small>{order.stage === "returned" ? order.returnReason : order.driver || "جهة التوصيل غير محددة"}</small></span>
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
          notify(`تم إرسال الطلب #${orderDisplayNumber(detailsOrder)} مع ${driver.name} وتسجيله تم التوصيل`);
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
            ? `تم إرجاع الطلب #${orderDisplayNumber(detailsOrder)} إلى قيد التجهيز`
            : stage === "ready"
              ? `الطلب #${orderDisplayNumber(detailsOrder)} أصبح جاهزًا`
              : `تم تسجيل الطلب #${orderDisplayNumber(detailsOrder)} تم التوصيل`);
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
        onCollect={detailsOrder.paymentStatus === "pending" && detailsOrder.stage !== "returned" ? () => collect(detailsOrder) : undefined}
        onReopen={detailsOrder.stage === "returned" ? () => reopenReturnedOrder(detailsOrder) : undefined}
      />}
      {deleteOrder && <Modal title="تأكيد حذف الطلب" onClose={() => setDeleteOrderId(null)}>
        <div className="delete-order-confirm">
          <span className="delete-order-icon"><Trash2 /></span>
          <strong>هل تريد حذف الطلب #{orderDisplayNumber(deleteOrder)}؟</strong>
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

function OrderDetailsModal({ order, drivers, busyDriverIds, onClose, onPrint, onEdit, onWhatsApp, onUpdateCustomer, onAssignDriver, onChangeStage, onDelete, onCollect, onReopen }: {
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
  onReopen?: () => void;
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
    <Modal title={`تفاصيل الطلب رقم ${orderDisplayNumber(order)}`} onClose={onClose} size="wide">
      <div className="order-details">
        <div className="order-details-hero">
          <span className="order-details-icon"><ReceiptText /></span>
          <span className="order-details-number">
            <small>رقم الوردية · الرقم العام #{order.number}</small>
            <strong>#{orderDisplayNumber(order)}</strong>
          </span>
          <span className="order-details-date">
            <Clock3 />
            <small>تاريخ الطلب</small>
            <strong>{shortDate(order.createdAt)}</strong>
          </span>
          <div className="order-details-statuses">
            <span className={`hero-stage-select ${selectedStage}`} title={order.stage === "returned" ? "الطلب مغلق بسبب رفض الاستلام" : order.settlementId ? "لا يمكن تغيير حالة طلب تمت تسوية عهدته" : "تعديل حالة الطلب"}>
              <select value={selectedStage} disabled={Boolean(order.settlementId) || order.stage === "returned"} onChange={(event) => setSelectedStage(event.target.value as OrderStage)}>
                <option value="preparing">قيد التجهيز</option>
                <option value="ready">جاهز</option>
                <option value="delivered">تم التوصيل</option>
                <option value="returned">رفض الاستلام</option>
              </select>
              <ChevronDown />
            </span>
            {selectedStage !== order.stage && !order.settlementId && <button className="save-hero-stage" onClick={() => onChangeStage(selectedStage)}><Check /> حفظ</button>}
            <StatusBadge type={order.stage === "returned" ? "neutral" : order.paymentStatus === "paid" ? "success" : "warning"}>{order.stage === "returned" ? (order.paymentStatus === "paid" ? "تم رد المبلغ" : "بدون تحصيل") : order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}</StatusBadge>
          </div>
        </div>
        {order.stage === "returned" && <div className="returned-order-reason"><X /><span><strong>العميل رفض الاستلام</strong><small>{order.returnReason || "لم يتم تسجيل سبب"}{order.returnedAt ? ` · ${shortDate(order.returnedAt)}` : ""}</small></span></div>}

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
          {onReopen && <button className="reopen-order-action" onClick={onReopen}><PackageCheck /> إعادة فتح الطلب</button>}
          {order.stage !== "returned" && <button className="primary-button" onClick={onEdit}><ClipboardCheck /> تعديل داخل نقطة البيع</button>}
          {onCollect && <button className="collect-button" onClick={onCollect}><Banknote /> تسجيل التحصيل</button>}
          <button className="soft-button whatsapp-detail" onClick={onWhatsApp}><MessageCircle /> إرسال واتساب</button>
          <button className="soft-button" onClick={onPrint}><Printer /> طباعة الفاتورة</button>
          {order.stage !== "returned" && <button className="delete-order-action" onClick={onDelete}><Trash2 /> حذف الطلب</button>}
        </div>
      </div>
    </Modal>
  );
}

function KitchenOrderPreview({ order, sections, onClose }: { order: Order; sections: MenuSection[]; onClose: () => void }) {
  const totalUnits = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <Modal title={`أصناف الطلب #${orderDisplayNumber(order)}`} onClose={onClose} size="wide">
      <div className="kitchen-order-preview">
        <header className="kitchen-preview-hero">
          <span><small>رقم الطلب</small><strong>#{orderDisplayNumber(order)}</strong></span>
          <span><small>الأصناف</small><b>{order.items.length} صنف · {totalUnits} وحدة</b></span>
        </header>
        <section className={`kitchen-preview-items${order.items.length > 8 ? " many" : ""}`} tabIndex={0} autoFocus>
          {order.items.map((item) => <div className={`kitchen-preview-item${item.mealId ? " meal" : ""}`} key={`${item.productId}:${item.optionId ?? "base"}`}>
            <b>{item.quantity}×</b>
            <span><strong>{item.name}</strong>{item.note && (item.mealId
              ? <small className="kitchen-preview-meal-components">{item.note.split(" · ").map((component) => <i key={component}>{component}</i>)}</small>
              : <small>{item.note}</small>)}</span>
            <em>{item.mealId ? "وجبة" : sections.find((section) => section.id === item.section)?.name ?? "قسم"}</em>
          </div>)}
        </section>
        {order.note && <div className="kitchen-preview-order-note"><strong>ملاحظة الطلب:</strong> {order.note}</div>}
      </div>
    </Modal>
  );
}

export function KitchenView({ state, update, notify, scope, kitchenSection }: ViewProps & {
  scope: "all" | "now" | "scheduled";
  kitchenSection: "all" | ProductSection;
}) {
  const [quickOrderNumber, setQuickOrderNumber] = useState("");
  const [quickResult, setQuickResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);
  const [duplicateOrderIds, setDuplicateOrderIds] = useState<string[]>([]);
  const [duplicateOrderIndex, setDuplicateOrderIndex] = useState(0);
  const [kitchenPage, setKitchenPage] = useState(0);
  const [kitchenColumns, setKitchenColumns] = useState(3);
  const kitchenBoardRef = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const itemSection = (item: OrderItem) => item.section ?? state.products.find((product) => product.id === item.productId)?.section;
  const sectionItems = (order: Order) => order.items.filter((item) => kitchenSection === "all" || itemSection(item) === kitchenSection);
  const activeOrders = state.orders.filter((order) => {
    if (order.stage !== "preparing") return false;
    const scheduled = order.scheduledFor && dateTimeValue(order.scheduledFor) > clock + 60 * 60 * 1000;
    if (scope === "now" && scheduled) return false;
    if (scope === "scheduled" && !scheduled) return false;
    if (!sectionItems(order).length) return false;
    return true;
  }).sort((a, b) => dateTimeValue(a.createdAt) - dateTimeValue(b.createdAt));
  const kitchenPageCapacity = Math.max(2, kitchenColumns * 2);
  const hasExtraKitchenPages = activeOrders.length > kitchenPageCapacity;
  const kitchenOrdersPerPage = hasExtraKitchenPages ? kitchenPageCapacity - 1 : kitchenPageCapacity;
  const kitchenPageCount = Math.max(1, Math.ceil(activeOrders.length / kitchenOrdersPerPage));
  const visibleKitchenOrders = activeOrders.slice(kitchenPage * kitchenOrdersPerPage, (kitchenPage + 1) * kitchenOrdersPerPage);
  const visibleKitchenOrderIds = new Set(visibleKitchenOrders.map((order) => order.id));
  const hiddenKitchenOrders = activeOrders.filter((order) => !visibleKitchenOrderIds.has(order.id));
  const goToNextKitchenPage = () => setKitchenPage((current) => (current + 1) % kitchenPageCount);
  const goToPreviousKitchenPage = () => setKitchenPage((current) => (current - 1 + kitchenPageCount) % kitchenPageCount);
  useEffect(() => {
    const board = kitchenBoardRef.current;
    if (!board) return;
    const updateColumns = () => {
      const width = board.clientWidth;
      const gap = window.innerHeight <= 800 ? 9 : 12;
      setKitchenColumns(Math.max(1, Math.floor((width + gap) / (285 + gap))));
    };
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(board);
    window.addEventListener("resize", updateColumns);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateColumns);
    };
  }, []);
  useEffect(() => {
    setKitchenPage((current) => Math.min(current, kitchenPageCount - 1));
  }, [kitchenPageCount]);
  useEffect(() => setKitchenPage(0), [scope, kitchenSection]);
  useEffect(() => {
    const navigateKitchenPages = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (isEditable || previewOrderId || duplicateOrderIds.length || quickOrderNumber || kitchenPageCount <= 1) return;
      if (event.key === "Alt" || event.key === "ArrowLeft") {
        event.preventDefault();
        goToNextKitchenPage();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToPreviousKitchenPage();
      }
    };
    window.addEventListener("keydown", navigateKitchenPages);
    return () => window.removeEventListener("keydown", navigateKitchenPages);
  }, [duplicateOrderIds.length, kitchenPageCount, previewOrderId, quickOrderNumber]);
  const moveKitchenOrder = (order: Order) => {
    update((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === order.id ? {
        ...item,
        stage: "ready"
      } : item)
    }));
    notify(`اكتمل تحضير الطلب #${orderDisplayNumber(order)} وأصبح جاهزًا للتوصيل`);
  };
  const normalizedQuickNumber = () => quickOrderNumber
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D/g, "");
  const findPreparingOrdersByQuickNumber = () => {
    const normalizedNumber = normalizedQuickNumber();
    if (!normalizedNumber) return [];
    const requestedNumber = Number(normalizedNumber);
    const preparingOrders = state.orders.filter((order) => order.stage === "preparing");
    const displayNumberMatches = preparingOrders.filter((item) => orderDisplayNumber(item) === requestedNumber);
    const matches = displayNumberMatches.length ? displayNumberMatches : preparingOrders.filter((item) => item.number === requestedNumber);
    return matches.sort((left, right) => dateTimeValue(right.createdAt) - dateTimeValue(left.createdAt));
  };
  const showDuplicatePicker = (orders: Order[]) => {
    setDuplicateOrderIds(orders.map((order) => order.id));
    setDuplicateOrderIndex(0);
    setQuickResult(null);
  };
  const openOrderFromKeyboard = () => {
    const normalizedNumber = normalizedQuickNumber();
    if (!normalizedNumber) return;
    const orders = findPreparingOrdersByQuickNumber();
    if (orders.length > 1) {
      showDuplicatePicker(orders);
      return;
    }
    const order = orders[0];
    if (!order) {
      const completed = state.orders.some((item) => item.stage !== "preparing" && (orderDisplayNumber(item) === Number(normalizedNumber) || item.number === Number(normalizedNumber)));
      setQuickResult({ tone: "error", text: completed ? `الطلب #${Number(normalizedNumber)} انتهى وخرج من المطبخ` : `لا يوجد طلب قيد التجهيز برقم #${Number(normalizedNumber)}` });
      return;
    }
    setPreviewOrderId(order.id);
    setQuickOrderNumber("");
    setQuickResult(null);
  };
  const completeOrderFromKeyboard = () => {
    const normalizedNumber = normalizedQuickNumber();
    if (!normalizedNumber) {
      setQuickResult({ tone: "error", text: "اكتب رقم الطلب أولًا" });
      return;
    }
    const requestedNumber = Number(normalizedNumber);
    const orders = findPreparingOrdersByQuickNumber();
    if (orders.length > 1) {
      showDuplicatePicker(orders);
      return;
    }
    const order = orders[0];
    if (!order) {
      const completed = state.orders.find((item) => item.stage !== "preparing" && (orderDisplayNumber(item) === requestedNumber || item.number === requestedNumber));
      setQuickResult({
        tone: "error",
        text: completed ? `الطلب #${requestedNumber} تم تجهيزه بالفعل` : `لا يوجد طلب قيد التجهيز برقم #${requestedNumber}`
      });
      return;
    }
    moveKitchenOrder(order);
    setQuickOrderNumber("");
    setQuickResult({ tone: "success", text: `تم تجهيز الطلب #${orderDisplayNumber(order)} بنجاح` });
  };
  useEffect(() => {
    const captureOrderNumber = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (isEditable) return;
      const isSpace = event.code === "Space" || event.key === " " || event.key === "Spacebar";
      if (isSpace && previewOrderId) {
        event.preventDefault();
        setPreviewOrderId(null);
        return;
      }
      if (previewOrderId) return;
      if (duplicateOrderIds.length) {
        const selectedOrder = state.orders.find((order) => order.id === duplicateOrderIds[duplicateOrderIndex]);
        if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
          event.preventDefault();
          setDuplicateOrderIndex((current) => (current + 1) % duplicateOrderIds.length);
        } else if (event.key === "ArrowUp" || event.key === "ArrowRight") {
          event.preventDefault();
          setDuplicateOrderIndex((current) => (current - 1 + duplicateOrderIds.length) % duplicateOrderIds.length);
        } else if (event.key === "Enter" && selectedOrder) {
          event.preventDefault();
          moveKitchenOrder(selectedOrder);
          setDuplicateOrderIds([]);
          setQuickOrderNumber("");
          setQuickResult({ tone: "success", text: `تم تجهيز الطلب #${orderDisplayNumber(selectedOrder)} بنجاح` });
        } else if (isSpace && selectedOrder) {
          event.preventDefault();
          setPreviewOrderId(selectedOrder.id);
          setDuplicateOrderIds([]);
          setQuickOrderNumber("");
          setQuickResult(null);
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDuplicateOrderIds([]);
          setDuplicateOrderIndex(0);
        }
        return;
      }
      if (/^[0-9٠-٩]$/.test(event.key)) {
        event.preventDefault();
        setQuickOrderNumber((current) => `${current}${event.key}`.slice(-8));
        setDuplicateOrderIds([]);
        setQuickResult(null);
      } else if (event.key === "Backspace" && quickOrderNumber) {
        event.preventDefault();
        setQuickOrderNumber((current) => current.slice(0, -1));
        setQuickResult(null);
      } else if (event.key === "Enter" && quickOrderNumber) {
        event.preventDefault();
        completeOrderFromKeyboard();
      } else if (isSpace && quickOrderNumber) {
        event.preventDefault();
        openOrderFromKeyboard();
      } else if (event.key === "Escape") {
        setQuickOrderNumber("");
        setQuickResult(null);
      }
    };
    window.addEventListener("keydown", captureOrderNumber);
    return () => window.removeEventListener("keydown", captureOrderNumber);
  }, [quickOrderNumber, previewOrderId, duplicateOrderIds, duplicateOrderIndex, state.orders, state.cashShifts]);
  useEffect(() => {
    if (!quickResult || quickOrderNumber) return;
    const timer = window.setTimeout(() => setQuickResult(null), 1800);
    return () => window.clearTimeout(timer);
  }, [quickOrderNumber, quickResult]);
  const elapsed = (order: Order) => Math.max(0, Math.floor((clock - dateTimeValue(order.createdAt)) / 60000));
  const timerTone = (minutes: number) => minutes >= state.settings.kitchenLateMinutes ? "late" : minutes >= state.settings.kitchenWarningMinutes ? "warning" : "ok";
  const timerText = (order: Order) => {
    const seconds = Math.max(0, Math.floor((clock - dateTimeValue(order.createdAt)) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  return (
    <div className="workflow-page kitchen-workflow">
      <div className="panel kitchen-orders-panel">
        {!duplicateOrderIds.length && (quickOrderNumber || quickResult) && <div className={`kitchen-number-overlay ${quickResult?.tone ?? "typing"}`}>
          {quickOrderNumber && <><small>رقم الطلب</small><strong dir="ltr">#{quickOrderNumber}</strong><span>المسطرة لعرض الأصناف · Enter للتجهيز · Backspace للتعديل · Esc للإلغاء</span></>}
          {quickResult && <b>{quickResult.text}</b>}
        </div>}
        {duplicateOrderIds.length > 1 && <div className="kitchen-duplicate-picker">
          <header><strong>يوجد أكثر من طلب برقم #{quickOrderNumber}</strong><span>اختر الطلب المطلوب بالتاريخ والوقت</span></header>
          <div className="kitchen-duplicate-list">
            {duplicateOrderIds.map((orderId, index) => {
              const order = state.orders.find((item) => item.id === orderId);
              if (!order) return null;
              const currentShift = state.cashShifts.some((shift) => shift.id === order.shiftId && !shift.closedAt);
              return <div className={index === duplicateOrderIndex ? "selected" : ""} key={order.id}>
                <b>#{orderDisplayNumber(order)}</b>
                <span><strong>{shortDate(order.createdAt)}</strong><small>{currentShift ? "الوردية الحالية" : "وردية سابقة"}</small></span>
                <em>{order.items.length} صنف · {order.items.reduce((sum, item) => sum + item.quantity, 0)} وحدة</em>
              </div>;
            })}
          </div>
          <footer><span>↑ ↓ للتنقل</span><span>المسطرة لعرض الأصناف</span><span>Enter للتجهيز</span><span>Esc للرجوع</span></footer>
        </div>}
        <div className="kitchen-board" ref={kitchenBoardRef} style={{ gridTemplateColumns: `repeat(${kitchenColumns}, minmax(0, 1fr))` }}>
          {visibleKitchenOrders.map((order) => (
            <article className={`kitchen-ticket timed-order ${timerTone(elapsed(order))}`} key={order.id}>
            <header className="kitchen-ticket-complete-trigger" onDoubleClick={() => moveKitchenOrder(order)}>
              <span><small>طلب</small><strong>#{orderDisplayNumber(order)}</strong></span>
              <span className={`kitchen-timer ${timerTone(elapsed(order))}`}><Clock3 /> {timerText(order)}</span>
            </header>
            <ul>{sectionItems(order).map((item) => <li className={item.mealId ? "kitchen-meal-item" : undefined} key={`${item.productId}:${item.optionId ?? "base"}`}><b>{item.quantity}×</b><span>{item.name}{item.note && <small>{item.note}</small>}</span><em>{item.mealId ? "وجبة" : state.sections.find((section) => section.id === itemSection(item))?.name ?? "قسم"}</em></li>)}</ul>
            {order.note && <small className="order-note"><Info /> {order.note}</small>}
            </article>
          ))}
          {hasExtraKitchenPages && <button
            className="kitchen-overflow-card"
            style={{ gridColumn: kitchenColumns, gridRow: 2 }}
            onClick={goToNextKitchenPage}
            aria-label={`${hiddenKitchenOrders.length} طلب غير ظاهر. اضغط لعرض الصفحة التالية`}
          >
            <div className="kitchen-overflow-orders">
              {hiddenKitchenOrders.map((order) => <span key={order.id}>
                <strong>#{orderDisplayNumber(order)}</strong>
                <small><Clock3 /> {timerText(order)}</small>
              </span>)}
            </div>
          </button>}
          {!activeOrders.length && <div className="workflow-empty"><Empty icon={<CookingPot />} title="المطبخ هادئ حاليًا" text="طلبات التحضير الجديدة ستظهر هنا تلقائيًا" /></div>}
        </div>
      </div>
      {previewOrderId && state.orders.find((order) => order.id === previewOrderId) && <KitchenOrderPreview
        order={state.orders.find((order) => order.id === previewOrderId)!}
        sections={state.sections}
        onClose={() => setPreviewOrderId(null)}
      />}
    </div>
  );
}

export function DeliveryView({ state, update, notify }: ViewProps) {
  const [activeTab, setActiveTab] = useState<"delivery" | "drivers">("delivery");
  const [addingDriver, setAddingDriver] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [deletingDriver, setDeletingDriver] = useState<Driver | null>(null);
  const [driverForm, setDriverForm] = useState({ name: "", phone: "", vehicle: "موتوسيكل" });
  const [settlementDriver, setSettlementDriver] = useState<Driver | null>(null);
  const [settlementOrderId, setSettlementOrderId] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [returningOrder, setReturningOrder] = useState<Order | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [driverScope, setDriverScope] = useState<"all" | "available" | "busy" | "custody">("all");
  const [deliveryDriverFilter, setDeliveryDriverFilter] = useState("all");
  const unassigned = state.orders.filter((order) => order.stage === "ready" && !order.driverId);
  const activeDrivers = state.drivers.filter((driver) => driver.active);
  const driverOrders = (driverId: string) => state.orders.filter((order) =>
    order.driverId === driverId
    && !order.settlementId
    && (order.stage === "ready" || (order.stage === "delivered" && order.paymentStatus === "pending"))
  );
  const activeDeliveryOrders = state.orders.filter((order) =>
    Boolean(order.driverId)
    && !order.settlementId
    && (order.stage === "ready" || (order.stage === "delivered" && order.paymentStatus === "pending"))
  );
  const visibleActiveDeliveryOrders = activeDeliveryOrders.filter((order) =>
    deliveryDriverFilter === "all" || order.driverId === deliveryDriverFilter
  );
  const deliveryFilterDrivers = state.drivers.filter((driver) =>
    activeDeliveryOrders.some((order) => order.driverId === driver.id)
  );
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
        ...item, driverId: driver.id, driver: driver.name, stage: "ready"
      } : item)
    }));
    notify(`تم إرسال الطلب #${orderDisplayNumber(order)} مع ${driver.name}`);
  };

  const markDelivered = (order: Order) => {
    update((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === order.id ? { ...item, stage: "delivered" } : item)
    }));
    notify(`تم توصيل الطلب #${orderDisplayNumber(order)}`);
  };

  const openReturnDecision = (order: Order) => {
    setReturningOrder(order);
    setReturnReason("");
  };

  const returnForReassignment = () => {
    if (!returningOrder) return;
    update((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === returningOrder.id ? {
        ...item, stage: "ready", driverId: undefined, driver: undefined,
        returnReason: undefined, returnedAt: undefined
      } : item)
    }));
    notify(`عاد الطلب #${orderDisplayNumber(returningOrder)} وأصبح جاهزًا لإعادة الإسناد`);
    setReturningOrder(null);
  };

  const markCustomerRefused = () => {
    if (!returningOrder || !returnReason.trim()) return;
    const returnedAt = new Date().toISOString();
    const rejectedOrder = returningOrder;
    update((current) => {
      const previousCustomerOrders = current.orders
        .filter((order) => order.id !== rejectedOrder.id && order.customerId === rejectedOrder.customerId && order.stage !== "returned")
        .sort((left, right) => dateTimeValue(right.createdAt) - dateTimeValue(left.createdAt));
      const refundTransaction: CashTransaction | null = rejectedOrder.paymentStatus === "paid" ? {
        id: uid(), type: "withdrawal", method: rejectedOrder.paymentMethod, amount: rejectedOrder.total,
        direction: "out", description: `رد قيمة طلب مرفوض #${orderDisplayNumber(rejectedOrder)}`,
        orderId: rejectedOrder.id, treasuryId: rejectedOrder.treasuryId ?? salesTreasuryId(current), createdAt: returnedAt
      } : null;
      return {
        ...current,
        orders: current.orders.map((order) => order.id === rejectedOrder.id ? {
          ...order, stage: "returned", returnReason: returnReason.trim(), returnedAt,
          paymentRefunded: rejectedOrder.paymentStatus === "paid" || rejectedOrder.paymentRefunded
        } : order),
        customers: current.customers.map((customer) => customer.id === rejectedOrder.customerId ? {
          ...customer,
          ordersCount: Math.max(0, customer.ordersCount - 1),
          totalSpent: Math.max(0, customer.totalSpent - rejectedOrder.total),
          lastOrder: previousCustomerOrders[0]?.createdAt
        } : customer),
        cashTransactions: refundTransaction ? [refundTransaction, ...current.cashTransactions] : current.cashTransactions
      };
    });
    notify(`تم تسجيل رفض استلام الطلب #${orderDisplayNumber(rejectedOrder)} وإخراجه من المبيعات`);
    setReturningOrder(null);
    setReturnReason("");
  };

  const saveDriver = () => {
    if (!driverForm.name || !driverForm.phone) return;
    if (editingDriver) {
      const name = driverForm.name.trim();
      const phone = driverForm.phone.trim();
      const vehicle = driverForm.vehicle.trim();
      update((current) => ({
        ...current,
        drivers: current.drivers.map((driver) => driver.id === editingDriver.id
          ? { ...driver, name, phone, vehicle }
          : driver),
        orders: current.orders.map((order) => order.driverId === editingDriver.id && !order.settlementId
          ? { ...order, driver: name }
          : order)
      }));
      setEditingDriver(null);
      setDriverForm({ name: "", phone: "", vehicle: "موتوسيكل" });
      notify("تم تحديث بيانات المندوب");
      return;
    }
    const driver: Driver = { id: uid(), ...driverForm, active: true, createdAt: new Date().toISOString() };
    update((current) => ({ ...current, drivers: [...current.drivers, driver] }));
    setDriverForm({ name: "", phone: "", vehicle: "موتوسيكل" });
    setAddingDriver(false);
    notify("تم إضافة المندوب");
  };

  const openNewDriver = () => {
    setEditingDriver(null);
    setDriverForm({ name: "", phone: "", vehicle: "موتوسيكل" });
    setAddingDriver(true);
  };

  const openDriverEditor = (driver: Driver) => {
    setAddingDriver(false);
    setEditingDriver(driver);
    setDriverForm({ name: driver.name, phone: driver.phone, vehicle: driver.vehicle || "موتوسيكل" });
  };

  const confirmDeleteDriver = () => {
    if (!deletingDriver || driverOrders(deletingDriver.id).length) return;
    update((current) => ({
      ...current,
      drivers: current.drivers.map((driver) => driver.id === deletingDriver.id ? { ...driver, active: false } : driver)
    }));
    if (selectedDriver?.id === deletingDriver.id) setSelectedDriver(null);
    setDeletingDriver(null);
    notify("تم حذف المندوب مع الاحتفاظ بسجله السابق");
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
      description: `إجمالي تسوية المندوب ${driver.name} — ${orders.length} طلب — ${paymentLabels[paymentMethod]}`,
      treasuryId: salesTreasuryId(state), createdAt
    });
    if (expenses > 0) transactions.push({
      id: uid(), type: "expense", method: "cash", amount: expenses, direction: "out",
      description: `مصروف تسوية المندوب ${driver.name}`, treasuryId: salesTreasuryId(state), createdAt
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
      <nav className="delivery-tabs" aria-label="أقسام التوصيل">
        <button className={activeTab === "delivery" ? "active" : ""} onClick={() => setActiveTab("delivery")}><Truck /><strong>التوصيل</strong><b>{unassigned.length + activeDeliveryOrders.length}</b></button>
        <button className={activeTab === "drivers" ? "active" : ""} onClick={() => setActiveTab("drivers")}><Bike /><strong>المناديب</strong><b>{activeDrivers.length}</b></button>
      </nav>

      {activeTab === "delivery" && <>
        <div className="stat-strip">
          <MiniStat icon={<PackageCheck />} label="جاهز للإسناد" value={String(unassigned.length)} tone="orange" />
          <MiniStat icon={<Truck />} label="مع المناديب الآن" value={String(activeDeliveryOrders.filter((order) => order.stage === "ready").length)} tone="green" />
          <MiniStat icon={<Bike />} label="تم التوصيل اليوم" value={String(state.orders.filter((order) => order.stage === "delivered" && dateKey(order.createdAt) === todayKey()).length)} tone="blue" />
          <MiniStat icon={<Banknote />} label="بانتظار التحصيل" value={money(activeDeliveryOrders.filter((order) => order.stage === "delivered" && order.paymentStatus === "pending").reduce((sum, order) => sum + order.total, 0))} tone="red" />
        </div>

        <div className="panel unassigned-panel delivery-ready-panel">
          <div className="panel-title"><div><PackageCheck /><span><strong>طلبات جاهزة للتوزيع</strong></span></div><b className="ready-orders-count">{unassigned.length} طلب</b></div>
          {unassigned.length > 0 ? <div className="assignment-list">
              <div className="delivery-table-head assignment-table-head"><span>رقم الطلب</span><span>العميل</span><span>العنوان</span><span>الإجمالي</span><span>إسناد المندوب</span></div>
              {unassigned.map((order) => (
                <article className="assignment-order-row" key={order.id}>
                  <strong className="delivery-order-number">#{orderDisplayNumber(order)}</strong>
                  <strong>{order.customerName}</strong>
                  <span className="delivery-address-cell"><MapPin /> {order.address || "بدون عنوان"}</span>
                  <b className="assignment-order-total">{money(order.total)}</b>
                  <div className="assign-buttons">
                    <select defaultValue="" onChange={(event) => {
                      const driver = activeDrivers.find((item) => item.id === event.target.value);
                      if (driver) assign(order, driver);
                    }}><option value="" disabled>{activeDrivers.length ? "اختار مندوبًا" : "لا يوجد مناديب نشطون"}</option>{activeDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name} · {driverOrders(driver.id).length} طلبات</option>)}</select>
                  </div>
                </article>
              ))}
            </div> : <div className="delivery-inline-empty"><PackageCheck /><span><strong>لا توجد طلبات جاهزة للإسناد</strong><small>سيظهر الطلب هنا بمجرد انتهاء تجهيزه</small></span></div>}
        </div>

        <section className="delivery-active-section">
          <div className="delivery-active-head"><span><Truck /></span><strong>الطلبات مع المناديب</strong><label><Bike /><select value={deliveryDriverFilter} onChange={(event) => setDeliveryDriverFilter(event.target.value)}><option value="all">كل المناديب</option>{deliveryFilterDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label><b>{visibleActiveDeliveryOrders.length} طلب</b></div>
          <div className="delivery-active-list">
            <div className="delivery-table-head active-delivery-table-head"><span>رقم الطلب</span><span>العميل</span><span>العنوان</span><span>المندوب</span><span>الإجمالي</span><span>الحالة</span><span>الإجراءات</span></div>
            {visibleActiveDeliveryOrders.map((order) => {
              const driver = activeDrivers.find((item) => item.id === order.driverId) ?? state.drivers.find((item) => item.id === order.driverId);
              return <article key={order.id}>
                <strong className="delivery-order-number">#{orderDisplayNumber(order)}</strong>
                <span className="delivery-customer-cell"><strong>{order.customerName}</strong><em><Phone /> {order.customerPhone}</em></span>
                <span className="delivery-address-cell"><MapPin /> {order.address || "بدون عنوان"}</span>
                <span className="delivery-driver-cell"><strong>{driver?.name ?? order.driver ?? "غير محدد"}</strong><em>{driver?.phone ?? "—"}</em></span>
                <strong className="delivery-order-total">{money(order.total)}</strong>
                <StatusBadge type={order.stage === "ready" ? "info" : "warning"}>{order.stage === "ready" ? "مع المندوب" : "بانتظار التحصيل"}</StatusBadge>
                <div className="delivery-order-actions">
                  {order.stage === "ready" ? <><button onClick={() => markDelivered(order)}><Check /> تم التوصيل</button><button className="return-order" onClick={() => openReturnDecision(order)}>رجع للمطعم</button></> : <button onClick={() => { if (driver) { setSettlementOrderId(order.id); setSettlementDriver(driver); } }}><ClipboardCheck /> تسوية الطلب</button>}
                </div>
              </article>;
            })}
            {!visibleActiveDeliveryOrders.length && <div className="delivery-inline-empty"><Truck /><span><strong>{activeDeliveryOrders.length ? "لا توجد طلبات لهذا المندوب" : "لا توجد طلبات مع المناديب حاليًا"}</strong></span></div>}
          </div>
        </section>
      </>}

      {activeTab === "drivers" && <>
        <div className="stat-strip delivery-drivers-stats">
          <MiniStat icon={<Bike />} label="المناديب النشطون" value={String(activeDrivers.length)} tone="green" />
          <MiniStat icon={<Check />} label="متاح الآن" value={String(activeDrivers.filter((driver) => !driverOrders(driver.id).length).length)} tone="blue" />
          <MiniStat icon={<Truck />} label="مشغول الآن" value={String(activeDrivers.filter((driver) => driverOrders(driver.id).some((order) => order.stage === "ready")).length)} tone="orange" />
          <MiniStat icon={<ClipboardCheck />} label="تسويات اليوم" value={String(state.driverSettlements.filter((item) => dateKey(item.createdAt) === todayKey()).length)} tone="red" />
        </div>
        <section className="delivery-drivers-section">
        <div className="delivery-drivers-head">
          <div className="delivery-drivers-title"><span><strong>فريق التوصيل</strong><small>{visibleDrivers.length} مندوب ظاهر من {activeDrivers.length} نشط</small></span><button onClick={openNewDriver}><UserPlus /> إضافة مندوب</button></div>
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
                <div className="driver-card-status">
                  <StatusBadge type={hasReady ? "info" : custody > 0 ? "warning" : "success"}>
                    {hasReady ? "مشغول" : custody > 0 ? "بانتظار تسوية" : "متاح"}
                  </StatusBadge>
                  <span className="driver-management-actions">
                    <button title="تعديل بيانات المندوب" aria-label={`تعديل ${driver.name}`} onClick={() => openDriverEditor(driver)}><Edit3 /></button>
                    <button className="delete" title="حذف المندوب" aria-label={`حذف ${driver.name}`} onClick={() => setDeletingDriver(driver)}><Trash2 /></button>
                  </span>
                </div>
              </header>
              <div className="driver-summary">
                <span><small>طلبات حالية</small><b>{assigned.length}</b></span>
                <span><small>عهدة معلقة</small><b>{money(custody)}</b></span>
                <span><small>تم اليوم</small><b>{state.orders.filter((order) => order.driverId === driver.id && order.stage === "delivered" && dateKey(order.createdAt) === todayKey()).length}</b></span>
              </div>
              <footer className="driver-card-actions"><button className="driver-profile-button" onClick={() => setSelectedDriver(driver)}><Info /> ملف المندوب</button><button className="settlement-button" disabled={!unsettled.length} onClick={() => { setSettlementOrderId(null); setSettlementDriver(driver); }}><ClipboardCheck /> تسوية {unsettled.length > 0 && `(${unsettled.length})`}</button></footer>
            </article>
          );
        })}
        {!visibleDrivers.length && <Empty icon={<Bike />} title="لا توجد نتائج للمناديب" text="غيّر البحث أو الفلتر الحالي" />}
        </div>
        </section>
      </>}

      {(addingDriver || editingDriver) && (
        <Modal title={editingDriver ? "تعديل بيانات المندوب" : "إضافة مندوب جديد"} onClose={() => { setAddingDriver(false); setEditingDriver(null); }} size="medium">
          <div className="driver-editor-modal">
            <div className="driver-editor-hero"><span><Bike /></span><div><strong>بيانات مندوب التوصيل</strong><small>{editingDriver ? "حدّث الاسم ورقم الهاتف ووسيلة التوصيل" : "أضف بيانات التواصل ووسيلة التوصيل ليظهر في قائمة التوزيع فورًا"}</small></div></div>
            <div className="driver-editor-fields">
              <label><span>اسم المندوب <em>*</em></span><div><UserPlus /><input autoFocus value={driverForm.name} onChange={(event) => setDriverForm({ ...driverForm, name: event.target.value })} placeholder="اكتب الاسم بالكامل" /></div></label>
              <label><span>رقم الموبايل <em>*</em></span><div><Phone /><input inputMode="tel" value={driverForm.phone} onChange={(event) => setDriverForm({ ...driverForm, phone: event.target.value })} placeholder="01xxxxxxxxx" /></div></label>
              <label className="full-field"><span>وسيلة التوصيل</span><div><Bike /><input list="driver-vehicle-options" value={driverForm.vehicle} onChange={(event) => setDriverForm({ ...driverForm, vehicle: event.target.value })} placeholder="مثال: موتوسيكل" /><datalist id="driver-vehicle-options"><option value="موتوسيكل" /><option value="عجلة" /><option value="سيارة" /></datalist></div></label>
            </div>
            <div className="driver-editor-note"><Check /><span>{editingDriver ? "سيتم تحديث البيانات في الطلبات الحالية مع الحفاظ على السجل السابق." : "سيتم تفعيل المندوب تلقائيًا وسيظهر ضمن مناديب التوزيع."}</span></div>
            <div className="driver-editor-actions"><button className="soft-button" onClick={() => { setAddingDriver(false); setEditingDriver(null); }}>إلغاء</button><button className="primary-button" disabled={!driverForm.name.trim() || !driverForm.phone.trim()} onClick={saveDriver}><Save /> {editingDriver ? "حفظ التعديلات" : "حفظ وإضافة المندوب"}</button></div>
          </div>
        </Modal>
      )}
      {deletingDriver && (() => {
        const openOrders = driverOrders(deletingDriver.id);
        return <Modal title="تأكيد حذف المندوب" onClose={() => setDeletingDriver(null)} size="medium">
          <div className="driver-delete-confirm">
            <span><Trash2 /></span>
            <strong>حذف {deletingDriver.name}؟</strong>
            <p>{openOrders.length
              ? `لا يمكن حذف المندوب لأن لديه ${openOrders.length} طلب أو عهدة معلقة. أعد الطلبات للمطعم أو أنهِ التوصيل والتسوية أولًا.`
              : "سيختفي المندوب من شاشة التوزيع، مع الاحتفاظ باسمه داخل الطلبات والتسويات السابقة."}</p>
            <div><button onClick={() => setDeletingDriver(null)}>إلغاء</button><button className="delete" disabled={openOrders.length > 0} onClick={confirmDeleteDriver}><Trash2 /> تأكيد الحذف</button></div>
          </div>
        </Modal>;
      })()}
      {returningOrder && <Modal title={`معالجة رجوع الطلب #${orderDisplayNumber(returningOrder)}`} onClose={() => { setReturningOrder(null); setReturnReason(""); }} size="medium">
        <div className="delivery-return-modal">
          <header><span><Truck /></span><div><strong>الطلب رجع إلى المطعم</strong><small>{returningOrder.customerName} · {returningOrder.driver}</small></div></header>
          <section className="delivery-return-choice reassign">
            <div><span><PackageCheck /></span><div><strong>إعادة إسناد الطلب</strong><p>يرجع الطلب لقائمة الطلبات الجاهزة لاختيار مندوب آخر.</p></div></div>
            <button onClick={returnForReassignment}>إعادة للطلبات الجاهزة</button>
          </section>
          <section className="delivery-return-choice refused">
            <div><span><X /></span><div><strong>العميل رفض الاستلام</strong><p>يُغلق الطلب كمرتجع ولا يُحسب ضمن المبيعات، مع بقاء خصم الخامات.</p></div></div>
            <label>سبب الرفض <em>*</em><textarea autoFocus value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="مثال: العميل رفض الاستلام أو تعذر التواصل معه" /></label>
            {returningOrder.paymentStatus === "paid" && <small className="delivery-refund-note"><Banknote /> سيتم تسجيل رد مبلغ {money(returningOrder.total)} بنفس طريقة الدفع.</small>}
            <button disabled={!returnReason.trim()} onClick={markCustomerRefused}>تأكيد رفض الاستلام</button>
          </section>
        </div>
      </Modal>}
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
        onReturned={(order) => { setSelectedDriver(null); openReturnDecision(order); }}
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

function DriverProfileModal({ driver, orders, onClose, onSettle, onDelivered, onReturned }: {
  driver: Driver;
  orders: Order[];
  onClose: () => void;
  onSettle: (order?: Order) => void;
  onDelivered: (order: Order) => void;
  onReturned: (order: Order) => void;
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
          <span><strong>طلب #{orderDisplayNumber(order)}</strong><small>{order.customerName} · {order.customerPhone}</small></span>
          <span className="driver-order-address">{order.address}</span>
          <b>{money(order.total)}</b>
          <span>{order.stage === "ready" ? <StatusBadge type="info">مع المندوب</StatusBadge> : <StatusBadge type={order.paymentStatus === "pending" ? "warning" : "success"}>{order.paymentStatus === "pending" ? "تحصيل معلق" : "تم التحصيل"}</StatusBadge>}</span>
          <span className="driver-order-actions">{order.stage === "ready" && <><button onClick={() => onDelivered(order)}><Check /> تم التوصيل</button><button className="return-order" onClick={() => onReturned(order)}>رفض الاستلام</button></>}{order.stage === "delivered" && order.paymentStatus === "pending" && <button className="settle-single-order" onClick={() => onSettle(order)}><ClipboardCheck /> تسوية الطلب</button>}</span>
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
              <span><strong>طلب #{orderDisplayNumber(order)}</strong><small>{order.customerName} · {stageLabels[order.stage]}</small></span>
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

export function CashView({ state, update, notify, cashTab }: ViewProps & { cashTab: "treasury" | "shift" | "daily" }) {
  const [selectedTreasuryId, setSelectedTreasuryId] = useState<"all" | string>("all");
  const [treasuryManagerOpen, setTreasuryManagerOpen] = useState(false);
  const [newTreasuryName, setNewTreasuryName] = useState("");
  const [treasuryNameDrafts, setTreasuryNameDrafts] = useState<Record<string, string>>({});
  const [transactionMethodFilter, setTransactionMethodFilter] = useState<"all" | PaymentMethod>("all");
  const [transactionDirectionFilter, setTransactionDirectionFilter] = useState<"all" | "in" | "out">("all");
  const [directionFilterOpen, setDirectionFilterOpen] = useState(false);
  const [dailyMethodFilter, setDailyMethodFilter] = useState<"all" | PaymentMethod>("all");
  const [expense, setExpense] = useState(false);
  const [expenseData, setExpenseData] = useState<{ amount: number; description: string; method: PaymentMethod; treasuryId: string }>({
    amount: 0, description: "", method: "cash", treasuryId: purchasesTreasuryId(state)
  });
  const [treasuryTransferOpen, setTreasuryTransferOpen] = useState(false);
  const [treasuryTransfer, setTreasuryTransfer] = useState<{ fromTreasuryId: string; toTreasuryId: string; amount: number; method: PaymentMethod; note: string }>({
    fromTreasuryId: salesTreasuryId(state), toTreasuryId: purchasesTreasuryId(state), amount: 0, method: "cash", note: ""
  });
  const [treasuryDepositOpen, setTreasuryDepositOpen] = useState(false);
  const [treasuryDeposit, setTreasuryDeposit] = useState<{ treasuryId: string; amount: number; method: PaymentMethod; note: string }>({
    treasuryId: purchasesTreasuryId(state), amount: 0, method: "cash", note: ""
  });
  const [treasuryReportOpen, setTreasuryReportOpen] = useState(false);
  const [reportTreasuryId, setReportTreasuryId] = useState(purchasesTreasuryId(state));
  const [treasuryFilterOpen, setTreasuryFilterOpen] = useState(false);
  const [cashDateFilterOpen, setCashDateFilterOpen] = useState(false);
  const [cashDatePreset, setCashDatePreset] = useState<OrderDatePreset>("today");
  const [cashDateFrom, setCashDateFrom] = useState<string>(todayKey);
  const [cashDateTo, setCashDateTo] = useState<string>(todayKey);
  const [draftCashDatePreset, setDraftCashDatePreset] = useState<OrderDatePreset>("today");
  const [draftCashDateFrom, setDraftCashDateFrom] = useState<string>(todayKey);
  const [draftCashDateTo, setDraftCashDateTo] = useState<string>(todayKey);
  const [openingShift, setOpeningShift] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [openingAmount, setOpeningAmount] = useState(0);
  const [closingData, setClosingData] = useState({ actualCash: 0, note: "" });
  const cashDisplayDate = (value: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    day: "numeric", month: "short", year: "numeric"
  }).format(new Date(`${value}T12:00:00`));
  const offsetCashDate = (value: string, days: number) => {
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const cashDateLabel = cashDatePreset === "all" ? "كل التواريخ"
    : cashDatePreset === "today" ? "اليوم"
      : cashDatePreset === "yesterday" ? "أمس"
        : cashDatePreset === "last7" ? "آخر 7 أيام"
          : cashDatePreset === "month" ? "هذا الشهر"
            : cashDateFrom && cashDateTo ? `${cashDisplayDate(cashDateFrom)} – ${cashDisplayDate(cashDateTo)}`
              : cashDateFrom ? `من ${cashDisplayDate(cashDateFrom)}` : cashDateTo ? `حتى ${cashDisplayDate(cashDateTo)}` : "فترة مخصصة";
  const selectCashDatePreset = (preset: Exclude<OrderDatePreset, "all" | "custom">) => {
    const today = todayKey();
    let from = today;
    let to = today;
    if (preset === "yesterday") from = to = offsetCashDate(today, -1);
    if (preset === "last7") from = offsetCashDate(today, -6);
    if (preset === "month") from = `${today.slice(0, 7)}-01`;
    setCashDatePreset(preset);
    setCashDateFrom(from);
    setCashDateTo(to);
    setDraftCashDatePreset(preset);
    setDraftCashDateFrom(from);
    setDraftCashDateTo(to);
    setCashDateFilterOpen(false);
  };
  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest(".cash-treasury-filter-wrap") && !target.closest(".cash-date-range-wrap") && !target.closest(".transaction-direction-filter-wrap")) {
        setTreasuryFilterOpen(false);
        setCashDateFilterOpen(false);
        setDirectionFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);
  const toggleTreasuryFilter = () => {
    setCashDateFilterOpen(false);
    setDirectionFilterOpen(false);
    setTreasuryFilterOpen((open) => !open);
  };
  const toggleCashDateFilter = () => {
    setTreasuryFilterOpen(false);
    setDirectionFilterOpen(false);
    if (!cashDateFilterOpen) {
      setDraftCashDatePreset(cashDatePreset);
      setDraftCashDateFrom(cashDateFrom);
      setDraftCashDateTo(cashDateTo);
    }
    setCashDateFilterOpen((open) => !open);
  };
  const toggleDirectionFilter = () => {
    setTreasuryFilterOpen(false);
    setCashDateFilterOpen(false);
    setDirectionFilterOpen((open) => !open);
  };
  const applyCashDateFilter = () => {
    if (draftCashDateFrom && draftCashDateTo && draftCashDateFrom > draftCashDateTo) {
      notify("تاريخ البداية يجب أن يكون قبل تاريخ النهاية");
      return;
    }
    const hasDate = Boolean(draftCashDateFrom || draftCashDateTo);
    setCashDatePreset(hasDate ? "custom" : "all");
    setCashDateFrom(draftCashDateFrom);
    setCashDateTo(draftCashDateTo);
    setCashDateFilterOpen(false);
  };
  const clearCashDateFilter = () => {
    setCashDatePreset("all");
    setCashDateFrom("");
    setCashDateTo("");
    setDraftCashDatePreset("all");
    setDraftCashDateFrom("");
    setDraftCashDateTo("");
    setCashDateFilterOpen(false);
  };
  const isInCashDateRange = (value: string) => {
    const key = dateKey(value);
    return (!cashDateFrom || key >= cashDateFrom) && (!cashDateTo || key <= cashDateTo);
  };
  const currentSalesTreasuryId = salesTreasuryId(state);
  const currentPurchasesTreasuryId = purchasesTreasuryId(state);
  const activeTreasuries = state.treasuries.filter((treasury) => treasury.active);
  const matchesSelectedTreasury = (treasuryId: string | undefined, fallbackId: string) =>
    selectedTreasuryId === "all" || (treasuryId ?? fallbackId) === selectedTreasuryId;
  const activeShift = state.cashShifts.find((shift) =>
    !shift.closedAt && (shift.treasuryId ?? currentSalesTreasuryId) === currentSalesTreasuryId
  );
  const viewedShift = activeShift ?? state.cashShifts.find((shift) =>
    (shift.treasuryId ?? currentSalesTreasuryId) === currentSalesTreasuryId
  );
  const selectedTransactions = state.cashTransactions.filter((transaction) =>
    isInCashDateRange(transaction.createdAt)
    && matchesSelectedTreasury(transactionTreasuryId(state, transaction), currentSalesTreasuryId)
  );
  const returnedOrderIds = new Set(state.orders.filter((order) => order.stage === "returned").map((order) => order.id));
  const refundedOriginalPaymentOrderIds = new Set(state.orders.filter((order) => order.paymentRefunded).map((order) => order.id));
  const selectedShifts = state.cashShifts.filter((shift) =>
    isInCashDateRange(shift.openedAt)
    && matchesSelectedTreasury(shift.treasuryId, currentSalesTreasuryId)
  );
  const selectedOpeningBalance = selectedShifts.reduce((sum, shift) => sum + shift.openingBalance, 0);
  const dailyRevenueTransactions = selectedTransactions.filter((transaction) =>
    transaction.direction === "in" && (transaction.type === "sale" || transaction.type === "collection" || (transaction.type === "deposit" && transaction.orderId))
    && (!transaction.orderId || !returnedOrderIds.has(transaction.orderId))
    && (transaction.type !== "sale" || !transaction.orderId || !refundedOriginalPaymentOrderIds.has(transaction.orderId))
  );
  const dailyEditWithdrawals = selectedTransactions.filter((transaction) =>
    transaction.direction === "out" && transaction.type === "withdrawal" && transaction.orderId
    && !returnedOrderIds.has(transaction.orderId)
  );
  const dailyEditWithdrawalsTotal = dailyEditWithdrawals.reduce((sum, transaction) => sum + transaction.amount, 0);
  const dailySalesRevenue = dailyRevenueTransactions.filter((transaction) => transaction.type === "sale").reduce((sum, transaction) => sum + transaction.amount, 0);
  const dailyCollections = dailyRevenueTransactions.filter((transaction) => transaction.type === "collection").reduce((sum, transaction) => sum + transaction.amount, 0);
  const dailyEditDeposits = dailyRevenueTransactions.filter((transaction) => transaction.type === "deposit").reduce((sum, transaction) => sum + transaction.amount, 0);
  const dailyOperationalExpenses = selectedTransactions.filter((transaction) => transaction.type === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
  const dailyRevenue = dailySalesRevenue + dailyCollections + dailyEditDeposits - dailyEditWithdrawalsTotal;
  const dailyNet = dailyRevenue - dailyOperationalExpenses;
  const dailyOrders = state.orders.filter((order) =>
    isInCashDateRange(order.createdAt)
    && order.stage !== "returned"
    && matchesSelectedTreasury(order.treasuryId, currentSalesTreasuryId)
  );
  const dailyOrderCount = dailyOrders.length;
  const dailyAvgOrder = dailyOrderCount ? dailyOrders.reduce((sum, order) => sum + order.total, 0) / dailyOrderCount : 0;
  const dailyPending = dailyOrders.filter((order) => order.paymentStatus === "pending").reduce((sum, order) => sum + order.total, 0);
  const dailyDiscounts = dailyOrders.reduce((sum, order) => sum + order.discount, 0);
  const dailyDeliveryFees = dailyOrders.reduce((sum, order) => sum + order.deliveryFee, 0);
  const comparisonDateKey = cashDateFrom && cashDateFrom === cashDateTo ? offsetCashDate(cashDateFrom, -1) : null;
  const yesterdayTransactions = comparisonDateKey ? state.cashTransactions
    .filter((transaction) => dateKey(transaction.createdAt) === comparisonDateKey
      && matchesSelectedTreasury(transactionTreasuryId(state, transaction), currentSalesTreasuryId)) : [];
  const yesterdayRevenueIn = yesterdayTransactions
    .filter((transaction) => transaction.direction === "in" && (transaction.type === "sale" || transaction.type === "collection" || (transaction.type === "deposit" && transaction.orderId))
      && (!transaction.orderId || !returnedOrderIds.has(transaction.orderId))
      && (transaction.type !== "sale" || !transaction.orderId || !refundedOriginalPaymentOrderIds.has(transaction.orderId)))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const yesterdayEditWithdrawals = yesterdayTransactions
    .filter((transaction) => transaction.direction === "out" && transaction.type === "withdrawal" && transaction.orderId
      && !returnedOrderIds.has(transaction.orderId))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const yesterdayRevenue = yesterdayRevenueIn - yesterdayEditWithdrawals;
  const revenueChangePercent = comparisonDateKey && yesterdayRevenue ? ((dailyRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : null;
  const dailyMethodRevenue = (method: PaymentMethod) => {
    const incoming = dailyRevenueTransactions.filter((transaction) => transaction.method === method);
    const methodEditWithdrawals = dailyEditWithdrawals.filter((transaction) => transaction.method === method);
    const methodExpenses = selectedTransactions.filter((transaction) => transaction.method === method && transaction.type === "expense");
    const amountIn = incoming.reduce((sum, transaction) => sum + transaction.amount, 0);
    const amountEditOut = methodEditWithdrawals.reduce((sum, transaction) => sum + transaction.amount, 0);
    const amount = amountIn - amountEditOut;
    const outgoing = methodExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
    return { amount, outgoing, net: amount - outgoing, count: incoming.length + methodEditWithdrawals.length, share: dailyRevenue ? (Math.max(0, amount) / Math.max(1, dailyRevenue)) * 100 : 0 };
  };
  const dailyShiftRows = [...selectedShifts]
    .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime())
    .map((shift) => {
      const openedAt = new Date(shift.openedAt).getTime();
      const closedAt = shift.closedAt ? new Date(shift.closedAt).getTime() : Number.POSITIVE_INFINITY;
      const transactions = selectedTransactions.filter((transaction) => {
        const time = new Date(transaction.createdAt).getTime();
        return time >= openedAt && time <= closedAt
          && transactionTreasuryId(state, transaction) === (shift.treasuryId ?? currentSalesTreasuryId);
      });
      const incomeFor = (method: PaymentMethod) => {
        const methodIn = transactions
          .filter((transaction) => transaction.direction === "in" && (transaction.type === "sale" || transaction.type === "collection" || (transaction.type === "deposit" && transaction.orderId)) && transaction.method === method && (!transaction.orderId || !returnedOrderIds.has(transaction.orderId)) && (transaction.type !== "sale" || !transaction.orderId || !refundedOriginalPaymentOrderIds.has(transaction.orderId)))
          .reduce((sum, transaction) => sum + transaction.amount, 0);
        const methodEditOut = transactions
          .filter((transaction) => transaction.direction === "out" && transaction.type === "withdrawal" && transaction.orderId && !returnedOrderIds.has(transaction.orderId) && transaction.method === method)
          .reduce((sum, transaction) => sum + transaction.amount, 0);
        return methodIn - methodEditOut;
      };
      const revenue = incomeFor("cash") + incomeFor("instapay") + incomeFor("vodafone");
      const expenses = transactions.filter((transaction) => transaction.type === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
      return { shift, cash: incomeFor("cash"), instapay: incomeFor("instapay"), vodafone: incomeFor("vodafone"), revenue, expenses, net: revenue - expenses, transactions: transactions.length };
    });
  const shiftTransactions = viewedShift
    ? state.cashTransactions.filter((transaction) => {
      const time = new Date(transaction.createdAt).getTime();
      return time >= new Date(viewedShift.openedAt).getTime()
        && (!viewedShift.closedAt || time <= new Date(viewedShift.closedAt).getTime())
        && transactionTreasuryId(state, transaction) === (viewedShift.treasuryId ?? currentSalesTreasuryId);
    })
    : [];
  const displayedTransactions = cashTab === "shift" ? shiftTransactions : selectedTransactions;
  const filteredTransactions = displayedTransactions.filter((transaction) => {
    const matchesMethod = transactionMethodFilter === "all" || transaction.method === transactionMethodFilter;
    const matchesDirection = transactionDirectionFilter === "all" || transaction.direction === transactionDirectionFilter;
    return matchesMethod && matchesDirection;
  });
  const displayedOpeningBalance = cashTab === "shift" ? (viewedShift?.openingBalance ?? 0) : selectedOpeningBalance;
  const treasuryTransactionsThroughEnd = state.cashTransactions.filter((transaction) =>
    (!cashDateTo || dateKey(transaction.createdAt) <= cashDateTo)
    && matchesSelectedTreasury(transactionTreasuryId(state, transaction), currentSalesTreasuryId)
  );
  const treasuryIdsForBalance = selectedTreasuryId === "all"
    ? state.treasuries.map((treasury) => treasury.id)
    : [selectedTreasuryId];
  const treasuryOpeningThroughEnd = treasuryIdsForBalance.reduce((sum, treasuryId) => {
    const firstShift = [...state.cashShifts]
      .filter((shift) => (shift.treasuryId ?? currentSalesTreasuryId) === treasuryId
        && (!cashDateTo || dateKey(shift.openedAt) <= cashDateTo))
      .sort((left, right) => new Date(left.openedAt).getTime() - new Date(right.openedAt).getTime())[0];
    return sum + (firstShift?.openingBalance ?? 0);
  }, 0);
  const methodSummary = (method: PaymentMethod) => {
    const sourceTransactions = cashTab === "treasury" ? treasuryTransactionsThroughEnd : displayedTransactions;
    const transactions = sourceTransactions.filter((transaction) => transaction.method === method);
    const incoming = transactions.filter((transaction) => transaction.direction === "in").reduce((sum, transaction) => sum + transaction.amount, 0);
    const outgoing = transactions.filter((transaction) => transaction.direction === "out").reduce((sum, transaction) => sum + transaction.amount, 0);
    const opening = method === "cash"
      ? cashTab === "treasury" ? treasuryOpeningThroughEnd : displayedOpeningBalance
      : 0;
    return { incoming, outgoing, count: transactions.length, balance: incoming - outgoing + opening };
  };
  const cashSummary = methodSummary("cash");
  const instapaySummary = methodSummary("instapay");
  const vodafoneSummary = methodSummary("vodafone");
  const totalBalance = cashSummary.balance + instapaySummary.balance + vodafoneSummary.balance;
  const periodTreasuryBalance = (treasuryId: string) => {
    const firstShift = [...state.cashShifts]
      .filter((shift) => (shift.treasuryId ?? currentSalesTreasuryId) === treasuryId
        && (!cashDateTo || dateKey(shift.openedAt) <= cashDateTo))
      .sort((left, right) => new Date(left.openedAt).getTime() - new Date(right.openedAt).getTime())[0];
    const opening = firstShift?.openingBalance ?? 0;
    const movement = state.cashTransactions
      .filter((transaction) => (!cashDateTo || dateKey(transaction.createdAt) <= cashDateTo)
        && transactionTreasuryId(state, transaction) === treasuryId)
      .reduce((sum, transaction) => sum + (transaction.direction === "in" ? transaction.amount : -transaction.amount), 0);
    return opening + movement;
  };
  const allTreasuriesPeriodBalance = state.treasuries.reduce((sum, treasury) => sum + periodTreasuryBalance(treasury.id), 0);
  const selectedTreasury = selectedTreasuryId === "all"
    ? null
    : state.treasuries.find((treasury) => treasury.id === selectedTreasuryId) ?? null;
  const selectedTreasuryLabel = selectedTreasury?.name ?? "كل الخزن";
  const selectedTreasuryClosingBalance = selectedTreasury
    ? periodTreasuryBalance(selectedTreasury.id)
    : allTreasuriesPeriodBalance;
  const orderNumberById = new Map(state.orders.map((order) => [order.id, orderDisplayNumber(order)]));
  const settlementOrderNumbersByCreatedAt = new Map(state.driverSettlements.map((settlement) => [
    settlement.createdAt,
    settlement.orderIds.map((orderId) => orderNumberById.get(orderId)).filter((number) => number !== undefined)
  ]));
  const orderNumbersForTransaction = (transaction: CashTransaction) => {
    const directOrderNumber = transaction.orderId ? orderNumberById.get(transaction.orderId) : undefined;
    return directOrderNumber !== undefined ? [directOrderNumber] : settlementOrderNumbersByCreatedAt.get(transaction.createdAt) ?? [];
  };
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
  const resolvedReportTreasuryId = state.treasuries.some((treasury) => treasury.id === reportTreasuryId)
    ? reportTreasuryId
    : currentPurchasesTreasuryId;
  const reportTreasury = state.treasuries.find((treasury) => treasury.id === resolvedReportTreasuryId);
  const reportAllTransactions = state.cashTransactions
    .filter((transaction) => transactionTreasuryId(state, transaction) === resolvedReportTreasuryId);
  const reportInitialShift = [...state.cashShifts]
    .filter((shift) => (shift.treasuryId ?? currentSalesTreasuryId) === resolvedReportTreasuryId
      && (!cashDateTo || dateKey(shift.openedAt) <= cashDateTo))
    .sort((left, right) => new Date(left.openedAt).getTime() - new Date(right.openedAt).getTime())[0];
  const reportBaseOpeningBalance = reportInitialShift?.openingBalance ?? 0;
  const reportOpeningBalance = reportBaseOpeningBalance + (cashDateFrom
    ? reportAllTransactions
      .filter((transaction) => dateKey(transaction.createdAt) < cashDateFrom)
      .reduce((sum, transaction) => sum + (transaction.direction === "in" ? transaction.amount : -transaction.amount), 0)
    : 0);
  const reportPeriodTransactions = reportAllTransactions
    .filter((transaction) => isInCashDateRange(transaction.createdAt))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const reportIncoming = reportPeriodTransactions
    .filter((transaction) => transaction.direction === "in")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const reportOutgoing = reportPeriodTransactions
    .filter((transaction) => transaction.direction === "out")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const reportDeposits = reportPeriodTransactions
    .filter((transaction) => transaction.type === "deposit" && transaction.direction === "in")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const reportSalesAndCollections = reportPeriodTransactions
    .filter((transaction) => transaction.direction === "in" && (transaction.type === "sale" || transaction.type === "collection"))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const reportExpenses = reportPeriodTransactions
    .filter((transaction) => transaction.type === "expense" && transaction.direction === "out")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const reportWithdrawals = reportPeriodTransactions
    .filter((transaction) => transaction.type === "withdrawal" && transaction.direction === "out")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const reportClosingBalance = reportOpeningBalance + reportIncoming - reportOutgoing;
  let reportRunningBalance = reportOpeningBalance;
  const reportRows = reportPeriodTransactions.map((transaction) => {
    reportRunningBalance += transaction.direction === "in" ? transaction.amount : -transaction.amount;
    return { transaction, balance: reportRunningBalance };
  }).reverse();
  const reportMethodBalance = (method: PaymentMethod) => {
    const opening = (method === "cash" ? reportBaseOpeningBalance : 0) + (cashDateFrom
      ? reportAllTransactions.filter((transaction) => dateKey(transaction.createdAt) < cashDateFrom && transaction.method === method)
        .reduce((sum, transaction) => sum + (transaction.direction === "in" ? transaction.amount : -transaction.amount), 0)
      : 0);
    return opening + reportPeriodTransactions.filter((transaction) => transaction.method === method)
      .reduce((sum, transaction) => sum + (transaction.direction === "in" ? transaction.amount : -transaction.amount), 0);
  };
  const openTreasuryManager = () => {
    setTreasuryNameDrafts(Object.fromEntries(state.treasuries.map((treasury) => [treasury.id, treasury.name])));
    setNewTreasuryName("");
    setTreasuryManagerOpen(true);
  };
  const addTreasury = () => {
    const name = newTreasuryName.trim();
    if (!name) return;
    if (state.treasuries.some((treasury) => treasury.name.trim() === name)) {
      notify("يوجد خزنة بنفس الاسم بالفعل");
      return;
    }
    const treasury = { id: uid(), name, active: true, createdAt: new Date().toISOString() };
    update((current) => ({ ...current, treasuries: [...current.treasuries, treasury] }));
    setTreasuryNameDrafts((current) => ({ ...current, [treasury.id]: treasury.name }));
    setNewTreasuryName("");
    notify(`تمت إضافة ${name}`);
  };
  const saveTreasuryName = (treasuryId: string) => {
    const name = (treasuryNameDrafts[treasuryId] ?? "").trim();
    if (!name) return;
    if (state.treasuries.some((treasury) => treasury.id !== treasuryId && treasury.name.trim() === name)) {
      notify("يوجد خزنة بنفس الاسم بالفعل");
      return;
    }
    update((current) => ({
      ...current,
      treasuries: current.treasuries.map((treasury) => treasury.id === treasuryId ? { ...treasury, name } : treasury)
    }));
    notify("تم تحديث اسم الخزنة");
  };
  const setDefaultSalesTreasury = (treasuryId: string) => {
    if (activeShift && treasuryId !== currentSalesTreasuryId) {
      notify("أغلق الوردية الحالية أولًا قبل تغيير خزنة المبيعات");
      return;
    }
    update((current) => ({ ...current, defaultSalesTreasuryId: treasuryId }));
    notify("تم تعيين خزنة المبيعات");
  };
  const setDefaultPurchasesTreasury = (treasuryId: string) => {
    update((current) => ({ ...current, defaultPurchasesTreasuryId: treasuryId }));
    setExpenseData((current) => ({ ...current, treasuryId }));
    notify("تم تعيين خزنة المشتريات والمصروفات");
  };
  const deactivateTreasury = (treasuryId: string) => {
    const treasury = state.treasuries.find((item) => item.id === treasuryId);
    if (!treasury || treasuryId === currentSalesTreasuryId || treasuryId === currentPurchasesTreasuryId) {
      notify("لا يمكن تعطيل خزنة افتراضية");
      return;
    }
    if (!window.confirm(`هل تريد تعطيل ${treasury.name}؟ ستظل حركاتها القديمة محفوظة.`)) return;
    update((current) => ({
      ...current,
      treasuries: current.treasuries.map((item) => item.id === treasuryId ? { ...item, active: false } : item)
    }));
    if (selectedTreasuryId === treasuryId) setSelectedTreasuryId("all");
    notify("تم تعطيل الخزنة مع الاحتفاظ بكل حركاتها");
  };
  const reactivateTreasury = (treasuryId: string) => {
    update((current) => ({
      ...current,
      treasuries: current.treasuries.map((item) => item.id === treasuryId ? { ...item, active: true } : item)
    }));
    notify("تم تفعيل الخزنة من جديد");
  };
  const activeShiftTransactions = activeShift ? shiftTransactions : [];
  const expectedClosingCash = activeShift
    ? activeShift.openingBalance + activeShiftTransactions
      .filter((transaction) => transaction.method === "cash")
      .reduce((sum, transaction) => sum + (transaction.direction === "in" ? transaction.amount : -transaction.amount), 0)
    : 0;
  const openShift = () => {
    const openedAt = new Date().toISOString();
    const shift = {
      id: uid(), treasuryId: salesTreasuryId(state), openedAt, openingBalance: Math.max(0, openingAmount)
    };
    update((current) => ({
      ...current,
      cashShifts: [shift, ...current.cashShifts],
      shiftOpeningBalance: shift.openingBalance,
      shiftOpenedAt: openedAt
    }));
    setCashDatePreset("today");
    setCashDateFrom(todayKey());
    setCashDateTo(todayKey());
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
    if (expenseData.treasuryId === currentSalesTreasuryId && !activeShift) {
      notify("افتح وردية أولًا قبل الصرف من خزنة المبيعات");
      return;
    }
    if (!expenseData.amount || !expenseData.description) return;
    update((current) => ({ ...current, cashTransactions: [{
      id: uid(), type: "expense", method: expenseData.method, amount: expenseData.amount, direction: "out",
      description: expenseData.description, treasuryId: expenseData.treasuryId, createdAt: new Date().toISOString()
    }, ...current.cashTransactions] }));
    setExpense(false);
    setExpenseData({ amount: 0, description: "", method: "cash", treasuryId: purchasesTreasuryId(state) });
    notify("تم تسجيل المصروف");
  };
  const openTreasuryTransfer = () => {
    const fromTreasuryId = selectedTreasuryId !== "all" && activeTreasuries.some((treasury) => treasury.id === selectedTreasuryId)
      ? selectedTreasuryId
      : currentSalesTreasuryId;
    const toTreasuryId = activeTreasuries.find((treasury) => treasury.id !== fromTreasuryId)?.id ?? "";
    setTreasuryTransfer({ fromTreasuryId, toTreasuryId, amount: 0, method: "cash", note: "" });
    setTreasuryTransferOpen(true);
  };
  const submitTreasuryTransfer = () => {
    const { fromTreasuryId, toTreasuryId, amount, method, note } = treasuryTransfer;
    if (!fromTreasuryId || !toTreasuryId || fromTreasuryId === toTreasuryId) {
      notify("اختر خزنتين مختلفتين لإتمام التحويل");
      return;
    }
    if (!amount || amount <= 0) {
      notify("أدخل قيمة تحويل صحيحة");
      return;
    }
    const fromName = treasuryName(state, fromTreasuryId);
    const toName = treasuryName(state, toTreasuryId);
    const createdAt = new Date().toISOString();
    const transferId = uid();
    update((current) => ({
      ...current,
      cashTransactions: [{
        id: `${transferId}-out`, type: "withdrawal", method, amount, direction: "out",
        description: `تحويل إلى ${toName}${note.trim() ? ` — ${note.trim()}` : ""}`,
        treasuryId: fromTreasuryId, createdAt
      }, {
        id: `${transferId}-in`, type: "deposit", method, amount, direction: "in",
        description: `تحويل من ${fromName}${note.trim() ? ` — ${note.trim()}` : ""}`,
        treasuryId: toTreasuryId, createdAt
      }, ...current.cashTransactions]
    }));
    setTreasuryTransferOpen(false);
    notify(`تم تحويل ${money(amount)} من ${fromName} إلى ${toName}`);
  };
  const preferredTreasuryId = () => selectedTreasuryId !== "all"
    && state.treasuries.some((treasury) => treasury.id === selectedTreasuryId)
    ? selectedTreasuryId
    : currentPurchasesTreasuryId;
  const openTreasuryDeposit = () => {
    setTreasuryDeposit({ treasuryId: preferredTreasuryId(), amount: 0, method: "cash", note: "" });
    setTreasuryDepositOpen(true);
  };
  const submitTreasuryDeposit = () => {
    const { treasuryId, amount, method, note } = treasuryDeposit;
    if (!treasuryId || !amount || amount <= 0) {
      notify("اختر الخزنة وأدخل قيمة صحيحة");
      return;
    }
    const targetName = treasuryName(state, treasuryId);
    update((current) => ({
      ...current,
      cashTransactions: [{
        id: uid(), type: "deposit", method, amount, direction: "in",
        description: `إضافة رصيد إلى ${targetName}${note.trim() ? ` — ${note.trim()}` : ""}`,
        treasuryId, createdAt: new Date().toISOString()
      }, ...current.cashTransactions]
    }));
    setTreasuryDepositOpen(false);
    notify(`تمت إضافة ${money(amount)} إلى ${targetName}`);
  };
  const openTreasuryReport = () => {
    setReportTreasuryId(preferredTreasuryId());
    setTreasuryReportOpen(true);
  };
  const cashHeroAmount = cashTab === "daily"
    ? dailyRevenue
    : cashTab === "treasury" ? selectedTreasuryClosingBalance : totalBalance;
  const cashHeroTitle = cashTab === "treasury"
    ? `أرصدة ${selectedTreasuryLabel}`
    : cashTab === "daily" ? `إيراد ${cashDateLabel}`
      : activeShift ? "الوردية مفتوحة وتعمل الآن" : viewedShift ? "ملخص آخر وردية" : "ابدأ أول وردية";
  const cashHeroStats = cashTab === "treasury"
    ? [
      { label: "الخزن المسجلة", value: `${state.treasuries.length}` },
      { label: "إجمالي الوارد", value: money(cashSummary.incoming + instapaySummary.incoming + vodafoneSummary.incoming) },
      { label: "إجمالي الصادر", value: money(cashSummary.outgoing + instapaySummary.outgoing + vodafoneSummary.outgoing) }
    ]
    : cashTab === "daily" ? [
      { label: "عدد الطلبات", value: `${dailyOrderCount}` },
      { label: "عدد الورديات", value: `${selectedShifts.length}` },
      { label: "صافي الإيراد", value: money(dailyNet) }
    ] : [
      { label: "رصيد البداية", value: money(displayedOpeningBalance) },
      { label: "حركات الوردية", value: `${shiftTransactions.length}` },
      activeShift
        ? { label: "وقت فتح الوردية", value: new Date(activeShift.openedAt).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" }) }
        : { label: "فرق الجرد", value: money(viewedShift?.difference ?? 0) }
  ];
  return (
    <div className="cash-page">
      {cashTab !== "shift" && <section className="cash-treasury-toolbar">
        <div className="cash-treasury-toolbar-filters">
          <div className="orders-date-filter-wrap cash-treasury-filter-wrap">
            <button className={`orders-date-filter-button cash-treasury-filter-button ${selectedTreasuryId !== "all" ? "active" : ""}`} onClick={toggleTreasuryFilter}>
              <WalletCards />
              <span>
                <small className="filter-button-subtitle">الخزنة</small>
                <strong>{selectedTreasuryLabel}</strong>
              </span>
              <b className="treasury-filter-balance">{money(selectedTreasuryClosingBalance)}</b>
              <ChevronDown className={treasuryFilterOpen ? "open" : ""} />
            </button>
            {treasuryFilterOpen && <div className="orders-date-popover cash-treasury-popover">
              <div className="treasury-popover-header">
                <strong>اختيار الخزنة</strong>
                <span>{activeTreasuries.length} خزن نشطة</span>
              </div>
              <div className="treasury-popover-list">
                <button
                  className={`treasury-popover-item ${selectedTreasuryId === "all" ? "active" : ""}`}
                  onClick={() => { setSelectedTreasuryId("all"); setTreasuryFilterOpen(false); }}
                >
                  <div className="treasury-item-info">
                    <strong>كل الخزن</strong>
                    <small>{state.treasuries.length} خزنة مسجلة</small>
                  </div>
                  <b className="treasury-item-balance">{money(allTreasuriesPeriodBalance)}</b>
                </button>
                {activeTreasuries.map((treasury) => {
                  const balance = periodTreasuryBalance(treasury.id);
                  return (
                    <button
                      className={`treasury-popover-item ${selectedTreasuryId === treasury.id ? "active" : ""}`}
                      key={treasury.id}
                      onClick={() => { setSelectedTreasuryId(treasury.id); setTreasuryFilterOpen(false); }}
                    >
                      <div className="treasury-item-info">
                        <strong>{treasury.name}</strong>
                        <small>
                          {treasury.id === currentSalesTreasuryId && <i className="badge-sales">مبيعات</i>}
                          {treasury.id === currentPurchasesTreasuryId && <i className="badge-purchases">مشتريات</i>}
                          {treasury.id !== currentSalesTreasuryId && treasury.id !== currentPurchasesTreasuryId && <span>إضافية</span>}
                        </small>
                      </div>
                      <b className={`treasury-item-balance ${balance < 0 ? "negative" : ""}`}>{money(balance)}</b>
                    </button>
                  );
                })}
              </div>
            </div>}
          </div>
          <div className="orders-date-filter-wrap cash-date-range-wrap">
            <button className={`orders-date-filter-button ${cashDatePreset !== "all" ? "active" : ""}`} onClick={toggleCashDateFilter}>
              <CalendarRange />
              <span><strong>{cashDateLabel}</strong></span>
              <ChevronDown className={cashDateFilterOpen ? "open" : ""} />
            </button>
            {cashDateFilterOpen && <div className="orders-date-popover cash-date-popover">
              <div className="orders-date-quick">
                {([[
                  "today", "اليوم"
                ], [
                  "yesterday", "أمس"
                ], [
                  "last7", "آخر 7 أيام"
                ], [
                  "month", "هذا الشهر"
                ]] as const).map(([id, label]) => (
                  <button className={draftCashDatePreset === id ? "active" : ""} key={id} onClick={() => selectCashDatePreset(id)}>{label}</button>
                ))}
              </div>
              <div className="orders-date-divider" />
              <strong className="orders-custom-date-title">تاريخ مخصص:</strong>
              <div className="orders-custom-date">
                <label><span>من:</span><input type="date" value={draftCashDateFrom} onChange={(event) => {
                  const value = event.target.value;
                  setDraftCashDatePreset("custom");
                  setDraftCashDateFrom(value);
                  if (value && draftCashDateTo && value > draftCashDateTo) setDraftCashDateTo(value);
                }} /></label>
                <label><span>إلى:</span><input type="date" value={draftCashDateTo} onChange={(event) => {
                  const value = event.target.value;
                  setDraftCashDatePreset("custom");
                  setDraftCashDateTo(value);
                  if (value && draftCashDateFrom && value < draftCashDateFrom) setDraftCashDateFrom(value);
                }} /></label>
              </div>
              <div className="orders-date-actions">
                <button className="apply" onClick={applyCashDateFilter}>تطبيق</button>
                <button className="clear" onClick={clearCashDateFilter}>مسح</button>
              </div>
            </div>}
          </div>
        </div>
        <div className="cash-treasury-toolbar-actions">
          <button className="treasury-manage-button" onClick={openTreasuryManager}><Edit3 /> إدارة الخزن</button>
        </div>
      </section>}
      <div className={`cash-hero ${cashTab}`}>
        <div className="cash-hero-summary">
          <div className="cash-hero-heading">
            <span className="cash-hero-icon">{cashTab === "treasury" ? <WalletCards /> : cashTab === "daily" ? <BarChart3 /> : <Clock3 />}</span>
            <span className="cash-hero-title"><strong>{cashHeroTitle}</strong></span>
            {cashTab === "shift" && <b className={`cash-hero-status ${activeShift ? "open" : "closed"}`}>{activeShift ? "مفتوحة" : "مغلقة"}</b>}
          </div>
          <div className="cash-hero-amount">
            <div className="cash-hero-balance"><strong>{money(cashHeroAmount)}</strong><span>ج.م</span></div>
          </div>
          <div className="cash-hero-stats">{cashHeroStats.map((stat) => <span key={stat.label}><small>{stat.label}</small><b>{stat.value}</b></span>)}</div>
          {cashTab === "daily" && revenueChangePercent !== null && <span className={`revenue-change ${revenueChangePercent >= 0 ? "up" : "down"}`}>{revenueChangePercent >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {revenueChangePercent >= 0 ? "+" : ""}{revenueChangePercent.toFixed(1)}% مقارنة بأمس ({money(yesterdayRevenue)})</span>}
        </div>
        <div className="cash-hero-actions">
          {cashTab === "treasury" && <button className="light-button treasury-balance-button" onClick={openTreasuryDeposit}><Plus /> إضافة رصيد</button>}
          {cashTab === "treasury" && <button className="light-button" onClick={openTreasuryReport}><ReceiptText /> تقرير الخزنة</button>}
          {cashTab === "treasury" && activeTreasuries.length > 1 && <button className="light-button" onClick={openTreasuryTransfer}><ArrowLeftRight /> تحويل بين الخزن</button>}
          {cashTab !== "daily" && <button className="light-button" onClick={() => {
            setExpenseData((current) => ({ ...current, treasuryId: purchasesTreasuryId(state) }));
            setExpense(true);
          }}><Minus /> تسجيل مصروف</button>}
          {cashTab === "shift" && (activeShift
            ? <button className="light-button close-shift-button" onClick={() => { setClosingData({ actualCash: 0, note: "" }); setClosingShift(true); }}><X /> إغلاق الوردية</button>
            : <button className="light-button open-shift-button" onClick={() => setOpeningShift(true)}><Plus /> فتح وردية</button>)}
        </div>
      </div>
      {cashTab === "shift" && !viewedShift && <div className="shift-empty-state"><Clock3 /><div><strong>لم تبدأ أي وردية بعد</strong><small>افتح أول وردية وحدد الرصيد النقدي الموجود في الدرج.</small></div><button className="primary-button compact" onClick={() => setOpeningShift(true)}><Plus /> فتح وردية</button></div>}
      {cashTab !== "daily" && <><div className="cash-method-cards">
        <CashMethodCard icon={<Banknote />} label="الخزنة النقدية" summary={cashSummary} tone="cash" />
        <CashMethodCard icon={<CreditCard />} label="إنستاباي" summary={instapaySummary} tone="instapay" />
        <CashMethodCard icon={<Phone />} label="فودافون كاش" summary={vodafoneSummary} tone="vodafone" />
      </div>
      <div className="panel cash-transactions-panel">
        <div className="panel-title cash-transactions-title">
          <div><WalletCards /><span><strong>{cashTab === "shift" ? "حركات الوردية" : `سجل حركات ${cashDateLabel}`}</strong></span></div>
          <div className="cash-transactions-filters">
            <div className="orders-date-filter-wrap transaction-direction-filter-wrap">
              <button
                className={`orders-date-filter-button transaction-direction-filter-button ${transactionDirectionFilter !== "all" ? "active" : ""}`}
                onClick={toggleDirectionFilter}
              >
                <strong>{transactionDirectionFilter === "all" ? "كل الحركات" : transactionDirectionFilter === "in" ? "الوارد فقط (+)" : "المنصرف فقط (-)"}</strong>
                <ChevronDown className={directionFilterOpen ? "open" : ""} />
              </button>
              {directionFilterOpen && (
                <div className="orders-date-popover transaction-direction-popover">
                  <div className="treasury-popover-list">
                    <button
                      className={`treasury-popover-item ${transactionDirectionFilter === "all" ? "active" : ""}`}
                      onClick={() => { setTransactionDirectionFilter("all"); setDirectionFilterOpen(false); }}
                    >
                      <strong>كل الحركات</strong>
                    </button>
                    <button
                      className={`treasury-popover-item ${transactionDirectionFilter === "in" ? "active" : ""}`}
                      onClick={() => { setTransactionDirectionFilter("in"); setDirectionFilterOpen(false); }}
                    >
                      <strong>الوارد فقط</strong>
                    </button>
                    <button
                      className={`treasury-popover-item ${transactionDirectionFilter === "out" ? "active" : ""}`}
                      onClick={() => { setTransactionDirectionFilter("out"); setDirectionFilterOpen(false); }}
                    >
                      <strong>المنصرف فقط</strong>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="transaction-method-filter">
              <button className={transactionMethodFilter === "all" ? "active" : ""} onClick={() => setTransactionMethodFilter("all")}>الكل</button>
              <button className={transactionMethodFilter === "cash" ? "active" : ""} onClick={() => setTransactionMethodFilter("cash")}><Banknote /> نقدي</button>
              <button className={transactionMethodFilter === "instapay" ? "active" : ""} onClick={() => setTransactionMethodFilter("instapay")}><CreditCard /> إنستاباي</button>
              <button className={transactionMethodFilter === "vodafone" ? "active" : ""} onClick={() => setTransactionMethodFilter("vodafone")}><Phone /> فودافون كاش</button>
            </div>
          </div>
          <b>{filteredTransactions.length}{transactionMethodFilter !== "all" || transactionDirectionFilter !== "all" ? ` من ${displayedTransactions.length}` : ""} حركة</b>
        </div>
        <div className="cash-transactions-scroll">
          {!!filteredTransactions.length && <div className="cash-transactions-head"><span>الوقت</span><span>البيان ورقم الطلب</span><span>الخزنة</span><span>النوع</span><span>الوسيلة</span><span>الاتجاه</span><span>المبلغ</span><span>الرصيد بعد الحركة</span></div>}
          <div className="cash-transactions-table">
          {filteredTransactions.map((transaction) => {
            const transactionOrderNumbers = orderNumbersForTransaction(transaction);
            return <div className="cash-transaction-row" key={transaction.id}>
              <span className="cash-transaction-date">{shortDate(transaction.createdAt)}</span>
              <span className="cash-transaction-description"><strong>{transaction.description}</strong>{transactionOrderNumbers.length > 0 && <small className="cash-transaction-order-number">{transactionOrderNumbers.length === 1 ? "رقم الطلب" : "أرقام الطلبات"} {transactionOrderNumbers.map((number) => `#${number}`).join("، ")}</small>}</span>
              <span className="cash-transaction-treasury"><WalletCards /><b>{treasuryName(state, transactionTreasuryId(state, transaction))}</b></span>
              <span><b className="transaction-type">{transactionTypeLabels[transaction.type]}</b></span>
              <span><b className={`transaction-method ${transaction.method}`}>{transaction.method === "cash" ? <Banknote /> : transaction.method === "instapay" ? <CreditCard /> : <Phone />}{paymentLabels[transaction.method as PaymentMethod] ?? "نقدي"}</b></span>
              <span><b className={`transaction-direction ${transaction.direction}`}>{transaction.direction === "in" ? "وارد" : "صادر"}</b></span>
              <b className={`transaction-amount ${transaction.direction}`}>{transaction.direction === "in" ? "+" : "-"} {money(transaction.amount)}</b>
              <b className="transaction-balance">{money(balanceAfter.get(transaction.id) ?? 0)}</b>
            </div>;
          })}
          {!filteredTransactions.length && <Empty icon={<WalletCards />} title={transactionMethodFilter !== "all" || transactionDirectionFilter !== "all" ? "لا توجد حركات تطابق الفلاتر المحددة" : cashTab === "shift" ? "لا توجد حركات في الوردية" : "لا توجد حركات في هذه الفترة"} text={transactionMethodFilter !== "all" || transactionDirectionFilter !== "all" ? "اختر طريقة دفع أخرى أو اتجاه آخر لعرض الحركات" : cashTab === "shift" ? "الحركات الجديدة ستظهر هنا بعد بدء البيع أو تسجيل مصروف" : "غيّر الفترة أو ابدأ تسجيل حركات جديدة"} />}
          </div>
        </div>
      </div></>}
      {cashTab === "daily" && <DailyRevenueView
        date={cashDateLabel}
        revenue={dailyRevenue}
        sales={dailySalesRevenue}
        collections={dailyCollections}
        editDeposits={dailyEditDeposits}
        editWithdrawals={dailyEditWithdrawalsTotal}
        expenses={dailyOperationalExpenses}
        net={dailyNet}
        methods={{
          cash: dailyMethodRevenue("cash"),
          instapay: dailyMethodRevenue("instapay"),
          vodafone: dailyMethodRevenue("vodafone")
        }}
        shifts={dailyShiftRows}
        transactions={dailyRevenueTransactions}
        withdrawalTransactions={dailyEditWithdrawals}
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
      {treasuryManagerOpen && <Modal title="إدارة الخزن المتعددة" onClose={() => setTreasuryManagerOpen(false)} size="wide">
        <div className="treasury-manager">
          <div className="treasury-defaults">
            <div><WalletCards /><span><strong>توجيه الحركات تلقائيًا</strong><small>حدد الخزنة التي تستقبل المبيعات والخزنة التي تُخصم منها المشتريات والمصروفات.</small></span></div>
            <label><span>خزنة المبيعات والتحصيلات</span><select value={currentSalesTreasuryId} onChange={(event) => setDefaultSalesTreasury(event.target.value)}>{activeTreasuries.map((treasury) => <option value={treasury.id} key={treasury.id}>{treasury.name}</option>)}</select></label>
            <label><span>خزنة المشتريات والمصروفات</span><select value={currentPurchasesTreasuryId} onChange={(event) => setDefaultPurchasesTreasury(event.target.value)}>{activeTreasuries.map((treasury) => <option value={treasury.id} key={treasury.id}>{treasury.name}</option>)}</select></label>
          </div>
          <div className="treasury-create-row">
            <label><span>اسم الخزنة الجديدة</span><input autoFocus value={newTreasuryName} onChange={(event) => setNewTreasuryName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTreasury(); }} placeholder="مثال: خزنة الفرع أو خزنة المصروفات" /></label>
            <button className="primary-button compact" onClick={addTreasury}><Plus /> إضافة خزنة</button>
          </div>
          <div className="treasury-manager-list">
            {state.treasuries.map((treasury) => {
              const isDefault = treasury.id === currentSalesTreasuryId || treasury.id === currentPurchasesTreasuryId;
              return <article className={treasury.active ? "" : "inactive"} key={treasury.id}>
                <span className="treasury-manager-icon"><WalletCards /></span>
                <label><span>اسم الخزنة</span><input disabled={!treasury.active} value={treasuryNameDrafts[treasury.id] ?? treasury.name} onChange={(event) => setTreasuryNameDrafts((current) => ({ ...current, [treasury.id]: event.target.value }))} /></label>
                <div className="treasury-manager-role">
                  {treasury.id === currentSalesTreasuryId && <b className="sales">افتراضية للمبيعات</b>}
                  {treasury.id === currentPurchasesTreasuryId && <b className="purchases">افتراضية للمشتريات</b>}
                  {!isDefault && treasury.active && <small>خزنة إضافية</small>}
                  {!treasury.active && <b>معطلة</b>}
                </div>
                <strong className="treasury-manager-balance">{money(periodTreasuryBalance(treasury.id))}<small>الرصيد حتى {cashDateLabel}</small></strong>
                <div className="treasury-manager-actions">
                  {treasury.active && <button title="حفظ الاسم" onClick={() => saveTreasuryName(treasury.id)}><Save /></button>}
                  {treasury.active && !isDefault && <button className="danger" title="تعطيل الخزنة" onClick={() => deactivateTreasury(treasury.id)}><Trash2 /></button>}
                  {!treasury.active && <button title="إعادة تفعيل الخزنة" onClick={() => reactivateTreasury(treasury.id)}><Check /></button>}
                </div>
              </article>;
            })}
          </div>
          <div className="treasury-manager-note"><Info /> تغيير الخزنة الافتراضية يؤثر على الحركات الجديدة فقط، وتظل كل الحركات القديمة مرتبطة بخزنها الأصلية.</div>
        </div>
      </Modal>}
      {expense && <Modal title="تسجيل مصروف" onClose={() => setExpense(false)}><div className="form-stack cash-expense-form">
        <fieldset className="settlement-payment-methods"><legend>الدفع من</legend>
          <button type="button" className={expenseData.method === "cash" ? "active" : ""} onClick={() => setExpenseData({ ...expenseData, method: "cash" })}><Banknote /><span><strong>نقدي</strong></span><i>{expenseData.method === "cash" && <Check />}</i></button>
          <button type="button" className={expenseData.method === "instapay" ? "active" : ""} onClick={() => setExpenseData({ ...expenseData, method: "instapay" })}><CreditCard /><span><strong>إنستاباي</strong></span><i>{expenseData.method === "instapay" && <Check />}</i></button>
          <button type="button" className={expenseData.method === "vodafone" ? "active" : ""} onClick={() => setExpenseData({ ...expenseData, method: "vodafone" })}><Phone /><span><strong>فودافون كاش</strong></span><i>{expenseData.method === "vodafone" && <Check />}</i></button>
        </fieldset>
        <label>الصرف من الخزنة<select value={expenseData.treasuryId} onChange={(event) => setExpenseData({ ...expenseData, treasuryId: event.target.value })}>{activeTreasuries.map((treasury) => <option value={treasury.id} key={treasury.id}>{treasury.name}</option>)}</select></label>
        <label>قيمة المصروف<input type="number" min="0" value={expenseData.amount || ""} onChange={(e) => setExpenseData({ ...expenseData, amount: Number(e.target.value) })} /></label>
        <label>سبب المصروف<input autoFocus value={expenseData.description} onChange={(e) => setExpenseData({ ...expenseData, description: e.target.value })} placeholder="مثال: شراء تغليف" /></label>
        <button className="primary-button" onClick={addExpense}>تسجيل المصروف</button>
      </div></Modal>}
      {treasuryDepositOpen && <Modal title="إضافة رصيد إلى خزنة" onClose={() => setTreasuryDepositOpen(false)}><div className="treasury-deposit-form">
        <div className="treasury-deposit-hero"><span><Plus /></span><div><strong>تسجيل أموال جديدة بالخزنة</strong><small>استخدمها لتسجيل رأس مال، عهدة أو أي مبلغ تمت إضافته فعليًا.</small></div></div>
        <label>الخزنة<select value={treasuryDeposit.treasuryId} onChange={(event) => setTreasuryDeposit({ ...treasuryDeposit, treasuryId: event.target.value })}>{activeTreasuries.map((treasury) => <option value={treasury.id} key={treasury.id}>{treasury.name}</option>)}</select></label>
        <fieldset className="settlement-payment-methods"><legend>وسيلة إضافة الرصيد</legend>
          <button type="button" className={treasuryDeposit.method === "cash" ? "active" : ""} onClick={() => setTreasuryDeposit({ ...treasuryDeposit, method: "cash" })}><Banknote /><span><strong>نقدي</strong></span><i>{treasuryDeposit.method === "cash" && <Check />}</i></button>
          <button type="button" className={treasuryDeposit.method === "instapay" ? "active" : ""} onClick={() => setTreasuryDeposit({ ...treasuryDeposit, method: "instapay" })}><CreditCard /><span><strong>إنستاباي</strong></span><i>{treasuryDeposit.method === "instapay" && <Check />}</i></button>
          <button type="button" className={treasuryDeposit.method === "vodafone" ? "active" : ""} onClick={() => setTreasuryDeposit({ ...treasuryDeposit, method: "vodafone" })}><Phone /><span><strong>فودافون كاش</strong></span><i>{treasuryDeposit.method === "vodafone" && <Check />}</i></button>
        </fieldset>
        <label>المبلغ المضاف<input autoFocus type="number" min="0" value={treasuryDeposit.amount || ""} onChange={(event) => setTreasuryDeposit({ ...treasuryDeposit, amount: Number(event.target.value) })} placeholder="مثال: 5000" /></label>
        <label>سبب الإضافة أو المرجع<input value={treasuryDeposit.note} onChange={(event) => setTreasuryDeposit({ ...treasuryDeposit, note: event.target.value })} placeholder="مثال: رصيد افتتاحي لخزنة المشتريات" /></label>
        <div className="treasury-transfer-note"><Info /> ستظهر الإضافة كحركة إيداع في تقرير الخزنة، ويمكن متابعة ما صُرف منها والرصيد المتبقي.</div>
        <button className="primary-button" onClick={submitTreasuryDeposit}><Plus /> إضافة الرصيد الآن</button>
      </div></Modal>}
      {treasuryReportOpen && <Modal title={`تقرير ${reportTreasury?.name ?? "الخزنة"}`} onClose={() => setTreasuryReportOpen(false)} size="wide"><div className="treasury-report">
        <div className="treasury-report-toolbar">
          <div><ReceiptText /><span><strong>كشف حركة الخزنة</strong><small>{cashDateLabel} · يعرض الرصيد والحركات المسجلة بالتفصيل</small></span></div>
          <label><span>الخزنة</span><select value={resolvedReportTreasuryId} onChange={(event) => setReportTreasuryId(event.target.value)}>{state.treasuries.map((treasury) => <option value={treasury.id} key={treasury.id}>{treasury.name}{treasury.active ? "" : " (معطلة)"}</option>)}</select></label>
        </div>
        <div className="treasury-report-summary">
          <article><small>الرصيد قبل الفترة</small><strong>{money(reportOpeningBalance)}</strong><span>الموجود قبل {cashDateLabel}</span></article>
          <article className="incoming"><small>إجمالي الأموال المضافة</small><strong>+ {money(reportIncoming)}</strong><span>{reportPeriodTransactions.filter((transaction) => transaction.direction === "in").length} حركة واردة</span></article>
          <article className="outgoing"><small>إجمالي المنصرف</small><strong>- {money(reportOutgoing)}</strong><span>{reportPeriodTransactions.filter((transaction) => transaction.direction === "out").length} حركة صادرة</span></article>
          <article className="closing"><small>الرصيد المتبقي</small><strong>{money(reportClosingBalance)}</strong><span>حتى نهاية {cashDateLabel}</span></article>
        </div>
        <div className="treasury-report-breakdown">
          <span><small>إضافات وتحويلات واردة</small><b>{money(reportDeposits)}</b></span>
          <span><small>مبيعات وتحصيلات</small><b>{money(reportSalesAndCollections)}</b></span>
          <span><small>مشتريات ومصروفات</small><b className="out">{money(reportExpenses)}</b></span>
          <span><small>مسحوبات وتحويلات صادرة</small><b className="out">{money(reportWithdrawals)}</b></span>
        </div>
        <div className="treasury-report-methods">
          <span><Banknote /><small>نقدي</small><b>{money(reportMethodBalance("cash"))}</b></span>
          <span><CreditCard /><small>إنستاباي</small><b>{money(reportMethodBalance("instapay"))}</b></span>
          <span><Phone /><small>فودافون كاش</small><b>{money(reportMethodBalance("vodafone"))}</b></span>
        </div>
        <div className="treasury-report-ledger">
          <div className="treasury-report-head"><span>التاريخ</span><span>البيان</span><span>النوع</span><span>الوسيلة</span><span>وارد</span><span>صادر</span><span>الرصيد</span></div>
          <div className="treasury-report-rows">
            {reportRows.map(({ transaction, balance }) => <div className="treasury-report-row" key={transaction.id}>
              <span>{shortDate(transaction.createdAt)}</span>
              <span><strong>{transaction.description}</strong><small>{transaction.orderId && orderNumberById.has(transaction.orderId) ? `طلب #${orderNumberById.get(transaction.orderId)}` : "حركة خزنة"}</small></span>
              <b>{transactionTypeLabels[transaction.type]}</b>
              <b>{paymentLabels[transaction.method as PaymentMethod] ?? "نقدي"}</b>
              <strong className="in">{transaction.direction === "in" ? money(transaction.amount) : "—"}</strong>
              <strong className="out">{transaction.direction === "out" ? money(transaction.amount) : "—"}</strong>
              <strong className={balance < 0 ? "negative" : ""}>{money(balance)}</strong>
            </div>)}
            {!reportRows.length && <Empty icon={<ReceiptText />} title="لا توجد حركات في هذه الفترة" text="غيّر فترة التقرير أو أضف رصيدًا للخزنة لتظهر الحركة هنا." />}
          </div>
        </div>
      </div></Modal>}
      {treasuryTransferOpen && <Modal title="تحويل بين الخزن" onClose={() => setTreasuryTransferOpen(false)}><div className="treasury-transfer-form">
        <div className="treasury-transfer-route">
          <label><span>من خزنة</span><select value={treasuryTransfer.fromTreasuryId} onChange={(event) => {
            const fromTreasuryId = event.target.value;
            const toTreasuryId = treasuryTransfer.toTreasuryId === fromTreasuryId
              ? activeTreasuries.find((treasury) => treasury.id !== fromTreasuryId)?.id ?? ""
              : treasuryTransfer.toTreasuryId;
            setTreasuryTransfer({ ...treasuryTransfer, fromTreasuryId, toTreasuryId });
          }}>{activeTreasuries.map((treasury) => <option value={treasury.id} key={treasury.id}>{treasury.name}</option>)}</select></label>
          <ArrowLeftRight />
          <label><span>إلى خزنة</span><select value={treasuryTransfer.toTreasuryId} onChange={(event) => setTreasuryTransfer({ ...treasuryTransfer, toTreasuryId: event.target.value })}>{activeTreasuries.filter((treasury) => treasury.id !== treasuryTransfer.fromTreasuryId).map((treasury) => <option value={treasury.id} key={treasury.id}>{treasury.name}</option>)}</select></label>
        </div>
        <fieldset className="settlement-payment-methods"><legend>وسيلة التحويل</legend>
          <button type="button" className={treasuryTransfer.method === "cash" ? "active" : ""} onClick={() => setTreasuryTransfer({ ...treasuryTransfer, method: "cash" })}><Banknote /><span><strong>نقدي</strong></span><i>{treasuryTransfer.method === "cash" && <Check />}</i></button>
          <button type="button" className={treasuryTransfer.method === "instapay" ? "active" : ""} onClick={() => setTreasuryTransfer({ ...treasuryTransfer, method: "instapay" })}><CreditCard /><span><strong>إنستاباي</strong></span><i>{treasuryTransfer.method === "instapay" && <Check />}</i></button>
          <button type="button" className={treasuryTransfer.method === "vodafone" ? "active" : ""} onClick={() => setTreasuryTransfer({ ...treasuryTransfer, method: "vodafone" })}><Phone /><span><strong>فودافون كاش</strong></span><i>{treasuryTransfer.method === "vodafone" && <Check />}</i></button>
        </fieldset>
        <label>قيمة التحويل<input autoFocus type="number" min="0" value={treasuryTransfer.amount || ""} onChange={(event) => setTreasuryTransfer({ ...treasuryTransfer, amount: Number(event.target.value) })} /></label>
        <label>ملاحظة اختيارية<input value={treasuryTransfer.note} onChange={(event) => setTreasuryTransfer({ ...treasuryTransfer, note: event.target.value })} placeholder="مثال: تمويل مشتريات اليوم" /></label>
        <div className="treasury-transfer-note"><Info /> يُسجل النظام حركة سحب من الخزنة الأولى وإيداعًا مساويًا في الخزنة الثانية، لذلك يظل إجمالي أموال المنشأة ثابتًا.</div>
        <button className="primary-button" onClick={submitTreasuryTransfer}><ArrowLeftRight /> تأكيد التحويل</button>
      </div></Modal>}
      {openingShift && <Modal title="فتح وردية جديدة" onClose={() => setOpeningShift(false)}><div className="shift-operation-modal">
        <div className="shift-operation-hero open"><span><Plus /></span><div><strong>بدء يوم عمل جديد</strong><small>سجّل المبلغ النقدي الموجود فعليًا في درج الكاشير قبل أول عملية بيع.</small></div></div>
        <label>رصيد بداية الوردية<input autoFocus type="number" min="0" value={openingAmount || ""} onChange={(event) => setOpeningAmount(Number(event.target.value))} /></label>
        <div className="shift-operation-note"><Info /> إنستاباي وفودافون كاش يبدأ رصيدهما اليومي من صفر، والرصيد الافتتاحي يخص النقدي فقط.</div>
        <button className="primary-button" onClick={openShift}><Plus /> فتح الوردية الآن</button>
      </div></Modal>}
      {closingShift && activeShift && <Modal title="إغلاق الوردية" onClose={() => setClosingShift(false)}><div className="shift-operation-modal">
        <div className="shift-operation-hero close"><span><WalletCards /></span><div><strong>جرد وإغلاق الوردية</strong><small>عدّ النقدي الموجود فعليًا في الدرج ثم أدخل قيمته للمقارنة مع رصيد النظام.</small></div></div>
        <div className="shift-closing-summary"><span><small>رصيد بداية الوردية</small><b>{money(activeShift.openingBalance)}</b></span></div>
        <label>النقدي الفعلي في الدرج<input autoFocus type="number" min="0" value={closingData.actualCash || ""} onChange={(event) => setClosingData({ ...closingData, actualCash: Number(event.target.value) })} /></label>
        <div className={`shift-difference ${closingData.actualCash - expectedClosingCash === 0 ? "matched" : ""}`}><span>فرق الجرد</span><strong>{money(closingData.actualCash - expectedClosingCash)}</strong></div>
        <label>ملاحظات الإغلاق<textarea value={closingData.note} onChange={(event) => setClosingData({ ...closingData, note: event.target.value })} placeholder="سبب العجز أو الزيادة إن وجد" /></label>
        <button className="primary-button close-shift-confirm" onClick={closeShift}><Check /> اعتماد وإغلاق الوردية</button>
      </div></Modal>}
    </div>
  );
}

function CashMethodCard({ icon, label, summary, tone }: {
  icon: ReactNode;
  label: string;
  summary: { incoming: number; outgoing: number; count: number; balance: number };
  tone: "cash" | "instapay" | "vodafone";
}) {
  return <article className={`cash-method-card ${tone}`}>
    <header><span>{icon}</span><div><strong>{label}</strong></div></header>
    <div className="cash-method-balance"><strong>{money(summary.balance)}</strong></div>
    <footer><span><small>وارد</small><b>+ {money(summary.incoming)}</b></span><span><small>صادر</small><b>- {money(summary.outgoing)}</b></span><span><small>الحركات</small><b>{summary.count}</b></span></footer>
  </article>;
}

function DailyRevenueView({ date, revenue, sales, collections, editDeposits, editWithdrawals, expenses, net, methods, shifts, transactions, withdrawalTransactions, methodFilter, onMethodFilter, orderNumberById, transactionTypeLabels, orderCount, avgOrder, pending, discounts, deliveryFees, revenueChange }: {
  date: string;
  revenue: number;
  sales: number;
  collections: number;
  editDeposits: number;
  editWithdrawals: number;
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
  withdrawalTransactions: CashTransaction[];
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
  const filteredIn = methodFilter === "all" ? transactions : transactions.filter((transaction) => transaction.method === methodFilter);
  const filteredOut = methodFilter === "all" ? withdrawalTransactions : withdrawalTransactions.filter((transaction) => transaction.method === methodFilter);
  const allFiltered: Array<CashTransaction & { _isWithdrawal?: boolean }> = [
    ...filteredIn.map((t) => ({ ...t, _isWithdrawal: false as const })),
    ...filteredOut.map((t) => ({ ...t, _isWithdrawal: true as const }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
    {(editDeposits > 0 || editWithdrawals > 0) && <div className="daily-info-strip">
      {editDeposits > 0 && <span><Edit3 size={15} /><small>تعديلات واردة</small><b>+ {money(editDeposits)}</b></span>}
      {editWithdrawals > 0 && <span><Edit3 size={15} /><small>عكس تعديلات</small><b>- {money(editWithdrawals)}</b></span>}
    </div>}
    <div className="daily-revenue-kpis">
      <MiniStat icon={<BarChart3 />} label="صافي الفترة" value={money(net)} tone={net >= 0 ? "green" : "red"} />
      <MiniStat icon={<ClipboardCheck />} label={`الطلبات (${orderCount})`} value={money(avgOrder) + " متوسط"} tone="blue" />
      <MiniStat icon={<Minus />} label="المصروفات التشغيلية" value={money(expenses)} tone="red" />
    </div>
    <div className="daily-info-strip">
      <span><Clock3 size={15} /><small>معلق مع المناديب</small><b>{money(pending)}</b></span>
      {discounts > 0 && <span><Calculator size={15} /><small>خصومات الفترة</small><b>{money(discounts)}</b></span>}
      {deliveryFees > 0 && <span><Truck size={15} /><small>رسوم التوصيل</small><b>{money(deliveryFees)}</b></span>}
      {revenueChange !== null && <span className={`revenue-change-inline ${revenueChange >= 0 ? "up" : "down"}`}>{revenueChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}<small>مقارنة بأمس</small><b>{revenueChange >= 0 ? "+" : ""}{revenueChange.toFixed(1)}%</b></span>}
    </div>

    <section className="daily-method-section">
      <div className="daily-section-heading"><div><CreditCard /><span><strong>الإيراد حسب طريقة الدفع</strong><small>نسبة ومبلغ كل وسيلة من إجمالي إيراد الفترة</small></span></div><span><small>صافي حركة الفترة</small><b>{money(net)}</b></span></div>
      <div className="daily-method-grid">
        <DailyMethodCard icon={<Banknote />} label="نقدي" tone="cash" data={methods.cash} />
        <DailyMethodCard icon={<CreditCard />} label="إنستاباي" tone="instapay" data={methods.instapay} />
        <DailyMethodCard icon={<Phone />} label="فودافون كاش" tone="vodafone" data={methods.vodafone} />
      </div>
    </section>

    <section className="daily-shifts-panel">
      <div className="daily-section-heading"><div><Clock3 /><span><strong>إيراد كل وردية</strong><small>{shifts.length ? `${shifts.length} وردية مسجلة خلال ${date}` : "لا توجد ورديات في الفترة المحددة"}</small></span></div><b>{money(totalShiftRevenue)}</b></div>
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
      {!shifts.length && <Empty icon={<Clock3 />} title="لا توجد ورديات في هذه الفترة" text="اختر فترة أخرى أو افتح وردية جديدة" />}
    </section>

    <section className="panel daily-revenue-transactions">
      <div className="panel-title cash-transactions-title">
        <div><ReceiptText /><span><strong>تفاصيل إيرادات الفترة</strong><small>المبيعات والتحصيلات وتسويات تعديل الفواتير</small></span></div>
        <div className="transaction-method-filter">
          <button className={methodFilter === "all" ? "active" : ""} onClick={() => onMethodFilter("all")}>الكل</button>
          <button className={methodFilter === "cash" ? "active" : ""} onClick={() => onMethodFilter("cash")}><Banknote /> نقدي</button>
          <button className={methodFilter === "instapay" ? "active" : ""} onClick={() => onMethodFilter("instapay")}><CreditCard /> إنستاباي</button>
          <button className={methodFilter === "vodafone" ? "active" : ""} onClick={() => onMethodFilter("vodafone")}><Phone /> فودافون كاش</button>
        </div>
        <b>{allFiltered.length} حركة</b>
      </div>
      <div className="daily-revenue-table-scroll">
        {!!allFiltered.length && <div className="daily-revenue-table-head"><span>الوقت</span><span>الفاتورة / البيان</span><span>الوردية</span><span>النوع</span><span>طريقة الدفع</span><span>المبلغ</span></div>}
        {allFiltered.map((transaction) => {
          const shiftRow = shiftForTransaction(transaction);
          const shiftIndex = shiftRow ? shifts.indexOf(shiftRow) + 1 : 0;
          const orderNum = transaction.orderId ? orderNumberById.get(transaction.orderId) : undefined;
          const isWithdrawal = transaction._isWithdrawal;
          return <div className={`daily-revenue-row${isWithdrawal ? " withdrawal" : ""}`} key={transaction.id}>
            <span>{shortDate(transaction.createdAt)}</span>
            <span>{orderNum !== undefined && <b className="invoice-num">#{orderNum}</b>}<strong>{transaction.description}</strong><small>{transaction.orderId && orderNumberById.has(transaction.orderId) ? `مرجع الطلب #${orderNumberById.get(transaction.orderId)}` : "حركة مسجلة بالنظام"}</small></span>
            <b>{shiftIndex ? `وردية ${shiftIndex}` : "خارج وردية"}</b>
            <span><b className="transaction-type">{transactionTypeLabels[transaction.type]}</b></span>
            <span><b className={`transaction-method ${transaction.method}`}>{transaction.method === "cash" ? <Banknote /> : transaction.method === "instapay" ? <CreditCard /> : <Phone />}{paymentLabels[transaction.method as PaymentMethod]}</b></span>
            <b className={`daily-revenue-amount${isWithdrawal ? " out" : ""}`}>{isWithdrawal ? "-" : "+"} {money(transaction.amount)}</b>
          </div>;
        })}
        {!allFiltered.length && <Empty icon={<ReceiptText />} title="لا توجد إيرادات مطابقة" text="غيّر الفترة أو طريقة الدفع لعرض نتائج أخرى" />}
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

