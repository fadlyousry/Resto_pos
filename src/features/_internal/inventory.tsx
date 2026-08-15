// Internal inventory implementation. Consume it through the public feature index.
import { useState, type ReactNode } from "react";
import {
  AlertTriangle, Boxes, Calculator, ChevronLeft, CookingPot, Edit3, History, PackagePlus, Plus,
  Save, Search, ShoppingBasket, Scale, Trash2
} from "lucide-react";
import type {
  CashTransaction, Ingredient, Product, RecipeItem, StockMovement
} from "../../domain/types";
import type { ViewProps } from "../../shared/contracts";
import { money, qty, shortDate } from "../../shared/format";
import { uid } from "../../shared/id";
import { purchasesTreasuryId } from "../../shared/treasury";
import { Empty, Modal, WorkspaceSectionHeader } from "../../shared/ui";

export function InventoryView({ state, update, notify }: ViewProps) {
  const [tab, setTab] = useState<"stock" | "recipes" | "movements">("stock");
  const [stockIngredient, setStockIngredient] = useState<Ingredient | null>(null);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [editingIngredientId, setEditingIngredientId] = useState("");
  const [ingredientToDelete, setIngredientToDelete] = useState<Ingredient | null>(null);
  const [stockSearch, setStockSearch] = useState("");
  const [stockScope, setStockScope] = useState<"all" | "low">("all");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeSection, setRecipeSection] = useState<"all" | "cooked" | "fresh">("all");
  const [movementSearch, setMovementSearch] = useState("");
  const [ingredientAttempted, setIngredientAttempted] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(state.products[0]?.id ?? "");
  const [ingredientForm, setIngredientForm] = useState({ name: "", unit: "كجم", stockQty: 0, minStock: 0, unitCost: 0 });
  const [recipeDraft, setRecipeDraft] = useState<Record<string, number>>(() => recipeRecord(state.recipes, selectedProductId));

  // Purchase Modal State
  const [purchaseMode, setPurchaseMode] = useState<"unit" | "piece">("unit");
  const [purchaseQty, setPurchaseQty] = useState<number>(0);
  const [pieceCount, setPieceCount] = useState<number>(0);
  const [pieceWeight, setPieceWeight] = useState<number>(1);
  const [purchaseUnitCost, setPurchaseUnitCost] = useState<number>(0);
  const [pieceCost, setPieceCost] = useState<number>(0);
  const [costMode, setCostMode] = useState<"per_unit" | "per_piece">("per_unit");
  const [purchaseNote, setPurchaseNote] = useState<string>("");

  const lowStock = state.ingredients.filter((item) => item.stockQty <= item.minStock);
  const visibleIngredients = state.ingredients.filter((item) =>
    (stockScope === "all" || item.stockQty <= item.minStock)
    && item.name.includes(stockSearch.trim())
  );
  const visibleRecipeProducts = state.products.filter((product) =>
    (recipeSection === "all" || product.section === recipeSection)
    && product.name.includes(recipeSearch.trim())
  );
  const visibleMovements = state.stockMovements.filter((movement) =>
    movement.ingredientName.includes(movementSearch.trim())
    || movement.description.includes(movementSearch.trim())
  ).slice(0, 50);
  const selectedProduct = state.products.find((product) => product.id === selectedProductId);
  const recipeCost = state.ingredients.reduce((sum, ingredient) => sum + (recipeDraft[ingredient.id] ?? 0) * ingredient.unitCost, 0);

  const selectProduct = (product: Product) => {
    setSelectedProductId(product.id);
    setRecipeDraft(recipeRecord(state.recipes, product.id));
  };

  const openAddStockModal = (ingredient: Ingredient) => {
    setStockIngredient(ingredient);
    setPurchaseMode("unit");
    setPurchaseQty(0);
    setPieceCount(0);
    setPieceWeight(1);
    const roundedCost = Math.round(ingredient.unitCost * 100) / 100;
    setPurchaseUnitCost(roundedCost);
    setPieceCost(roundedCost);
    setCostMode("per_unit");
    setPurchaseNote("");
  };

  // Calculations for stock addition
  const calculatedQty = purchaseMode === "unit" ? purchaseQty : (pieceCount * pieceWeight);
  const calculatedUnitCost = costMode === "per_unit"
    ? purchaseUnitCost
    : (pieceWeight > 0 ? pieceCost / pieceWeight : 0);
  const totalPurchaseCost = costMode === "per_unit"
    ? calculatedQty * purchaseUnitCost
    : pieceCount * pieceCost;

  const roundedQty = Math.round(calculatedQty * 1000) / 1000;
  const roundedTotalCost = Math.round(totalPurchaseCost * 100) / 100;
  const roundedUnitCost = Math.round(calculatedUnitCost * 100) / 100;

  const currentStock = stockIngredient?.stockQty || 0;
  const currentCost = stockIngredient?.unitCost || 0;
  const newStock = Math.round((currentStock + roundedQty) * 1000) / 1000;
  const newWeightedCost = newStock > 0
    ? ((currentStock * currentCost) + roundedTotalCost) / newStock
    : roundedUnitCost;
  const roundedNewWeightedCost = Math.round(newWeightedCost * 100) / 100;

  const addPurchase = () => {
    if (!stockIngredient || roundedQty <= 0 || roundedTotalCost <= 0) return;
    const createdAt = new Date().toISOString();
    const movement: StockMovement = {
      id: uid(),
      ingredientId: stockIngredient.id,
      ingredientName: stockIngredient.name,
      type: "purchase",
      quantity: roundedQty,
      unitCost: roundedUnitCost,
      description: purchaseNote.trim() || `إضافة مشتريات (${purchaseMode === "piece" ? `${pieceCount} قطعة × ${pieceWeight} ${stockIngredient.unit}` : `${roundedQty} ${stockIngredient.unit}`})`,
      createdAt
    };
    const expense: CashTransaction = {
      id: uid(),
      type: "expense",
      method: "cash",
      amount: roundedTotalCost,
      direction: "out",
      description: `شراء مخزون — ${stockIngredient.name}`,
      treasuryId: purchasesTreasuryId(state),
      createdAt
    };
    update((current) => ({
      ...current,
      ingredients: current.ingredients.map((item) =>
        item.id === stockIngredient.id
          ? { ...item, stockQty: newStock, unitCost: roundedNewWeightedCost }
          : item
      ),
      stockMovements: [movement, ...current.stockMovements],
      cashTransactions: [expense, ...current.cashTransactions]
    }));
    setStockIngredient(null);
    notify(`تمت إضافة ${roundedQty} ${stockIngredient.unit} بنجاح للمخزون`);
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

  const saveIngredient = () => {
    setIngredientAttempted(true);
    const duplicate = state.ingredients.some((item) => item.id !== editingIngredientId && item.name.trim() === ingredientForm.name.trim());
    if (ingredientForm.name.trim().length < 2 || !ingredientForm.unit.trim() || ingredientForm.unitCost < 0 || ingredientForm.stockQty < 0 || ingredientForm.minStock < 0 || duplicate) return;
    const normalizedForm = { ...ingredientForm, name: ingredientForm.name.trim(), unit: ingredientForm.unit.trim() };
    const ingredient: Ingredient = { id: editingIngredientId || uid(), ...normalizedForm, active: true };
    const movement: StockMovement | null = !editingIngredientId && ingredient.stockQty > 0 ? {
      id: uid(), ingredientId: ingredient.id, ingredientName: ingredient.name,
      type: "adjustment", quantity: ingredient.stockQty, unitCost: ingredient.unitCost,
      description: "رصيد افتتاحي", createdAt: new Date().toISOString()
    } : null;
    update((current) => ({
      ...current,
      ingredients: editingIngredientId
        ? current.ingredients.map((item) => item.id === editingIngredientId ? { ...item, ...normalizedForm } : item)
        : [...current.ingredients, ingredient],
      stockMovements: movement ? [movement, ...current.stockMovements] : current.stockMovements
    }));
    setAddingIngredient(false); setEditingIngredientId(""); setIngredientAttempted(false);
    setIngredientForm({ name: "", unit: "كجم", stockQty: 0, minStock: 0, unitCost: 0 });
    notify(editingIngredientId ? "تم تحديث بيانات المكون" : "تمت إضافة المكون");
  };


  const openNewIngredient = () => {
    setEditingIngredientId("");
    setIngredientAttempted(false);
    setIngredientForm({ name: "", unit: "كجم", stockQty: 0, minStock: 0, unitCost: 0 });
    setAddingIngredient(true);
  };
  const inventorySectionHeader = (title: string, subtitle: string, extraAction?: ReactNode) => (
    <WorkspaceSectionHeader title={title} subtitle={subtitle} actions={<>
      {extraAction}
      <button className="primary-button compact" onClick={openNewIngredient}><Plus /> إضافة مكون</button>
    </>} />
  );

  return (
    <div className="inventory-page">
      <div className="inventory-tabs">
        <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}><Boxes /><span><strong>أرصدة المخزون</strong></span></button>
        <button className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}><Calculator /><span><strong>الوصفات والتكلفة</strong></span></button>
        <button className={tab === "movements" ? "active" : ""} onClick={() => setTab("movements")}><History /><span><strong>حركات المخزون</strong></span></button>
      </div>

      {tab === "stock" && (
        <div className="panel inventory-stock-panel">
          {inventorySectionHeader("أرصدة المخزون", `${visibleIngredients.length} مكون ظاهر من إجمالي ${state.ingredients.length}`)}
          <div className="inventory-toolbar">
            <label className="search-box"><Search /><input value={stockSearch} onChange={(event) => setStockSearch(event.target.value)} placeholder="ابحث عن مكون..." /></label>
            <div className="filter-tabs"><button className={stockScope === "all" ? "active" : ""} onClick={() => setStockScope("all")}>كل المكونات</button><button className={stockScope === "low" ? "active danger" : ""} onClick={() => setStockScope("low")}><AlertTriangle /> تحت حد الطلب <b>{lowStock.length}</b></button></div>
            <span>{visibleIngredients.length} مكون</span>
          </div>
          <div className="inventory-table">
            <div className="inventory-row inventory-head"><span>المكون</span><span>الرصيد الحالي</span><span>حد الطلب</span><span>تكلفة الوحدة</span><span>قيمة الرصيد</span><span className="inventory-actions-heading">الإجراءات</span></div>
            {visibleIngredients.map((ingredient) => {
              const percent = Math.min(100, Math.max(4, (ingredient.stockQty / Math.max(ingredient.minStock * 3, 1)) * 100));
              const isLow = ingredient.stockQty <= ingredient.minStock;
              return (
                <div className={`inventory-row ${isLow ? "low" : ""}`} key={ingredient.id}>
                  <span className="inventory-name-cell"><i><Scale /></i><span><strong>{ingredient.name}</strong></span></span>
                  <span className="inventory-stock-cell"><b>{qty(ingredient.stockQty)} <small>{ingredient.unit}</small></b><div className="stock-bar"><i style={{ width: `${percent}%` }} /></div></span>
                  <span className="inventory-min-stock">{qty(ingredient.minStock)} {ingredient.unit}</span>
                  <span className="inventory-unit-cost">{money(ingredient.unitCost)}</span>
                  <span className="inventory-stock-value"><strong>{money(ingredient.stockQty * ingredient.unitCost)}</strong></span>
                  <div className="product-row-actions">
                    <button className="product-icon-action edit" type="button" title="تعديل المكون" aria-label={`تعديل مكون ${ingredient.name}`} onClick={() => {
                      setEditingIngredientId(ingredient.id);
                      setIngredientAttempted(false);
                      setIngredientForm({ name: ingredient.name, unit: ingredient.unit, stockQty: ingredient.stockQty, minStock: ingredient.minStock, unitCost: ingredient.unitCost });
                      setAddingIngredient(true);
                    }}><Edit3 /></button>
                    <button className="product-icon-action add-stock active" type="button" title="إضافة رصيد" aria-label={`إضافة رصيد ${ingredient.name}`} onClick={() => openAddStockModal(ingredient)}><PackagePlus /></button>
                    <button className="product-icon-action delete" type="button" title="حذف المكون" aria-label={`حذف مكون ${ingredient.name}`} onClick={() => setIngredientToDelete(ingredient)}><Trash2 /></button>
                  </div>
                </div>
              );
            })}
            {!visibleIngredients.length && <Empty icon={<Boxes />} title="لا توجد مكونات مطابقة" text="غيّر البحث أو اعرض كل المكونات" />}
          </div>
        </div>
      )}

      {tab === "recipes" && (
        <div className="inventory-tab-content">
          <div className="panel">{inventorySectionHeader("الوصفات والتكلفة", `${visibleRecipeProducts.length} صنف متاح لتكوين الوصفات`)}</div>
          <div className="recipe-layout">
          <div className="panel recipe-products">
            <div className="panel-title"><div><Calculator /><span><strong>الأصناف</strong><small>اختار صنف لتعديل وصفته</small></span></div></div>
            <div className="recipe-product-tools">
              <label className="search-box"><Search /><input value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} placeholder="ابحث عن صنف..." /></label>
              <div className="recipe-section-filter"><button className={recipeSection === "all" ? "active" : ""} onClick={() => setRecipeSection("all")}>الكل</button><button className={recipeSection === "cooked" ? "active" : ""} onClick={() => setRecipeSection("cooked")}>مطبوخ</button><button className={recipeSection === "fresh" ? "active" : ""} onClick={() => setRecipeSection("fresh")}>طازج</button></div>
            </div>
            <div className="recipe-product-list">{visibleRecipeProducts.map((product) => (
              <button className={selectedProductId === product.id ? "active" : ""} onClick={() => selectProduct(product)} key={product.id}>
                <i>{product.imageDataUrl ? <img src={product.imageDataUrl} alt="" /> : product.section === "cooked" ? <CookingPot /> : <ShoppingBasket />}</i>
                <span><strong>{product.name}</strong><small>{product.category} · {state.recipes.some((item) => item.productId === product.id) ? "وصفة مسجلة" : "بدون وصفة"}</small></span><ChevronLeft />
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
                <label className={(recipeDraft[ingredient.id] ?? 0) > 0 ? "used" : ""} key={ingredient.id}>
                  <span><strong>{ingredient.name}</strong><small>{money(ingredient.unitCost)} / {ingredient.unit}{(recipeDraft[ingredient.id] ?? 0) > 0 ? ` · تكلفة ${money((recipeDraft[ingredient.id] ?? 0) * ingredient.unitCost)}` : ""}</small></span>
                  <div><input type="number" min="0" step="0.01" value={recipeDraft[ingredient.id] || ""} onChange={(event) => setRecipeDraft({ ...recipeDraft, [ingredient.id]: Number(event.target.value) })} /><em>{ingredient.unit}</em></div>
                </label>
              ))}
            </div>
          </div>
        </div>
        </div>
      )}

      {tab === "movements" && (
        <div className="panel">
          {inventorySectionHeader("سجل حركات المخزون", `${visibleMovements.length} حركة ظاهرة`, <label className="search-box inventory-header-search"><Search /><input value={movementSearch} onChange={(event) => setMovementSearch(event.target.value)} placeholder="ابحث باسم المكون أو البيان..." /></label>)}
          <div className="stock-movements">
            {visibleMovements.map((movement) => (
              <div key={movement.id}>
                <span className={`movement-icon ${movement.type}`}><History /></span>
                <span><strong>{movement.ingredientName}</strong><small>{movement.description} · {shortDate(movement.createdAt)}</small></span>
                <b>{movement.type === "consume" || movement.type === "waste" ? "-" : "+"}{movement.quantity.toLocaleString("en-US")}</b>
                <span>{money(movement.quantity * movement.unitCost)}</span>
              </div>
            ))}
            {!visibleMovements.length && <Empty icon={<History />} title="لا توجد حركات مطابقة" text="أول شراء أو طلب سيظهر هنا" />}
          </div>
        </div>
      )}

      {stockIngredient && (
        <Modal title={`إضافة رصيد — ${stockIngredient.name}`} onClose={() => setStockIngredient(null)} size="medium">
          <div className="add-stock-modal">
            <div className="stock-hero-badge">
              <PackagePlus />
              <div>
                <strong>تسجيل مشتريات ({stockIngredient.name})</strong>
                <small>الرصيد الحالي: {qty(stockIngredient.stockQty)} {stockIngredient.unit} · التكلفة الحالية: {money(Math.round(stockIngredient.unitCost * 100) / 100)} ج.م / {stockIngredient.unit}</small>
              </div>
            </div>

            {/* Toggle unit mode */}
            <div className="purchase-unit-toggle">
              <button
                type="button"
                className={purchaseMode === "unit" ? "active" : ""}
                onClick={() => setPurchaseMode("unit")}
              >
                <Scale size={16} /> الشراء بالـ {stockIngredient.unit} المباشر
              </button>
              <button
                type="button"
                className={purchaseMode === "piece" ? "active" : ""}
                onClick={() => setPurchaseMode("piece")}
              >
                <Boxes size={16} /> الشراء بالعدد / بالواحدة (قطع)
              </button>
            </div>

            {/* Fields Grid */}
            {purchaseMode === "unit" ? (
              <div className="add-stock-grid">
                <label>
                  <span>الكمية بـ ({stockIngredient.unit}) <em>*</em></span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    autoFocus
                    value={purchaseQty || ""}
                    onChange={(e) => setPurchaseQty(Number(e.target.value))}
                    placeholder="0"
                  />
                </label>
                <label>
                  <span>تكلفة الـ {stockIngredient.unit} (ج.م) <em>*</em></span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchaseUnitCost || ""}
                    onChange={(e) => setPurchaseUnitCost(Number(e.target.value))}
                    placeholder="0"
                  />
                </label>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="add-stock-grid">
                  <label>
                    <span>عدد القطع / الأفراد (واحدة) <em>*</em></span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      autoFocus
                      value={pieceCount || ""}
                      onChange={(e) => setPieceCount(Number(e.target.value))}
                      placeholder="مثال: 5"
                    />
                  </label>
                  <label>
                    <span>متوسط كمية القطعة بـ ({stockIngredient.unit}) <em>*</em></span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pieceWeight || ""}
                      onChange={(e) => setPieceWeight(Number(e.target.value))}
                      placeholder="مثال: 1.5"
                    />
                    <small>= إجمالي {roundedQty} {stockIngredient.unit}</small>
                  </label>
                </div>

                <div className="cost-mode-selector">
                  <span>حساب السعر:</span>
                  <label>
                    <input
                      type="radio"
                      name="costMode"
                      checked={costMode === "per_unit"}
                      onChange={() => setCostMode("per_unit")}
                    />
                    بسعر الـ {stockIngredient.unit}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="costMode"
                      checked={costMode === "per_piece"}
                      onChange={() => setCostMode("per_piece")}
                    />
                    بسعر القطعة الواحدة
                  </label>
                </div>

                <div className="add-stock-grid">
                  {costMode === "per_unit" ? (
                    <label style={{ gridColumn: "1 / -1" }}>
                      <span>تكلفة الـ {stockIngredient.unit} (ج.م) <em>*</em></span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={purchaseUnitCost || ""}
                        onChange={(e) => setPurchaseUnitCost(Number(e.target.value))}
                        placeholder="0"
                      />
                    </label>
                  ) : (
                    <label style={{ gridColumn: "1 / -1" }}>
                      <span>تكلفة القطعة الواحدة (ج.م) <em>*</em></span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={pieceCost || ""}
                        onChange={(e) => setPieceCost(Number(e.target.value))}
                        placeholder="0"
                      />
                      <small>= تعادل {money(roundedUnitCost)} ج.م لكل {stockIngredient.unit}</small>
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Note */}
            <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "11px", fontWeight: 600 }}>
              <span>ملاحظة</span>
              <input
                value={purchaseNote}
                onChange={(e) => setPurchaseNote(e.target.value)}
                placeholder="اسم المورد، رقم الفاتورة..."
                style={{ padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "12px" }}
              />
            </label>

            {/* Summary Banner */}
            <div className="purchase-summary-banner">
              <div>
                <small>الكمية المضافة</small>
                <strong>{roundedQty.toLocaleString("en-US")} {stockIngredient.unit}</strong>
              </div>
              <div>
                <small>إجمالي المشتريات</small>
                <strong>{money(roundedTotalCost)} ج.م</strong>
              </div>
              <div>
                <small>متوسط التكلفة الجديد</small>
                <strong>{money(roundedNewWeightedCost)} ج.م</strong>
              </div>
            </div>

            <button className="primary-button" onClick={addPurchase}>
              <PackagePlus /> إضافة وتأكيد تسجيل المصروف
            </button>
          </div>
        </Modal>
      )}
      {addingIngredient && (
        <Modal title={editingIngredientId ? "تعديل المكون" : "إضافة مكون جديد"} onClose={() => { setAddingIngredient(false); setEditingIngredientId(""); setIngredientAttempted(false); }} size="medium">
          <div className="ingredient-editor-modal">
            <div className="ingredient-editor-fields">
              <label className={`full-field ${ingredientAttempted && ingredientForm.name.trim().length < 2 ? "invalid" : ""}`}><span>اسم المكون <em>*</em></span><div><Boxes /><input autoFocus value={ingredientForm.name} onChange={(event) => setIngredientForm({ ...ingredientForm, name: event.target.value })} placeholder="مثال: أرز مصري، زيت، فراخ..." /></div>{ingredientAttempted && ingredientForm.name.trim().length < 2 && <small>اكتب اسم المكون بوضوح</small>}{ingredientAttempted && state.ingredients.some((item) => item.id !== editingIngredientId && item.name.trim() === ingredientForm.name.trim()) && <small>هذا المكون مسجل بالفعل</small>}</label>
              <label><span>وحدة القياس <em>*</em></span><div><Scale /><input list="ingredient-unit-options" value={ingredientForm.unit} onChange={(event) => setIngredientForm({ ...ingredientForm, unit: event.target.value })} placeholder="اختر أو اكتب الوحدة" /><datalist id="ingredient-unit-options"><option value="كجم" /><option value="جرام" /><option value="لتر" /><option value="مل" /><option value="قطعة" /><option value="عبوة" /><option value="صينية" /></datalist></div></label>
              <label><span>تكلفة الوحدة</span><div><Calculator /><input type="number" min="0" step="0.01" value={ingredientForm.unitCost || ""} onChange={(event) => setIngredientForm({ ...ingredientForm, unitCost: Number(event.target.value) })} placeholder="0" /></div></label>
              <label><span>{editingIngredientId ? "الرصيد الحالي" : "الرصيد الافتتاحي"}</span><div><Boxes /><input type="number" min="0" step="0.01" disabled={Boolean(editingIngredientId)} value={ingredientForm.stockQty || ""} onChange={(event) => setIngredientForm({ ...ingredientForm, stockQty: Number(event.target.value) })} placeholder="0" /></div></label>
              <label><span>حد إعادة الطلب</span><div><AlertTriangle /><input type="number" min="0" step="0.01" value={ingredientForm.minStock || ""} onChange={(event) => setIngredientForm({ ...ingredientForm, minStock: Number(event.target.value) })} placeholder="0" /></div></label>
            </div>
            <div className="ingredient-editor-note"><AlertTriangle /><span><strong>حد الطلب مهم لاستمرارية التشغيل</strong><small>اضبطه على أقل كمية آمنة قبل الحاجة لشراء مكون جديد.</small></span></div>
            <div className="ingredient-editor-actions">
              <button className="soft-button" onClick={() => { setAddingIngredient(false); setEditingIngredientId(""); setIngredientAttempted(false); }}>إلغاء</button>
              <button className="primary-button" onClick={saveIngredient}><Save /> {editingIngredientId ? "حفظ التعديلات" : "إضافة المكون"}</button>
            </div>
          </div>
        </Modal>
      )}
      {ingredientToDelete && (
        <Modal title="تأكيد حذف المكون" onClose={() => setIngredientToDelete(null)}>
          <div className="delete-order-confirm">
            <span className="delete-order-icon"><Trash2 /></span>
            <strong>هل تريد حذف المكون «{ingredientToDelete.name}»؟</strong>
            <p>سيتم حذف المكون نهائيًا من أرصدة المخزون وقوائم الوصفات والمشتريات.</p>
            <div>
              <span>الرصيد الحالي <b>{qty(ingredientToDelete.stockQty)} {ingredientToDelete.unit}</b></span>
              <span>تكلفة الوحدة <b>{money(ingredientToDelete.unitCost)} ج.م / {ingredientToDelete.unit}</b></span>
              <span>إجمالي قيمة الرصيد <b>{money(ingredientToDelete.stockQty * ingredientToDelete.unitCost)} ج.م</b></span>
              <span>حد إعادة الطلب <b>{qty(ingredientToDelete.minStock)} {ingredientToDelete.unit}</b></span>
            </div>
            <footer>
              <button type="button" className="soft-button" onClick={() => setIngredientToDelete(null)}>إلغاء</button>
              <button type="button" className="delete-order-button" onClick={() => {
                update((current) => ({
                  ...current,
                  ingredients: current.ingredients.filter((item) => item.id !== ingredientToDelete.id),
                  recipes: current.recipes.filter((item) => item.ingredientId !== ingredientToDelete.id)
                }));
                if (editingIngredientId === ingredientToDelete.id) {
                  setAddingIngredient(false);
                  setEditingIngredientId("");
                }
                notify(`تم حذف المكون ${ingredientToDelete.name}`);
                setIngredientToDelete(null);
              }}><Trash2 /> تأكيد حذف المكون</button>
            </footer>
          </div>
        </Modal>
      )}
    </div>
  );
}

function recipeRecord(recipes: RecipeItem[], productId: string) {
  return Object.fromEntries(recipes.filter((item) => item.productId === productId).map((item) => [item.ingredientId, item.quantity]));
}
