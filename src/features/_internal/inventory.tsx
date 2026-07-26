// Internal inventory implementation. Consume it through the public feature index.
import { useState } from "react";
import {
  AlertTriangle, Boxes, Calculator, ChevronLeft, History, PackagePlus, Plus,
  Save, Scale
} from "lucide-react";
import type {
  CashTransaction, Ingredient, Product, RecipeItem, StockMovement
} from "../../domain/types";
import type { ViewProps } from "../../shared/contracts";
import { money, shortDate } from "../../shared/format";
import { uid } from "../../shared/id";
import { Empty, MiniStat, Modal } from "../../shared/ui";

export function InventoryView({ state, update, notify }: ViewProps) {
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
                  <span><b>{ingredient.stockQty.toLocaleString("en-US")}</b><div className="stock-bar"><i style={{ width: `${percent}%` }} /></div></span>
                  <span>{ingredient.minStock.toLocaleString("en-US")} {ingredient.unit}</span>
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
                <b>{movement.type === "consume" || movement.type === "waste" ? "-" : "+"}{movement.quantity.toLocaleString("en-US")}</b>
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

function recipeRecord(recipes: RecipeItem[], productId: string) {
  return Object.fromEntries(recipes.filter((item) => item.productId === productId).map((item) => [item.ingredientId, item.quantity]));
}
