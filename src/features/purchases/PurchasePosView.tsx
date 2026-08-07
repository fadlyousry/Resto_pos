import { useState } from "react";
import {
  AlertTriangle, Boxes, ChevronLeft,
  FileText, Minus, Plus, Save, Scale, Search,
  Trash2, Truck, UserPlus, X
} from "lucide-react";
import type {
  CashTransaction, Ingredient, PaymentMethod, PaymentStatus,
  PurchaseInvoice, PurchaseInvoiceItem, StockMovement, Supplier
} from "../../domain/types";
import type { ViewProps } from "../../shared/contracts";
import { money } from "../../shared/format";
import { uid } from "../../shared/id";
import { Empty, Modal } from "../../shared/ui";

interface PurchaseCartItem {
  ingredientId: string;
  name: string;
  unit: string;
  unitCost: number;
  quantity: number;
  stockQty: number;
}

export function PurchasePosView({ state, update, notify }: ViewProps) {
  const [scope, setScope] = useState<"all" | "low">("all");
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("الكل");
  const [cart, setCart] = useState<PurchaseCartItem[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  
  // Modals & Pickers
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", notes: "" });
  const [isAddingNewSupplier, setIsAddingNewSupplier] = useState(false);

  // Cart summary options
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [note, setNote] = useState("");

  // Filter ingredients
  const lowStockCount = state.ingredients.filter((i) => i.stockQty <= i.minStock).length;
  const units = ["الكل", ...new Set(state.ingredients.map((i) => i.unit))];

  const ingredients = state.ingredients.filter((item) => {
    if (!item.active) return false;
    if (scope === "low" && item.stockQty > item.minStock) return false;
    if (unitFilter !== "الكل" && item.unit !== unitFilter) return false;
    if (search.trim() && !item.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const subtotal = cart.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
  const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0);
  const grandTotal = Math.max(0, subtotal - discount);

  // Add ingredient to purchase cart
  const addIngredient = (ingredient: Ingredient) => {
    setCart((prev) => {
      const exists = prev.find((item) => item.ingredientId === ingredient.id);
      if (exists) {
        return prev.map((item) =>
          item.ingredientId === ingredient.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          ingredientId: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          unitCost: ingredient.unitCost,
          quantity: 1,
          stockQty: ingredient.stockQty
        }
      ];
    });
  };

  const updateQuantity = (ingredientId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.ingredientId === ingredientId ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const setItemQuantityDirect = (ingredientId: string, qty: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.ingredientId === ingredientId ? { ...item, quantity: Math.max(0, qty) } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const updateItemCost = (ingredientId: string, cost: number) => {
    setCart((prev) =>
      prev.map((item) => (item.ingredientId === ingredientId ? { ...item, unitCost: Math.max(0, cost) } : item))
    );
  };

  const removeCartItem = (ingredientId: string) => {
    setCart((prev) => prev.filter((item) => item.ingredientId !== ingredientId));
  };

  const selectSupplierHandler = (sup: Supplier) => {
    setSupplier(sup);
    setShowSupplierModal(false);
  };

  const registerNewSupplier = () => {
    if (!supplierForm.name.trim()) return;
    const newSup: Supplier = {
      id: uid(),
      name: supplierForm.name.trim(),
      phone: supplierForm.phone.trim(),
      notes: supplierForm.notes.trim() || undefined,
      active: true
    };
    update((current) => ({
      ...current,
      suppliers: [...current.suppliers, newSup]
    }));
    setSupplier(newSup);
    setShowSupplierModal(false);
    setIsAddingNewSupplier(false);
    setSupplierForm({ name: "", phone: "", notes: "" });
    notify(`تم إضافة المورد ${newSup.name} بنجاح`);
  };

  // Submit invoice
  const handleSavePurchaseInvoice = () => {
    if (!cart.length || !supplier) return;

    const createdAt = new Date().toISOString();
    const invoiceNumber = state.nextPurchaseInvoiceNumber;

    const invoiceItems: PurchaseInvoiceItem[] = cart.map((item) => ({
      ingredientId: item.ingredientId,
      ingredientName: item.name,
      quantity: item.quantity,
      unitCost: item.unitCost,
      unit: item.unit,
      total: item.quantity * item.unitCost
    }));

    const invoice: PurchaseInvoice = {
      id: uid(),
      number: invoiceNumber,
      supplierId: supplier.id,
      supplierName: supplier.name,
      items: invoiceItems,
      subtotal,
      discount,
      total: grandTotal,
      paymentMethod,
      paymentStatus,
      note: note.trim() || undefined,
      createdAt
    };

    // Stock movements
    const movements: StockMovement[] = cart.map((item) => ({
      id: uid(),
      ingredientId: item.ingredientId,
      ingredientName: item.name,
      type: "purchase",
      quantity: item.quantity,
      unitCost: item.unitCost,
      description: `فاتورة مشتريات #${invoiceNumber} — ${supplier.name}`,
      createdAt
    }));

    // Cash transaction (expense) if paid
    const cashTx: CashTransaction | null = paymentStatus === "paid" ? {
      id: uid(),
      type: "expense",
      method: paymentMethod === "cash" ? "cash" : paymentMethod,
      amount: grandTotal,
      direction: "out",
      description: `فاتورة مشتريات #${invoiceNumber} — ${supplier.name}`,
      createdAt
    } : null;

    update((current) => {
      // Recalculate ingredient stock and weighted unit cost
      const updatedIngredients = current.ingredients.map((ing) => {
        const itemInCart = cart.find((c) => c.ingredientId === ing.id);
        if (!itemInCart) return ing;
        const newStock = ing.stockQty + itemInCart.quantity;
        const weightedCost = newStock > 0
          ? ((ing.stockQty * ing.unitCost) + (itemInCart.quantity * itemInCart.unitCost)) / newStock
          : itemInCart.unitCost;
        return { ...ing, stockQty: newStock, unitCost: weightedCost };
      });

      return {
        ...current,
        purchaseInvoices: [invoice, ...current.purchaseInvoices],
        ingredients: updatedIngredients,
        stockMovements: [...movements, ...current.stockMovements],
        cashTransactions: cashTx ? [cashTx, ...current.cashTransactions] : current.cashTransactions,
        nextPurchaseInvoiceNumber: current.nextPurchaseInvoiceNumber + 1
      };
    });

    // Reset form
    setCart([]);
    setSupplier(null);
    setDiscount(0);
    setNote("");
    notify(`تم حفظ وتسجيل فاتورة الشراء #${invoiceNumber} بنجاح`);
  };

  const filteredSuppliers = state.suppliers.filter(
    (s) => s.active && (s.name.includes(supplierSearch.trim()) || s.phone.includes(supplierSearch.trim()))
  );

  return (
    <div className="pos-layout">
      {/* ═══════════ LEFT: CATALOG OF INGREDIENTS ═══════════ */}
      <div className="catalog">
        {/* Scope Switchers */}
        <div className="section-switch">
          <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>
            <Boxes />
            <span>
              <strong>كل الخامات والمكونات</strong>
              <small>{state.ingredients.filter((i) => i.active).length} مكون مسجل</small>
            </span>
          </button>
          <button className={scope === "low" ? "active fresh" : ""} onClick={() => setScope("low")}>
            <AlertTriangle />
            <span>
              <strong>نواقص المخزون</strong>
              <small>{lowStockCount} مكون تحت حد الطلب</small>
            </span>
          </button>
        </div>

        {/* Tools: Search & Units */}
        <div className="catalog-tools">
          <label className="search-box">
            <Search size={19} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن مكون لشراؤه..."
            />
          </label>
          <div className="category-list">
            {units.map((unit) => (
              <button
                key={unit}
                className={unitFilter === unit ? "active" : ""}
                onClick={() => setUnitFilter(unit)}
              >
                {unit}
              </button>
            ))}
          </div>
        </div>

        {/* Ingredients Grid */}
        <div className="product-grid">
          {ingredients.map((ingredient) => {
            const isLow = ingredient.stockQty <= ingredient.minStock;
            return (
              <button
                key={ingredient.id}
                className={`product-card ${isLow ? "low-stock-card" : ""}`}
                onClick={() => addIngredient(ingredient)}
              >
                <span className="food-visual" style={{ background: isLow ? "linear-gradient(145deg, #fee2e2, #fecaca)" : "linear-gradient(145deg, #e0f2fe, #bae6fd)" }}>
                  <Scale size={28} style={{ color: isLow ? "#dc2626" : "#0284c7" }} />
                </span>
                <span className="product-info">
                  <strong>{ingredient.name}</strong>
                  <small>رصيد: {ingredient.stockQty} {ingredient.unit}</small>
                  <b>{money(ingredient.unitCost)} ج.م / {ingredient.unit}</b>
                </span>
                <span className="quick-add">
                  <Plus size={18} />
                </span>
              </button>
            );
          })}
          {!ingredients.length && (
            <Empty
              icon={<Boxes />}
              title="لا توجد مكونات مطابقة"
              text="جرب البحث بكلمة أخرى أو غيّر الفلتر"
            />
          )}
        </div>
      </div>

      {/* ═══════════ RIGHT: PURCHASE CART PANEL ═══════════ */}
      <aside className="cart-panel">
        {/* Title & Cart Info */}
        <div className="cart-title">
          <div className="cart-heading">
            <span className="cart-heading-icon" style={{ background: "#0284c7", color: "#fff" }}>
              <FileText />
            </span>
            <span>
              <b>فاتورة مشتريات</b>
              <small>{cart.length ? `${cart.length} صنف · ${totalUnits} وحدة` : "أضف الخامات للفاتورة"}</small>
            </span>
            <strong>#{state.nextPurchaseInvoiceNumber}</strong>
          </div>
          <button
            className="clear-cart-button"
            title="تفريغ الفاتورة"
            onClick={() => setCart([])}
            disabled={!cart.length}
          >
            <Trash2 size={18} />
          </button>
        </div>

        {/* Supplier Selector */}
        <div className="customer-picker">
          {supplier ? (
            <div className="selected-customer" style={{ borderRightColor: "#0284c7" }}>
              <span className="customer-avatar" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                <Truck size={18} />
              </span>
              <div>
                <strong>{supplier.name}</strong>
                {supplier.phone && <small>{supplier.phone}</small>}
                {supplier.notes && <p>{supplier.notes}</p>}
              </div>
              <span className="selected-customer-actions">
                <button title="تغيير المورد" onClick={() => setShowSupplierModal(true)}>
                  <Truck size={16} />
                </button>
                <button title="إلغاء المورد" onClick={() => setSupplier(null)}>
                  <X size={17} />
                </button>
              </span>
            </div>
          ) : (
            <button className="select-customer" onClick={() => setShowSupplierModal(true)}>
              <UserPlus size={19} /> اختيار المورد أو إضافة مورد جديد <ChevronLeft size={18} />
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="cart-items">
          {cart.length > 0 && (
            <div className="cart-table-head">
              <span>المكون</span>
              <span>الكمية</span>
              <span>السعر / الوحدة</span>
              <span>الإجمالي</span>
              <span />
            </div>
          )}
          {cart.map((item) => (
            <div className="cart-item" key={item.ingredientId} style={{ gridTemplateColumns: "1.2fr 90px 85px 70px 30px" }}>
              <div className="cart-product-cell">
                <strong>{item.name}</strong>
                <small>{item.unit}</small>
              </div>
              <div className="quantity">
                <button onClick={() => updateQuantity(item.ingredientId, -1)}>
                  <Minus size={13} />
                </button>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={item.quantity || ""}
                  onChange={(e) => setItemQuantityDirect(item.ingredientId, Number(e.target.value))}
                  style={{ width: "36px", border: 0, textAlign: "center", font: "inherit", fontWeight: 700 }}
                />
                <button onClick={() => updateQuantity(item.ingredientId, 1)}>
                  <Plus size={13} />
                </button>
              </div>
              <div>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={item.unitCost || ""}
                  onChange={(e) => updateItemCost(item.ingredientId, Number(e.target.value))}
                  style={{
                    width: "68px",
                    padding: "4px 6px",
                    borderRadius: "6px",
                    border: "1px solid var(--line)",
                    fontSize: "11px",
                    textAlign: "center"
                  }}
                  title="سعر الشراء للوحدة"
                />
              </div>
              <b className="cart-line-total">{money(item.unitCost * item.quantity)}</b>
              <button
                className="remove-cart-item"
                title="حذف المكون"
                onClick={() => removeCartItem(item.ingredientId)}
              >
                <Trash2 />
              </button>
            </div>
          ))}
          {!cart.length && (
            <div className="empty-cart">
              <Boxes size={44} />
              <strong>فاتورة الشراء فارغة</strong>
              <span>انقر على المكونات من القائمة لإضافتها للفاتورة</span>
            </div>
          )}
        </div>

        {/* Cart Summary & Checkout */}
        <div className="cart-summary">
          <span className="cart-summary-title">خيارات وإجمالي الفاتورة</span>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <label style={{ fontSize: "10px", display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{ color: "var(--muted)" }}>طريقة الدفع</span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                style={{ padding: "6px 8px", borderRadius: "7px", border: "1px solid var(--line)", fontSize: "11px" }}
              >
                <option value="cash">نقدي</option>
                <option value="instapay">إنستاباي</option>
                <option value="vodafone">فودافون كاش</option>
              </select>
            </label>
            <label style={{ fontSize: "10px", display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{ color: "var(--muted)" }}>حالة الدفع</span>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                style={{ padding: "6px 8px", borderRadius: "7px", border: "1px solid var(--line)", fontSize: "11px" }}
              >
                <option value="paid">مدفوعة</option>
                <option value="pending">معلقة (آجل)</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <label style={{ fontSize: "10px", display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{ color: "var(--muted)" }}>خصم (ج.م)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value))}
                placeholder="0"
                style={{ padding: "6px 8px", borderRadius: "7px", border: "1px solid var(--line)", fontSize: "11px" }}
              />
            </label>
            <label style={{ fontSize: "10px", display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{ color: "var(--muted)" }}>ملاحظة</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="رقم فاتورة المورد..."
                style={{ padding: "6px 8px", borderRadius: "7px", border: "1px solid var(--line)", fontSize: "11px" }}
              />
            </label>
          </div>

          <div className="cart-total-row">
            <span>الإجمالي النهائي</span>
            <strong style={{ color: "#0284c7" }}>{money(grandTotal)} ج.م</strong>
          </div>

          <button
            className="primary-button checkout-button"
            style={{ background: "#0284c7" }}
            disabled={!cart.length || !supplier}
            onClick={handleSavePurchaseInvoice}
          >
            إتمام وتأكيد فاتورة الشراء <span>{money(grandTotal)} ج.م</span>
          </button>

          {!supplier && cart.length > 0 && (
            <small className="hint">اختر المورد أولاً لتسجيل فاتورة الشراء</small>
          )}
        </div>
      </aside>

      {/* ═══════════ MODAL: SELECT/ADD SUPPLIER ═══════════ */}
      {showSupplierModal && (
        <Modal
          title={isAddingNewSupplier ? "إضافة مورد جديد" : "اختيار المورد"}
          onClose={() => {
            setShowSupplierModal(false);
            setIsAddingNewSupplier(false);
          }}
          size="medium"
        >
          {isAddingNewSupplier ? (
            <div className="form-stack">
              <label>
                اسم المورد <em>*</em>
                <input
                  autoFocus
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  placeholder="مثال: شركة الخير للحوم"
                />
              </label>
              <label>
                رقم الهاتف
                <input
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                />
              </label>
              <label>
                ملاحظات / عنوان
                <input
                  value={supplierForm.notes}
                  onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                  placeholder="مثال: مورد فراخ مجمدة"
                />
              </label>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "10px" }}>
                <button className="soft-button" onClick={() => setIsAddingNewSupplier(false)}>
                  رجوع للقائمة
                </button>
                <button className="primary-button" onClick={registerNewSupplier}>
                  <Save size={16} /> حفظ واختيار المورد
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <label className="search-box" style={{ flex: 1 }}>
                  <Search size={18} />
                  <input
                    autoFocus
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    placeholder="ابحث باسم المورد أو رقم الهاتف..."
                  />
                </label>
                <button className="primary-button compact" onClick={() => setIsAddingNewSupplier(true)}>
                  <Plus size={16} /> مورد جديد
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflowY: "auto" }}>
                {filteredSuppliers.map((sup) => (
                  <div
                    key={sup.id}
                    className="supplier-card"
                    style={{ cursor: "pointer", transition: "0.15s" }}
                    onClick={() => selectSupplierHandler(sup)}
                  >
                    <div>
                      <Truck />
                      <div>
                        <strong>{sup.name}</strong>
                        {sup.phone && <small>{sup.phone}</small>}
                        {sup.notes && <small style={{ color: "var(--muted)" }}>{sup.notes}</small>}
                      </div>
                    </div>
                    <button className="soft-button compact">اختيار</button>
                  </div>
                ))}

                {!filteredSuppliers.length && (
                  <Empty
                    icon={<Truck />}
                    title="لا يوجد موردين مطبقين"
                    text="انقر على زر 'مورد جديد' لإضافة مورد جديد"
                  />
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
