import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  AlertTriangle, ArchiveRestore, BadgePercent, Boxes, Calculator, Check, ChevronLeft,
  CircleDollarSign, DatabaseBackup, Download, Gift, History, PackagePlus, Plus,
  Save, Scale, Sparkles, Upload, Users, X
} from "lucide-react";
import type {
  AppState, CashTransaction, Ingredient, Offer, Product, RecipeItem, StockMovement
} from "./types";

const money = (value: number) => `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const shortDate = (value: string) => new Intl.DateTimeFormat("ar-EG", {
  day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
}).format(new Date(value));
const uid = () => crypto.randomUUID();

interface PhaseThreeProps {
  state: AppState;
  update: (updater: (current: AppState) => AppState) => void;
  notify: (message: string) => void;
}

export function InventoryView({ state, update, notify }: PhaseThreeProps) {
  const [tab, setTab] = useState<"stock" | "recipes" | "movements">("stock");
  const [stockIngredient, setStockIngredient] = useState<Ingredient | null>(null);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(state.products[0]?.id ?? "");
  const [purchase, setPurchase] = useState({ quantity: 0, unitCost: 0, note: "" });
  const [ingredientForm, setIngredientForm] = useState({ name: "", unit: "كجم", stockQty: 0, minStock: 0, unitCost: 0 });
  const [recipeDraft, setRecipeDraft] = useState<Record<string, number>>(() => recipeRecord(state.recipes, selectedProductId));

  const lowStock = state.ingredients.filter((item) => item.stockQty <= item.minStock);
  const inventoryValue = state.ingredients.reduce((sum, item) => sum + item.stockQty * item.unitCost, 0);
  const selectedProduct = state.products.find((product) => product.id === selectedProductId);
  const recipeCost = state.ingredients.reduce((sum, ingredient) => sum + (recipeDraft[ingredient.id] ?? 0) * ingredient.unitCost, 0);

  const selectProduct = (product: Product) => {
    setSelectedProductId(product.id);
    setRecipeDraft(recipeRecord(state.recipes, product.id));
  };

  const addPurchase = () => {
    if (!stockIngredient || purchase.quantity <= 0 || purchase.unitCost <= 0) return;
    const createdAt = new Date().toISOString();
    const totalCost = purchase.quantity * purchase.unitCost;
    const newStock = stockIngredient.stockQty + purchase.quantity;
    const weightedCost = ((stockIngredient.stockQty * stockIngredient.unitCost) + totalCost) / newStock;
    const movement: StockMovement = {
      id: uid(), ingredientId: stockIngredient.id, ingredientName: stockIngredient.name,
      type: "purchase", quantity: purchase.quantity, unitCost: purchase.unitCost,
      description: purchase.note || "إضافة مشتريات للمخزون", createdAt
    };
    const expense: CashTransaction = {
      id: uid(), type: "expense", method: "cash", amount: totalCost, direction: "out",
      description: `شراء مخزون — ${stockIngredient.name}`, createdAt
    };
    update((current) => ({
      ...current,
      ingredients: current.ingredients.map((item) => item.id === stockIngredient.id ? { ...item, stockQty: newStock, unitCost: weightedCost } : item),
      stockMovements: [movement, ...current.stockMovements],
      cashTransactions: [expense, ...current.cashTransactions]
    }));
    setStockIngredient(null);
    setPurchase({ quantity: 0, unitCost: 0, note: "" });
    notify(`تمت إضافة ${purchase.quantity} ${stockIngredient.unit} للمخزون`);
  };

  const addIngredient = () => {
    if (!ingredientForm.name || ingredientForm.unitCost < 0) return;
    const ingredient: Ingredient = { id: uid(), ...ingredientForm, active: true };
    const movement: StockMovement | null = ingredient.stockQty > 0 ? {
      id: uid(), ingredientId: ingredient.id, ingredientName: ingredient.name,
      type: "adjustment", quantity: ingredient.stockQty, unitCost: ingredient.unitCost,
      description: "رصيد افتتاحي", createdAt: new Date().toISOString()
    } : null;
    update((current) => ({
      ...current,
      ingredients: [...current.ingredients, ingredient],
      stockMovements: movement ? [movement, ...current.stockMovements] : current.stockMovements
    }));
    setAddingIngredient(false);
    setIngredientForm({ name: "", unit: "كجم", stockQty: 0, minStock: 0, unitCost: 0 });
    notify("تمت إضافة المكون");
  };

  const saveRecipe = () => {
    if (!selectedProduct) return;
    const recipes: RecipeItem[] = Object.entries(recipeDraft)
      .filter(([, quantity]) => quantity > 0)
      .map(([ingredientId, quantity]) => ({
        id: state.recipes.find((item) => item.productId === selectedProduct.id && item.ingredientId === ingredientId)?.id ?? uid(),
        productId: selectedProduct.id, ingredientId, quantity
      }));
    update((current) => ({
      ...current,
      recipes: [...current.recipes.filter((item) => item.productId !== selectedProduct.id), ...recipes],
      products: current.products.map((product) => product.id === selectedProduct.id ? { ...product, cost: recipeCost } : product)
    }));
    notify(`تم حفظ وصفة ${selectedProduct.name} وتحديث تكلفتها`);
  };

  return (
    <div className="inventory-page">
      <div className="stat-strip">
        <MiniStat icon={<Boxes />} label="قيمة المخزون" value={money(inventoryValue)} tone="green" />
        <MiniStat icon={<AlertTriangle />} label="تحت حد الطلب" value={String(lowStock.length)} tone="red" />
        <MiniStat icon={<Scale />} label="عدد المكونات" value={String(state.ingredients.length)} tone="blue" />
        <MiniStat icon={<Calculator />} label="وصفات مسجلة" value={String(new Set(state.recipes.map((item) => item.productId)).size)} tone="orange" />
      </div>

      <div className="inventory-tabs">
        <div className="filter-tabs">
          <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>الأرصدة</button>
          <button className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}>الوصفات والتكلفة</button>
          <button className={tab === "movements" ? "active" : ""} onClick={() => setTab("movements")}>حركات المخزون</button>
        </div>
        <button className="primary-button compact" onClick={() => setAddingIngredient(true)}><Plus /> مكون جديد</button>
      </div>

      {tab === "stock" && (
        <div className="panel">
          <div className="inventory-table">
            <div className="inventory-row inventory-head"><span>المكون</span><span>الرصيد</span><span>حد الطلب</span><span>تكلفة الوحدة</span><span>القيمة</span><span>إجراء</span></div>
            {state.ingredients.map((ingredient) => {
              const percent = Math.min(100, Math.max(4, (ingredient.stockQty / Math.max(ingredient.minStock * 3, 1)) * 100));
              const isLow = ingredient.stockQty <= ingredient.minStock;
              return (
                <div className={`inventory-row ${isLow ? "low" : ""}`} key={ingredient.id}>
                  <span><strong>{ingredient.name}</strong><small>{ingredient.unit}</small></span>
                  <span><b>{ingredient.stockQty.toLocaleString("ar-EG")}</b><div className="stock-bar"><i style={{ width: `${percent}%` }} /></div></span>
                  <span>{ingredient.minStock.toLocaleString("ar-EG")} {ingredient.unit}</span>
                  <span>{money(ingredient.unitCost)}</span>
                  <span><strong>{money(ingredient.stockQty * ingredient.unitCost)}</strong></span>
                  <span><button className="stock-add-button" onClick={() => { setStockIngredient(ingredient); setPurchase({ quantity: 0, unitCost: ingredient.unitCost, note: "" }); }}><PackagePlus /> إضافة رصيد</button></span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "recipes" && (
        <div className="recipe-layout">
          <div className="panel recipe-products">
            <div className="panel-title"><div><Calculator /><span><strong>الأصناف</strong><small>اختار صنف لتعديل وصفته</small></span></div></div>
            <div>{state.products.map((product) => (
              <button className={selectedProductId === product.id ? "active" : ""} onClick={() => selectProduct(product)} key={product.id}>
                <span><strong>{product.name}</strong><small>{product.unit}</small></span><ChevronLeft />
              </button>
            ))}</div>
          </div>
          <div className="panel recipe-editor">
            <div className="panel-title">
              <div><Scale /><span><strong>وصفة {selectedProduct?.name}</strong><small>الكميات اللازمة لوحدة بيع واحدة</small></span></div>
              <button className="primary-button compact" onClick={saveRecipe}><Save /> حفظ الوصفة</button>
            </div>
            <div className="recipe-cost-banner">
              <span><small>تكلفة الوصفة</small><strong>{money(recipeCost)}</strong></span>
              <span><small>سعر البيع</small><strong>{money(selectedProduct?.price ?? 0)}</strong></span>
              <span><small>هامش الربح</small><strong>{money((selectedProduct?.price ?? 0) - recipeCost)}</strong></span>
              <span><small>نسبة الهامش</small><strong>{selectedProduct?.price ? `${Math.round(((selectedProduct.price - recipeCost) / selectedProduct.price) * 100)}%` : "0%"}</strong></span>
            </div>
            <div className="recipe-ingredients">
              {state.ingredients.map((ingredient) => (
                <label key={ingredient.id}>
                  <span><strong>{ingredient.name}</strong><small>{money(ingredient.unitCost)} / {ingredient.unit}</small></span>
                  <div><input type="number" min="0" step="0.01" value={recipeDraft[ingredient.id] || ""} onChange={(event) => setRecipeDraft({ ...recipeDraft, [ingredient.id]: Number(event.target.value) })} /><em>{ingredient.unit}</em></div>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "movements" && (
        <div className="panel">
          <div className="panel-title"><div><History /><span><strong>سجل حركات المخزون</strong><small>المشتريات والاستهلاك والتسويات</small></span></div></div>
          <div className="stock-movements">
            {state.stockMovements.slice(0, 50).map((movement) => (
              <div key={movement.id}>
                <span className={`movement-icon ${movement.type}`}><History /></span>
                <span><strong>{movement.ingredientName}</strong><small>{movement.description} · {shortDate(movement.createdAt)}</small></span>
                <b>{movement.type === "consume" || movement.type === "waste" ? "-" : "+"}{movement.quantity.toLocaleString("ar-EG")}</b>
                <span>{money(movement.quantity * movement.unitCost)}</span>
              </div>
            ))}
            {!state.stockMovements.length && <Empty icon={<History />} title="لا توجد حركات بعد" text="أول شراء أو طلب هيظهر هنا" />}
          </div>
        </div>
      )}

      {stockIngredient && (
        <Modal title={`إضافة رصيد — ${stockIngredient.name}`} onClose={() => setStockIngredient(null)}>
          <div className="form-stack">
            <label>الكمية ({stockIngredient.unit})<input type="number" min="0" step="0.01" autoFocus value={purchase.quantity || ""} onChange={(event) => setPurchase({ ...purchase, quantity: Number(event.target.value) })} /></label>
            <label>تكلفة {stockIngredient.unit}<input type="number" min="0" step="0.01" value={purchase.unitCost || ""} onChange={(event) => setPurchase({ ...purchase, unitCost: Number(event.target.value) })} /></label>
            <label>ملاحظة<input value={purchase.note} onChange={(event) => setPurchase({ ...purchase, note: event.target.value })} placeholder="اسم المورد أو رقم الفاتورة" /></label>
            <div className="purchase-total"><span>إجمالي المشتريات</span><strong>{money(purchase.quantity * purchase.unitCost)}</strong></div>
            <button className="primary-button" onClick={addPurchase}><PackagePlus /> إضافة وتسجيل المصروف</button>
          </div>
        </Modal>
      )}
      {addingIngredient && (
        <Modal title="مكون جديد" onClose={() => setAddingIngredient(false)}>
          <div className="form-stack">
            <label>اسم المكون<input autoFocus value={ingredientForm.name} onChange={(event) => setIngredientForm({ ...ingredientForm, name: event.target.value })} /></label>
            <div className="form-row">
              <label>وحدة القياس<input value={ingredientForm.unit} onChange={(event) => setIngredientForm({ ...ingredientForm, unit: event.target.value })} /></label>
              <label>تكلفة الوحدة<input type="number" min="0" value={ingredientForm.unitCost || ""} onChange={(event) => setIngredientForm({ ...ingredientForm, unitCost: Number(event.target.value) })} /></label>
            </div>
            <div className="form-row">
              <label>الرصيد الافتتاحي<input type="number" min="0" value={ingredientForm.stockQty || ""} onChange={(event) => setIngredientForm({ ...ingredientForm, stockQty: Number(event.target.value) })} /></label>
              <label>حد إعادة الطلب<input type="number" min="0" value={ingredientForm.minStock || ""} onChange={(event) => setIngredientForm({ ...ingredientForm, minStock: Number(event.target.value) })} /></label>
            </div>
            <button className="primary-button" onClick={addIngredient}>حفظ المكون</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function GrowthView({ state, update, notify }: PhaseThreeProps) {
  const [addingOffer, setAddingOffer] = useState(false);
  const [offerForm, setOfferForm] = useState<Omit<Offer, "id" | "active">>({ name: "", type: "percentage", value: 10, minOrder: 0 });

  const toggleOffer = (id: string) => update((current) => ({
    ...current, offers: current.offers.map((offer) => offer.id === id ? { ...offer, active: !offer.active } : offer)
  }));
  const addOffer = () => {
    if (!offerForm.name || offerForm.value <= 0) return;
    update((current) => ({ ...current, offers: [...current.offers, { id: uid(), ...offerForm, active: true }] }));
    setOfferForm({ name: "", type: "percentage", value: 10, minOrder: 0 });
    setAddingOffer(false);
    notify("تمت إضافة العرض");
  };
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString(), version: 3 }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `beitna-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("تم إنشاء النسخة الاحتياطية");
  };
  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppState;
        if (!Array.isArray(parsed.products) || !Array.isArray(parsed.orders) || !Array.isArray(parsed.customers)) throw new Error("invalid");
        if (!window.confirm("استرجاع النسخة سيستبدل البيانات الحالية. هل تريد المتابعة؟")) return;
        update((current) => ({
          ...current, ...parsed,
          ingredients: parsed.ingredients ?? current.ingredients,
          recipes: parsed.recipes ?? current.recipes,
          offers: parsed.offers ?? current.offers,
          stockMovements: parsed.stockMovements ?? current.stockMovements
        }));
        notify("تم استرجاع النسخة الاحتياطية");
      } catch {
        notify("ملف النسخة الاحتياطية غير صالح");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };
  const adjustPoints = (customerId: string, amount: number) => {
    update((current) => ({
      ...current,
      customers: current.customers.map((customer) => customer.id === customerId
        ? { ...customer, loyaltyPoints: Math.max(0, (customer.loyaltyPoints ?? 0) + amount) }
        : customer)
    }));
    notify("تم تحديث نقاط العميل");
  };

  return (
    <div className="growth-page">
      <div className="growth-hero">
        <div><Sparkles /><span><strong>الولاء والعروض</strong><small>حوّل العملاء المتكررين لمجتمع دائم حوالين بيتنا</small></span></div>
        <span className="points-total"><small>إجمالي نقاط العملاء</small><strong>{state.customers.reduce((sum, customer) => sum + (customer.loyaltyPoints ?? 0), 0).toLocaleString("ar-EG")}</strong></span>
      </div>
      <div className="growth-grid">
        <div className="panel">
          <div className="panel-title"><div><BadgePercent /><span><strong>العروض النشطة</strong><small>تظهر للكاشير في شاشة الدفع</small></span></div><button className="primary-button compact" onClick={() => setAddingOffer(true)}><Plus /> عرض جديد</button></div>
          <div className="offers-list">
            {state.offers.map((offer) => (
              <div className={offer.active ? "" : "inactive"} key={offer.id}>
                <span className="offer-value">{offer.type === "percentage" ? `${offer.value}%` : money(offer.value)}</span>
                <span><strong>{offer.name}</strong><small>حد أدنى {money(offer.minOrder)}</small></span>
                <button className={offer.active ? "toggle active" : "toggle"} onClick={() => toggleOffer(offer.id)}><i /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="panel backup-panel">
          <div className="panel-title"><div><DatabaseBackup /><span><strong>النسخ الاحتياطي</strong><small>نسخة كاملة من الطلبات والمخزون والإعدادات</small></span></div></div>
          <div className="backup-actions">
            <button onClick={exportBackup}><Download /><span><strong>تنزيل نسخة</strong><small>ملف JSON محفوظ على الجهاز</small></span></button>
            <label><Upload /><span><strong>استرجاع نسخة</strong><small>استبدال البيانات من ملف سابق</small></span><input type="file" accept=".json,application/json" onChange={importBackup} /></label>
          </div>
          <p><ArchiveRestore /> يُفضّل الاحتفاظ بنسخة يومية على فلاشة أو Google Drive.</p>
        </div>
      </div>
      <div className="panel">
        <div className="panel-title"><div><Users /><span><strong>نقاط العملاء</strong><small>كل 10 جنيهات = نقطة، وكل نقطة = جنيه خصم</small></span></div></div>
        <div className="loyalty-table">
          {state.customers.slice().sort((a, b) => (b.loyaltyPoints ?? 0) - (a.loyaltyPoints ?? 0)).map((customer) => (
            <div key={customer.id}>
              <span className="loyalty-avatar"><Gift /></span>
              <span><strong>{customer.name}</strong><small>{customer.phone} · {customer.ordersCount} طلبات</small></span>
              <span><small>النقاط المتاحة</small><b>{(customer.loyaltyPoints ?? 0).toLocaleString("ar-EG")}</b></span>
              <div><button onClick={() => adjustPoints(customer.id, -10)}>-10</button><button onClick={() => adjustPoints(customer.id, 10)}>+10</button></div>
            </div>
          ))}
        </div>
      </div>
      {addingOffer && (
        <Modal title="إضافة عرض" onClose={() => setAddingOffer(false)}>
          <div className="form-stack">
            <label>اسم العرض<input autoFocus value={offerForm.name} onChange={(event) => setOfferForm({ ...offerForm, name: event.target.value })} /></label>
            <label>نوع الخصم<select value={offerForm.type} onChange={(event) => setOfferForm({ ...offerForm, type: event.target.value as Offer["type"] })}><option value="percentage">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select></label>
            <label>قيمة الخصم<input type="number" min="0" value={offerForm.value} onChange={(event) => setOfferForm({ ...offerForm, value: Number(event.target.value) })} /></label>
            <label>الحد الأدنى للطلب<input type="number" min="0" value={offerForm.minOrder} onChange={(event) => setOfferForm({ ...offerForm, minOrder: Number(event.target.value) })} /></label>
            <button className="primary-button" onClick={addOffer}>حفظ العرض</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function recipeRecord(recipes: RecipeItem[], productId: string) {
  return Object.fromEntries(recipes.filter((item) => item.productId === productId).map((item) => [item.ingredientId, item.quantity]));
}

function MiniStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return <div className={`mini-stat ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state wide">{icon}<strong>{title}</strong><span>{text}</span></div>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><header><h2>{title}</h2><button onClick={onClose}><X /></button></header><div className="modal-body">{children}</div></div></div>;
}
