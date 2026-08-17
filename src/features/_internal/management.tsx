// Internal implementation. Consume it through the public feature index files.
import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeDollarSign, Boxes, Check, ChevronLeft, ClipboardList, CookingPot, DatabaseBackup, Edit3, ImagePlus,
  MapPin, Minus, Network, PackagePlus, Phone, Plus, Printer, ReceiptText, RefreshCw, Save, Search, Server,
  ShoppingBasket, SlidersHorizontal, Store, Trash2, UserPlus, Users, Headphones, MessageSquare, ShieldCheck,
  PhoneCall, ExternalLink, Clock, Download, KeyRound, Copy, CheckCircle2
  , Monitor
} from "lucide-react";
import type {
  AppState, Customer, Meal, MenuSection, Order, Product, ProductCategory, ProductSection, LicenseInfo
} from "../../domain/types";
import type { ViewProps } from "../../shared/contracts";
import { money, orderDisplayNumber, shortDate, stageLabels } from "../../shared/format";
import { uid } from "../../shared/id";
import { evaluateLicense, getMachineId, verifyLicenseKey } from "../../shared/license";
import { Empty, Modal, WorkspaceSectionHeader } from "../../shared/ui";
import { BackupPanel } from "../settings/BackupPanel";
import { UpdatePanel } from "../settings/UpdatePanel";
import { InvoiceModal } from "../orders/InvoiceModal";
import {
  getDeviceRole, setDeviceRole as saveDeviceRole, testServerConnection, type DeviceRole
} from "../../infrastructure/dataClient";
import {
  errorMessage, isDesktopRuntime, listDesktopPrinters, printTestReceipt, type PrinterInfo
} from "../../infrastructure/desktopPrinting";

const emptyProduct = (category?: ProductCategory, section: ProductSection = "cooked"): Product => ({
  id: uid(), name: "", category: category?.name ?? "", section: category?.section ?? section,
  unit: "طبق", price: 0, cost: 0, available: true, accent: category?.color ?? "#6f927d"
});

const MEALS_SECTION = "__meals";

interface CatalogTableHeaderProps {
  title: string;
  subtitle: string;
  addLabel: string;
  addIcon: ReactNode;
  onAdd: () => void;
  onManageSections: () => void;
  onManageCategories: () => void;
  extraAction?: ReactNode;
}

function CatalogTableHeader({
  title, subtitle, addLabel, addIcon, onAdd, onManageSections, onManageCategories, extraAction
}: CatalogTableHeaderProps) {
  return <WorkspaceSectionHeader title={title} subtitle={subtitle} className="products-admin-head catalog-table-header" actions={<>
      {extraAction}
      <button className="soft-button" onClick={onManageSections}><SlidersHorizontal /> إدارة الأقسام</button>
      <button className="soft-button" onClick={onManageCategories}><Boxes /> إدارة التصنيفات</button>
      <button className="primary-button compact" onClick={onAdd}>{addIcon} {addLabel}</button>
    </>} />;
}

export function ProductCatalogView({ state, update, notify }: ViewProps) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [mealsOpen, setMealsOpen] = useState(false);
  const [mealToEdit, setMealToEdit] = useState<Meal | null>(null);
  const [mealToDelete, setMealToDelete] = useState<Meal | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [section, setSection] = useState<ProductSection>(() => state.sections[0]?.id ?? "cooked");
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [search, setSearch] = useState("");
  const [draftPrices, setDraftPrices] = useState<Record<string, number>>({});
  const [draftOptionPrices, setDraftOptionPrices] = useState<Record<string, number>>({});
  useEffect(() => {
    if (section !== MEALS_SECTION && !state.sections.some((item) => item.id === section)) {
      setSection(state.sections[0]?.id ?? MEALS_SECTION);
      setCategoryFilter("الكل");
    }
  }, [section, state.sections]);
  const sectionProducts = state.products.filter((product) => product.section === section);
  const sectionCategories = ["الكل", ...new Set(sectionProducts.map((product) => product.category))];
  const products = state.products.filter((product) =>
    product.section === section
    && (categoryFilter === "الكل" || product.category === categoryFilter)
    && product.name.includes(search.trim())
  );
  const changedPrices = Object.entries(draftPrices).filter(([id, price]) => {
    const product = state.products.find((item) => item.id === id);
    return product && !product.options?.length && price >= 0 && price !== product.price;
  });
  const changedOptionPrices = Object.entries(draftOptionPrices).filter(([key, price]) => {
    const [productId, optionId] = key.split(":");
    const option = state.products.find((item) => item.id === productId)?.options?.find((item) => item.id === optionId);
    return option && price >= 0 && price !== option.price;
  });
  const priceChangesCount = changedPrices.length + changedOptionPrices.length;
  const savePriceChanges = () => {
    if (!priceChangesCount) return;
    const prices = new Map(changedPrices);
    const optionPrices = new Map(changedOptionPrices);
    update((current) => ({
      ...current,
      products: current.products.map((product) => ({
        ...product,
        price: prices.has(product.id) ? Number(prices.get(product.id)) : product.price,
        options: product.options?.map((option) => {
          const price = optionPrices.get(`${product.id}:${option.id}`);
          return price === undefined ? option : { ...option, price: Number(price) };
        })
      }))
    }));
    setDraftPrices({});
    setDraftOptionPrices({});
    notify(`تم حفظ ${priceChangesCount} تحديث في الأسعار`);
  };
  const saveProduct = () => {
    if (!editing?.name.trim() || !editing.category || !editing.unit || editing.price < 0 || editing.cost < 0
      || editing.options?.some((option) => !option.name.trim() || !option.unit.trim() || option.price < 0 || option.cost < 0 || option.recipeMultiplier <= 0)) return;
    const productToSave = editing.options?.length
      ? { ...editing, price: Math.min(...editing.options.map((option) => option.price)) }
      : editing;
    update((current) => ({
      ...current,
      products: current.products.some((item) => item.id === editing.id)
        ? current.products.map((item) => item.id === editing.id ? productToSave : item)
        : [productToSave, ...current.products]
    }));
    setDraftPrices((current) => {
      const next = { ...current };
      delete next[editing.id];
      return next;
    });
    setDraftOptionPrices((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${editing.id}:`))));
    setEditing(null);
    notify("تم حفظ الصنف");
  };
  const selectProductImage = (file?: File) => {
    if (!file || !editing) return;
    if (!file.type.startsWith("image/")) {
      notify("اختار ملف صورة صالح");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify("حجم الصورة يجب ألا يتجاوز 2 ميجابايت");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setEditing((current) => current ? { ...current, imageDataUrl: String(reader.result) } : current);
    reader.readAsDataURL(file);
  };
  const toggle = (id: string) => update((current) => ({
    ...current, products: current.products.map((product) => product.id === id ? { ...product, available: !product.available } : product)
  }));
  const categories = state.categories.filter((item) => item.active && (!editing || item.section === editing.section));

  const activeSection = state.sections.find((item) => item.id === section) ?? state.sections[0];
  const availableCount = sectionProducts.filter((item) => item.available).length;
  const visibleMeals = state.meals.filter((meal) =>
    meal.name.includes(search.trim()) ||
    meal.components.some((item) => item.name.includes(search.trim()) || (item.optionName && item.optionName.includes(search.trim())))
  );
  const mealStandaloneTotal = (meal: Meal) => meal.components.reduce((sum, component) => {
    const product = state.products.find((p) => p.id === component.productId);
    const option = component.optionId ? product?.options?.find((opt) => opt.id === component.optionId) : null;
    const price = option?.price ?? component.price ?? product?.price ?? 0;
    return sum + price * component.quantity;
  }, 0);

  return <div className="management-page products-admin-page">
    <div className="products-menu-switch">
      {state.sections.map((item, index) => {
        const available = state.products.filter((product) => product.section === item.id && product.available).length;
        return <button className={section === item.id ? `active ${index % 2 ? "fresh" : "cooked"}` : ""} onClick={() => { setSection(item.id); setCategoryFilter("الكل"); }} key={item.id}>
          <span>{index % 2 ? <ShoppingBasket /> : <CookingPot />}</span><div><strong>{item.name}</strong></div><b>{available} متاح</b>
        </button>;
      })}
      <button className={section === MEALS_SECTION ? "meals-menu-shortcut active" : "meals-menu-shortcut"} onClick={() => { setSection(MEALS_SECTION); setCategoryFilter("الكل"); setSearch(""); }}>
        <span><ShoppingBasket /></span>
        <div><strong>الوجبات</strong></div>
        <b>{state.meals.filter((meal) => meal.available).length} متاح</b>
      </button>
    </div>

    {section === MEALS_SECTION ? <div className="panel products-admin-panel meals-admin-panel">
      <CatalogTableHeader
        title="إدارة الوجبات"
        subtitle={`${state.meals.filter((meal) => meal.available).length} وجبة متاحة من إجمالي ${state.meals.length}`}
        addLabel="إضافة وجبة"
        addIcon={<Plus />}
        onAdd={() => { setMealToEdit(null); setMealsOpen(true); }}
        onManageSections={() => setSectionsOpen(true)}
        onManageCategories={() => setCategoriesOpen(true)}
      />
      <div className="products-admin-toolbar meals-admin-toolbar">
        <label className="search-box"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الوجبة أو أحد مكوناتها..." /></label>
        <span className="meals-business-hint"><ShoppingBasket /><span><strong>سعر مستقل للوجبة</strong><small>المكونات تُخصم تلقائيًا من المخزون عند البيع</small></span></span>
      </div>
      <div className="meal-management-table">
        <div className="meal-manage-table-head"><span>الوجبة</span><span>المكونات</span><span>سعر الأصناف منفردة</span><span>سعر الوجبة</span><span className="meal-actions-heading">الإجراءات</span></div>
        {visibleMeals.map((meal) => <div className={meal.available ? "meal-manage-row" : "meal-manage-row unavailable"} key={meal.id}>
          <div className="meal-admin-name"><span><ShoppingBasket /></span><div><strong>{meal.name}</strong></div></div>
          <div className="meal-admin-components">{meal.components.map((component) => <span key={`${component.productId}:${component.optionId ?? "base"}`}><b>{component.quantity}×</b> {component.name}{component.optionName ? ` (${component.optionName})` : ""}</span>)}</div>
          <span className="meal-standalone-price"><b>{money(mealStandaloneTotal(meal))}</b></span>
          <span className="meal-selling-price"><b>{money(meal.price)}</b>{mealStandaloneTotal(meal) > meal.price && <em>توفير {money(mealStandaloneTotal(meal) - meal.price)}</em>}</span>
          <div className="product-row-actions">
            <button className="product-icon-action edit" type="button" title="تعديل الوجبة" aria-label={`تعديل وجبة ${meal.name}`} onClick={() => { setMealToEdit({ ...meal, components: meal.components.map((item) => ({ ...item })) }); setMealsOpen(true); }}><Edit3 /></button>
            <button className={meal.available ? "product-icon-action availability active" : "product-icon-action availability"} type="button" title={meal.available ? "إيقاف الوجبة" : "إتاحة الوجبة"} aria-label={meal.available ? `إيقاف وجبة ${meal.name}` : `إتاحة وجبة ${meal.name}`} onClick={() => update((current) => ({ ...current, meals: current.meals.map((item) => item.id === meal.id ? { ...item, available: !item.available } : item) }))}>{meal.available ? <CheckCircle2 /> : <Minus />}</button>
            <button className="product-icon-action delete" type="button" title="حذف الوجبة" aria-label={`حذف وجبة ${meal.name}`} onClick={() => setMealToDelete(meal)}><Trash2 /></button>
          </div>
        </div>)}
        {!visibleMeals.length && <Empty icon={<ShoppingBasket />} title={search ? "لا توجد وجبات مطابقة" : "لا توجد وجبات حتى الآن"} text={search ? "جرّب اسمًا آخر أو ابحث باسم أحد المكونات" : "اضغط إضافة وجبة وابدأ بتكوينها من الأصناف"} />}
      </div>
    </div> : <div className="panel products-admin-panel">
      <CatalogTableHeader
        title={`أصناف قسم ${activeSection?.name ?? "المنيو"}`}
        subtitle={`${availableCount} صنف متاح من إجمالي ${sectionProducts.length}`}
        addLabel="إضافة صنف"
        addIcon={<PackagePlus />}
        onAdd={() => setEditing(emptyProduct(state.categories.find((item) => item.section === section && item.active), section))}
        onManageSections={() => setSectionsOpen(true)}
        onManageCategories={() => setCategoriesOpen(true)}
        extraAction={<button className="save-price-changes" disabled={!priceChangesCount} onClick={savePriceChanges}><Check /> حفظ تغييرات الأسعار {priceChangesCount > 0 && <b>{priceChangesCount}</b>}</button>}
      />
      <div className="products-admin-toolbar">
        <label className="search-box"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`ابحث في قسم ${activeSection?.name ?? "المنيو"}...`} /></label>
        <div className="products-category-filter">
          {sectionCategories.map((item) => <button key={item} className={categoryFilter === item ? "active" : ""} onClick={() => setCategoryFilter(item)}>{item}</button>)}
        </div>
      </div>
      <div className="product-management">
        <div className="product-manage-table-head product-catalog-table-grid"><span>الصنف</span><span>التصنيف</span><span>الوحدة</span><span>التكلفة</span><span>سعر البيع السريع</span><span className="product-actions-heading">الإجراءات</span></div>
        {products.map((product) => <div className={product.available ? "product-manage-row editable product-catalog-table-grid" : "product-manage-row editable unavailable product-catalog-table-grid"} key={product.id}>
          <div className="product-admin-name"><span className="product-admin-icon" style={{ background: `${product.accent}24`, color: product.accent }}>{product.imageDataUrl ? <img src={product.imageDataUrl} alt="" /> : <CookingPot />}</span><span><strong>{product.name}</strong></span></div>
          <span className="product-admin-category"><b>{product.category || "بدون تصنيف"}</b></span>
          <span className="product-admin-units"><b>{product.unit}</b></span>
          <span className="product-admin-cost"><b>{money(product.cost)}</b></span>
          {product.options?.length ? <div style={{ display: "flex", gap: "6px", alignItems: "center", overflowX: "auto" }}>
            {product.options.map((option) => {
              const key = `${product.id}:${option.id}`;
              const value = draftOptionPrices[key] ?? option.price;
              const isChanged = value !== option.price;
              return <label key={option.id} className={isChanged ? "quick-price changed" : "quick-price"} style={{ display: "flex", flexDirection: "row", alignItems: "center", minHeight: "34px", height: "34px", margin: 0, borderRadius: "7px", overflow: "hidden" }}>
                <input type="number" min="0" value={value} onChange={(event) => setDraftOptionPrices({ ...draftOptionPrices, [key]: Number(event.target.value) })} onKeyDown={(event) => event.key === "Enter" && savePriceChanges()} style={{ width: "46px", height: "34px", textAlign: "center", padding: "0 4px", fontSize: "12px", fontWeight: 700, border: 0, outline: 0 }} />
                <span style={{ height: "34px", display: "grid", placeItems: "center", padding: "0 6px", fontSize: "9px", fontWeight: 700, background: "#f1f4f1", color: "#47534c", whiteSpace: "nowrap" }}>{option.name}</span>
              </label>;
            })}
          </div> : <label className={draftPrices[product.id] !== undefined && draftPrices[product.id] !== product.price ? "quick-price changed" : "quick-price"}>
            <input type="number" min="0" value={draftPrices[product.id] ?? product.price} onChange={(event) => setDraftPrices({ ...draftPrices, [product.id]: Number(event.target.value) })} onKeyDown={(event) => event.key === "Enter" && savePriceChanges()} />
            <span>سعر البيع</span>
          </label>}
          <div className="product-row-actions">
            <button className="product-icon-action edit" type="button" title="تعديل الصنف" aria-label={`تعديل صنف ${product.name}`} onClick={() => setEditing({ ...product, options: product.options?.map((option) => ({ ...option })) })}><Edit3 /></button>
            <button className={product.available ? "product-icon-action availability active" : "product-icon-action availability"} type="button" title={product.available ? "إيقاف الصنف" : "إتاحة الصنف"} aria-label={product.available ? `إيقاف صنف ${product.name}` : `إتاحة صنف ${product.name}`} onClick={() => toggle(product.id)}>{product.available ? <CheckCircle2 /> : <Minus />}</button>
            <button className="product-icon-action delete" type="button" title="حذف الصنف" aria-label={`حذف صنف ${product.name}`} onClick={() => setProductToDelete(product)}><Trash2 /></button>
          </div>
        </div>)}
        {!products.length && <Empty icon={<Search />} title="لا توجد أصناف مطابقة" text="غيّر البحث أو اختر تصنيفًا آخر" />}
      </div>
    </div>}

    {editing && <Modal title={state.products.some((item) => item.id === editing.id) ? "تعديل الصنف" : "إضافة صنف"} onClose={() => setEditing(null)} size="wide">
      <div className="product-editor-layout">
        <aside className="product-image-editor">
          <label className={editing.imageDataUrl ? "product-image-upload has-image" : "product-image-upload"}>
            {editing.imageDataUrl ? <img src={editing.imageDataUrl} alt={`صورة ${editing.name || "الصنف"}`} /> : <><span><ImagePlus /></span><strong>صورة المنتج</strong><small>اضغط لاختيار صورة</small></>}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectProductImage(event.target.files?.[0])} />
          </label>
          {editing.imageDataUrl && <button type="button" className="remove-product-image" onClick={() => setEditing({ ...editing, imageDataUrl: undefined })}><Trash2 /> حذف الصورة</button>}
          <label className={editing.available ? "product-availability-toggle active" : "product-availability-toggle"}>
            <input
              type="checkbox"
              checked={editing.available}
              onChange={(event) => setEditing({ ...editing, available: event.target.checked })}
            />
            <span className="toggle-switch-slider">
              <span className="toggle-switch-thumb" />
            </span>
            <div className="toggle-switch-label">
              <strong>متاح للبيع</strong>
              <small>{editing.available ? "يظهر في نقطة البيع" : "متوقف مؤقتاً"}</small>
            </div>
          </label>
        </aside>
        <section className="product-editor-main">
          <div className="product-editor-heading">
            <span><Edit3 /></span>
            <div><strong>البيانات الأساسية</strong></div>
          </div>
          <div className="editor-grid product-editor-fields">
            <label>اسم الصنف<input autoFocus value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="مثال: بيتزا بالفراخ" /></label>
            <label>القسم<select value={editing.section} onChange={(event) => {
              const next = event.target.value as ProductSection;
              const first = state.categories.find((item) => item.section === next && item.active);
              setEditing({ ...editing, section: next, category: first?.name ?? "" });
            }}>{state.sections.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label>التصنيف<select value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })}>
              <option value="">اختر التصنيف</option>{categories.map((item) => <option key={item.id}>{item.name}</option>)}
            </select></label>
            <label>وحدة البيع<input value={editing.unit} onChange={(event) => setEditing({ ...editing, unit: event.target.value })} placeholder="طبق، كيلو، صينية..." /></label>
            {!editing.options?.length && <label>سعر البيع<input type="number" min="0" value={editing.price || ""} onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })} /></label>}
            {!!editing.options?.length && <div className="option-managed-price-note"><BadgeDollarSign /><span><strong>السعر حسب المقاس</strong><small>عدّل سعر كل مقاس من الجدول بالأسفل</small></span></div>}
            <label>التكلفة<input type="number" min="0" value={editing.cost || ""} onChange={(event) => setEditing({ ...editing, cost: Number(event.target.value) })} /></label>
          </div>
        </section>
      </div>
      <section className="product-options-editor">
        <header>
          <div><strong>المقاسات وخيارات البيع</strong></div>
          <button type="button" className="soft-button" onClick={() => setEditing({
            ...editing,
            options: [...(editing.options ?? []), {
              id: uid(), name: "", unit: editing.unit || "وحدة", price: editing.price, cost: editing.cost, recipeMultiplier: 1
            }]
          })}><Plus /> إضافة مقاس</button>
        </header>
        {!!editing.options?.length && <div className="product-options-table">
          <div className="product-options-head"><span>اسم المقاس</span><span>وحدة البيع</span><span>سعر البيع</span><span>التكلفة</span><span>معامل الوصفة</span><span /></div>
          {editing.options.map((option) => <div className="product-option-row" key={option.id}>
            <input value={option.name} placeholder="مثال: لارج" onChange={(event) => setEditing({ ...editing, options: editing.options?.map((item) => item.id === option.id ? { ...item, name: event.target.value } : item) })} />
            <input value={option.unit} placeholder="صينية / كيلو" onChange={(event) => setEditing({ ...editing, options: editing.options?.map((item) => item.id === option.id ? { ...item, unit: event.target.value } : item) })} />
            <input type="number" min="0" value={option.price || ""} onChange={(event) => setEditing({ ...editing, options: editing.options?.map((item) => item.id === option.id ? { ...item, price: Number(event.target.value) } : item) })} />
            <input type="number" min="0" value={option.cost || ""} onChange={(event) => setEditing({ ...editing, options: editing.options?.map((item) => item.id === option.id ? { ...item, cost: Number(event.target.value) } : item) })} />
            <input type="number" min="0.01" step="0.01" value={option.recipeMultiplier || ""} title="يضاعف كميات مكونات الوصفة بهذا الرقم" onChange={(event) => setEditing({ ...editing, options: editing.options?.map((item) => item.id === option.id ? { ...item, recipeMultiplier: Number(event.target.value) } : item) })} />
            <button type="button" title="حذف المقاس" onClick={() => setEditing({ ...editing, options: editing.options?.filter((item) => item.id !== option.id) })}><Trash2 /></button>
          </div>)}
        </div>}
        {!editing.options?.length && <div className="product-options-empty">الصنف يستخدم وحدة وسعر البيع الأساسيين حاليًا.</div>}
      </section>
      <button className="primary-button modal-save" onClick={saveProduct}><Save /> حفظ الصنف</button>
    </Modal>}
    {categoriesOpen && <CategoryManager state={state} update={update} notify={notify} onClose={() => setCategoriesOpen(false)} />}
    {sectionsOpen && <SectionManager state={state} update={update} notify={notify} onClose={() => setSectionsOpen(false)} />}
    {mealsOpen && <MealManager state={state} update={update} notify={notify} initialMeal={mealToEdit} onClose={() => { setMealsOpen(false); setMealToEdit(null); }} />}
    {mealToDelete && <Modal title="تأكيد حذف الوجبة" onClose={() => setMealToDelete(null)}>
      <div className="delete-order-confirm">
        <span className="delete-order-icon"><Trash2 /></span>
        <strong>هل تريد حذف الوجبة «{mealToDelete.name}»؟</strong>
        <p>سيتم حذف الوجبة نهائيًا من قائمة الوجبات المتاحة في نقطة البيع.</p>
        <div>
          <span>سعر الوجبة <b>{money(mealToDelete.price)} ج.م</b></span>
          <span>عدد الأصناف المكوّنة <b>{mealToDelete.components.length} صنف</b></span>
          <span>مجموع أسعار الأصناف منفردة <b>{money(mealStandaloneTotal(mealToDelete))} ج.م</b></span>
        </div>
        <footer>
          <button type="button" className="soft-button" onClick={() => setMealToDelete(null)}>إلغاء</button>
          <button type="button" className="delete-order-button" onClick={() => {
            update((current) => ({
              ...current,
              meals: current.meals.filter((item) => item.id !== mealToDelete.id)
            }));
            notify(`تم حذف الوجبة ${mealToDelete.name}`);
            setMealToDelete(null);
          }}><Trash2 /> تأكيد حذف الوجبة</button>
        </footer>
      </div>
    </Modal>}
    {productToDelete && <Modal title="تأكيد حذف الصنف" onClose={() => setProductToDelete(null)}>
      <div className="delete-order-confirm">
        <span className="delete-order-icon"><Trash2 /></span>
        <strong>هل تريد حذف الصنف «{productToDelete.name}»؟</strong>
        <p>سيتم حذف الصنف نهائيًا من المنيو وقائمة المبيعات.</p>
        <div>
          <span>القسم <b>{state.sections.find((item) => item.id === productToDelete.section)?.name ?? productToDelete.section}</b></span>
          <span>التصنيف <b>{productToDelete.category || "بدون تصنيف"}</b></span>
          <span>السعر <b>{productToDelete.options?.length ? `${productToDelete.options.length} مقاسات` : `${money(productToDelete.price)} ج.م / ${productToDelete.unit}`}</b></span>
          <span>التكلفة <b>{money(productToDelete.cost)} ج.م</b></span>
        </div>
        <footer>
          <button type="button" className="soft-button" onClick={() => setProductToDelete(null)}>إلغاء</button>
          <button type="button" className="delete-order-button" onClick={() => {
            update((current) => ({
              ...current,
              products: current.products.filter((item) => item.id !== productToDelete.id)
            }));
            if (editing?.id === productToDelete.id) {
              setEditing(null);
            }
            notify(`تم حذف الصنف ${productToDelete.name}`);
            setProductToDelete(null);
          }}><Trash2 /> تأكيد حذف الصنف</button>
        </footer>
      </div>
    </Modal>}
  </div>;
}

function CategoryManager({ state, update, notify, onClose }: ViewProps & { onClose: () => void }) {
  const firstSection = state.sections[0]?.id ?? "cooked";
  const [form, setForm] = useState<Omit<ProductCategory, "id">>({ name: "", section: firstSection, color: "#6f927d", active: true });
  const [editingId, setEditingId] = useState("");
  const [sectionFilter, setSectionFilter] = useState<ProductSection>(firstSection);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);
  const visibleCategories = state.categories.filter((category) =>
    category.section === sectionFilter && category.name.includes(search.trim())
  );
  const resetForm = (section = sectionFilter) => {
    setEditingId("");
    setForm({ name: "", section, color: state.sections.findIndex((item) => item.id === section) % 2 ? "#c58d5b" : "#6f927d", active: true });
  };
  const add = () => {
    if (!form.name.trim()) return;
    if (state.categories.some((item) => item.id !== editingId && item.name === form.name.trim() && item.section === form.section)) {
      notify("التصنيف موجود بالفعل"); return;
    }
    update((current) => {
      const previous = current.categories.find((item) => item.id === editingId);
      return {
        ...current,
        categories: editingId
          ? current.categories.map((item) => item.id === editingId ? { id: editingId, ...form, name: form.name.trim() } : item)
          : [...current.categories, { id: uid(), ...form, name: form.name.trim() }],
        products: previous ? current.products.map((product) =>
          product.section === previous.section && product.category === previous.name
            ? { ...product, category: form.name.trim(), section: form.section }
            : product
        ) : current.products
      };
    });
    resetForm(form.section);
    setSectionFilter(form.section);
    notify(editingId ? "تم تعديل التصنيف وتحديث أصنافه" : "تمت إضافة التصنيف");
  };
  return <>
    <Modal title="إدارة التصنيفات" onClose={onClose} size="wide">
    <div className="category-manager">
      <div className="category-section-switch">
        {state.sections.map((item, index) => <button className={sectionFilter === item.id ? `active ${index % 2 ? "fresh" : ""}` : ""} onClick={() => { setSectionFilter(item.id); resetForm(item.id); }} key={item.id}>{index % 2 ? <ShoppingBasket /> : <CookingPot />}<span><strong>{item.name}</strong><small>{state.categories.filter((category) => category.section === item.id).length} تصنيف</small></span></button>)}
      </div>
      <div className={editingId ? "category-form editing" : "category-form"}>
        <div className="category-form-title"><span>{editingId ? <Edit3 /> : <Plus />}</span><div><strong>{editingId ? "تعديل التصنيف" : "إضافة تصنيف جديد"}</strong></div></div>
        <label><span>اسم التصنيف</span><div><Boxes /><input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} onKeyDown={(event) => event.key === "Enter" && add()} placeholder="مثال: حواوشي، فراخ، مجمدات..." /></div></label>
        <div className="category-form-actions">
          {editingId && <button className="soft-button" onClick={() => resetForm()}>إلغاء التعديل</button>}
          <button className="primary-button" disabled={!form.name.trim()} onClick={add}>{editingId ? <Save /> : <Plus />} {editingId ? "حفظ التعديل" : "إضافة التصنيف"}</button>
        </div>
      </div>
      <div className="category-list-head">
        <div><strong>تصنيفات {state.sections.find((item) => item.id === sectionFilter)?.name ?? "القسم"}</strong><small>{visibleCategories.length} نتيجة</small></div>
        <label className="search-box"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن تصنيف..." /></label>
      </div>
      <div className="category-manager-list">{visibleCategories.map((category) => {
        const productsCount = state.products.filter((product) => product.section === category.section && product.category === category.name).length;
        return <div className={category.active ? "" : "inactive"} key={category.id}>
      <span className="category-list-icon">{state.sections.findIndex((item) => item.id === category.section) % 2 ? <ShoppingBasket /> : <CookingPot />}</span>
      <span><strong>{category.name}</strong><small>{productsCount ? `${productsCount} صنف مرتبط` : "لا توجد أصناف مرتبطة"}</small></span>
      <em className={category.active ? "active" : ""}>{category.active ? "نشط" : "متوقف"}</em>
      <div className="category-row-actions">
        <button className="category-icon-action edit" type="button" title="تعديل التصنيف" aria-label={`تعديل تصنيف ${category.name}`} onClick={() => {
          setEditingId(category.id);
          setForm({ name: category.name, section: category.section, color: category.color, active: category.active });
        }}><Edit3 /></button>
        <button className={category.active ? "category-icon-action availability active" : "category-icon-action availability"} type="button" title={category.active ? "إيقاف التصنيف" : "تفعيل التصنيف"} aria-label={category.active ? `إيقاف تصنيف ${category.name}` : `تفعيل تصنيف ${category.name}`} onClick={() => update((current) => ({
          ...current, categories: current.categories.map((item) => item.id === category.id ? { ...item, active: !item.active } : item)
        }))}>{category.active ? <CheckCircle2 /> : <Minus />}</button>
        <button className="category-icon-action delete" type="button" title="حذف التصنيف" aria-label={`حذف تصنيف ${category.name}`} onClick={() => setDeleteTarget(category)}><Trash2 /></button>
      </div>
    </div>;
      })}
      {!visibleCategories.length && <Empty icon={<Boxes />} title="لا توجد تصنيفات" text="أضف تصنيفًا جديدًا أو غيّر كلمة البحث" />}
    </div>
    </div>
  </Modal>
  {deleteTarget && <Modal title="تأكيد حذف التصنيف" onClose={() => setDeleteTarget(null)}>
    <div className="delete-order-confirm">
      <span className="delete-order-icon"><Trash2 /></span>
      <strong>هل تريد حذف تصنيف «{deleteTarget.name}»؟</strong>
      <p>سيتم حذف التصنيف من قائمة التصنيفات التابعة للقسم.</p>
      <div>
        <span>القسم <b>{state.sections.find((item) => item.id === deleteTarget.section)?.name ?? deleteTarget.section}</b></span>
        <span>الأصناف المرتبطة <b>{state.products.filter((product) => product.section === deleteTarget.section && product.category === deleteTarget.name).length} صنف</b></span>
      </div>
      <footer>
        <button type="button" className="soft-button" onClick={() => setDeleteTarget(null)}>إلغاء</button>
        <button type="button" className="delete-order-button" onClick={() => {
          update((current) => ({
            ...current,
            categories: current.categories.filter((item) => item.id !== deleteTarget.id)
          }));
          notify(`تم حذف التصنيف ${deleteTarget.name}`);
          setDeleteTarget(null);
        }}><Trash2 /> تأكيد حذف التصنيف</button>
      </footer>
    </div>
  </Modal>}
  </>;
}

function SectionManager({ state, update, notify, onClose }: ViewProps & { onClose: () => void }) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<ProductSection>("");
  const [deleteTarget, setDeleteTarget] = useState<MenuSection | null>(null);
  const reset = () => { setName(""); setEditingId(""); };
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (state.sections.some((item) => item.id !== editingId && item.name === trimmed)) {
      notify("اسم القسم موجود بالفعل");
      return;
    }
    update((current) => ({
      ...current,
      sections: editingId
        ? current.sections.map((item) => item.id === editingId ? { ...item, name: trimmed } : item)
        : [...current.sections, { id: uid(), name: trimmed } satisfies MenuSection]
    }));
    notify(editingId ? "تم تعديل اسم القسم" : "تمت إضافة القسم");
    reset();
  };
  const confirmDelete = () => {
    if (!deleteTarget || state.sections.length <= 1) return;
    const sectionId = deleteTarget.id;
    const sectionName = deleteTarget.name;
    update((current) => {
      const removedProductIds = new Set(
        current.products.filter((product) => product.section === sectionId).map((product) => product.id)
      );
      return {
        ...current,
        sections: current.sections.filter((section) => section.id !== sectionId),
        categories: current.categories.filter((category) => category.section !== sectionId),
        products: current.products.filter((product) => product.section !== sectionId),
        recipes: current.recipes.filter((recipe) => !removedProductIds.has(recipe.productId)),
        meals: current.meals.map((meal) => ({
          ...meal,
          components: meal.components.filter((component) => !removedProductIds.has(component.productId))
        }))
      };
    });
    if (editingId === sectionId) reset();
    setDeleteTarget(null);
    notify(`تم حذف قسم ${sectionName}`);
  };
  const deleteProductsCount = deleteTarget
    ? state.products.filter((product) => product.section === deleteTarget.id).length
    : 0;
  const deleteCategoriesCount = deleteTarget
    ? state.categories.filter((category) => category.section === deleteTarget.id).length
    : 0;
  return <>
  <Modal title="إدارة الأقسام" onClose={onClose} size="medium">
    <div className="section-manager">
      <div className={editingId ? "category-form editing section-form" : "category-form section-form"}>
        <div className="category-form-title"><span>{editingId ? <Edit3 /> : <Plus />}</span><div><strong>{editingId ? "تعديل اسم القسم" : "إضافة قسم جديد"}</strong></div></div>
        <label><span>اسم القسم</span><div><Boxes /><input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && save()} placeholder="مثال: حلويات، مشروبات..." /></div></label>
        <div className="category-form-actions">
          {editingId && <button className="soft-button" onClick={reset}>إلغاء التعديل</button>}
          <button className="primary-button" disabled={!name.trim()} onClick={save}>{editingId ? <Save /> : <Plus />} {editingId ? "حفظ الاسم" : "إضافة القسم"}</button>
        </div>
      </div>
      <div className="section-manager-list">
        {state.sections.map((item, index) => {
          const productsCount = state.products.filter((product) => product.section === item.id).length;
          const categoriesCount = state.categories.filter((category) => category.section === item.id).length;
          return <div key={item.id}>
            <span className="category-list-icon">{index % 2 ? <ShoppingBasket /> : <CookingPot />}</span>
            <span><strong>{item.name}</strong><small>{productsCount} صنف · {categoriesCount} تصنيف</small></span>
            <button className="category-edit-action" onClick={() => { setEditingId(item.id); setName(item.name); }}><Edit3 /> تعديل الاسم</button>
            <button
              type="button"
              className="section-delete-action"
              disabled={state.sections.length <= 1}
              title={state.sections.length <= 1 ? "لا يمكن حذف آخر قسم" : `حذف قسم ${item.name}`}
              onClick={() => setDeleteTarget(item)}
            ><Trash2 /> حذف</button>
          </div>;
        })}
      </div>
    </div>
  </Modal>
  {deleteTarget && <Modal title="تأكيد حذف القسم" onClose={() => setDeleteTarget(null)}>
    <div className="section-delete-confirm">
      <span><Trash2 /></span>
      <strong>هل تريد حذف قسم «{deleteTarget.name}»؟</strong>
      <p>لا يمكن التراجع عن هذا الإجراء. سيتم حذف القسم وكل البيانات التابعة له من المنيو.</p>
      <div>
        <span><small>الأصناف التي سيتم حذفها</small><b>{deleteProductsCount}</b></span>
        <span><small>التصنيفات التي سيتم حذفها</small><b>{deleteCategoriesCount}</b></span>
      </div>
      <footer>
        <button type="button" className="soft-button" onClick={() => setDeleteTarget(null)}>إلغاء</button>
        <button type="button" className="section-delete-confirm-button" onClick={confirmDelete}><Trash2 /> نعم، حذف القسم</button>
      </footer>
    </div>
  </Modal>}
  </>;
}
function MealManager({ state, update, notify, initialMeal, onClose }: ViewProps & { initialMeal: Meal | null; onClose: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState<Meal>(() => initialMeal
    ? { ...initialMeal, components: initialMeal.components.map((item) => ({ ...item })) }
    : { id: uid(), name: "", price: 0, available: true, components: [] });
  const [productSearch, setProductSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [mealCategoryFilter, setMealCategoryFilter] = useState("all");
  const [selectedOptionByProduct, setSelectedOptionByProduct] = useState<Record<string, string>>({});

  const selected = (productId: string) => draft.components.find((item) => item.productId === productId);

  const getActiveOption = (product: Product) => {
    if (!product.options?.length) return undefined;
    const comp = selected(product.id);
    const optId = comp?.optionId ?? selectedOptionByProduct[product.id] ?? product.options[0]?.id;
    return product.options.find((opt) => opt.id === optId) ?? product.options[0];
  };

  const toggleProduct = (product: Product) => {
    const exists = selected(product.id);
    if (exists) {
      setDraft({
        ...draft,
        components: draft.components.filter((item) => item.productId !== product.id)
      });
    } else {
      const activeOption = getActiveOption(product);
      setDraft({
        ...draft,
        components: [
          ...draft.components,
          {
            productId: product.id,
            optionId: activeOption?.id,
            optionName: activeOption?.name,
            name: product.name,
            unit: activeOption?.unit ?? product.unit,
            price: activeOption?.price ?? product.price,
            cost: activeOption?.cost ?? product.cost,
            recipeMultiplier: activeOption?.recipeMultiplier ?? 1,
            quantity: 1
          }
        ]
      });
    }
  };

  const handleOptionChange = (product: Product, newOptionId: string) => {
    setSelectedOptionByProduct((prev) => ({ ...prev, [product.id]: newOptionId }));
    const exists = selected(product.id);
    if (exists && product.options?.length) {
      const newOption = product.options.find((opt) => opt.id === newOptionId);
      setDraft({
        ...draft,
        components: draft.components.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                optionId: newOption?.id,
                optionName: newOption?.name,
                unit: newOption?.unit ?? product.unit,
                price: newOption?.price ?? product.price,
                cost: newOption?.cost ?? product.cost,
                recipeMultiplier: newOption?.recipeMultiplier ?? 1
              }
            : item
        )
      });
    }
  };

  const changeQuantity = (productId: string, quantity: number) => {
    setDraft({
      ...draft,
      components: draft.components.map((item) =>
        item.productId === productId ? { ...item, quantity: Math.max(1, quantity) } : item
      )
    });
  };

  const componentTotal = draft.components.reduce((sum, component) => {
    const product = state.products.find((item) => item.id === component.productId);
    const option = component.optionId ? product?.options?.find((opt) => opt.id === component.optionId) : null;
    const price = option?.price ?? component.price ?? product?.price ?? 0;
    return sum + price * component.quantity;
  }, 0);

  const availableProducts = state.products.filter((product) => product.available);
  const sectionProducts = availableProducts.filter((product) =>
    sectionFilter === "all"
    || (sectionFilter === "selected" ? Boolean(selected(product.id)) : product.section === sectionFilter)
  );
  const mealCategories = [...new Set(sectionProducts.map((product) => product.category))];
  const normalizedProductSearch = productSearch.trim().toLocaleLowerCase("ar");
  const filteredProducts = sectionProducts.filter((product) => {
    if (mealCategoryFilter !== "all" && product.category !== mealCategoryFilter) return false;
    if (!normalizedProductSearch) return true;
    const matchName = product.name.toLocaleLowerCase("ar").includes(normalizedProductSearch);
    const matchOption = product.options?.some((opt) => opt.name.toLocaleLowerCase("ar").includes(normalizedProductSearch));
    return matchName || matchOption;
  });

  const save = () => {
    if (!draft.name.trim() || draft.price < 0 || !draft.components.length) return;
    const meal = { ...draft, name: draft.name.trim() };
    update((current) => ({
      ...current,
      meals: current.meals.some((item) => item.id === meal.id)
        ? current.meals.map((item) => item.id === meal.id ? meal : item)
        : [meal, ...current.meals]
    }));
    notify(initialMeal ? "تم تعديل الوجبة" : "تمت إضافة الوجبة");
    onClose();
  };

  return <>
    <Modal title={initialMeal ? "تعديل الوجبة" : "إضافة وجبة جديدة"} onClose={onClose} size="wide">
      <div className="meal-editor-modal">
        <div className="meal-main-fields">
          <label>اسم الوجبة<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="مثال: وجبة فردية" /></label>
          <label>سعر الوجبة<input type="number" min="0" value={draft.price || ""} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label>
          <label className="check-label"><input type="checkbox" checked={draft.available} onChange={(event) => setDraft({ ...draft, available: event.target.checked })} /> متاحة للبيع</label>
        </div>
        <div className="meal-product-filters">
          <label className="search-box meal-product-search"><Search /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="ابحث عن صنف أو مقاس بالاسم..." /></label>
          <label className="meal-filter-select"><span><SlidersHorizontal /> القسم</span><select value={sectionFilter} onChange={(event) => { setSectionFilter(event.target.value); setMealCategoryFilter("all"); }}>
            <option value="all">كل الأقسام ({availableProducts.length})</option>
            {state.sections.map((section) => <option key={section.id} value={section.id}>{section.name} ({availableProducts.filter((product) => product.section === section.id).length})</option>)}
            {!!draft.components.length && <option value="selected">المختارة فقط ({draft.components.length})</option>}
          </select></label>
          <label className="meal-filter-select"><span><Boxes /> التصنيف</span><select value={mealCategoryFilter} onChange={(event) => setMealCategoryFilter(event.target.value)}>
            <option value="all">كل التصنيفات ({sectionProducts.length})</option>
            {mealCategories.map((category) => <option key={category} value={category}>{category} ({sectionProducts.filter((product) => product.category === category).length})</option>)}
          </select></label>
          <small className="meal-filter-count">عرض <b>{filteredProducts.length}</b> من {availableProducts.length}</small>
        </div>
        <div className="meal-product-picker">{filteredProducts.map((product) => {
          const component = selected(product.id);
          const hasOptions = Boolean(product.options && product.options.length > 0);
          const activeOption = getActiveOption(product);
          const currentPrice = activeOption ? activeOption.price : product.price;

          return <div className={component ? "selected" : ""} key={product.id}>
            <button type="button" className="meal-product-toggle" onClick={() => toggleProduct(product)}>
              <span>{component && <Check />}</span>
              <div className="meal-product-text-wrap">
                <div className="meal-product-name-row">
                  <strong>{product.name}</strong>
                  {hasOptions && (
                    <select
                      className="meal-product-size-select"
                      value={activeOption?.id}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleOptionChange(product, e.target.value);
                      }}
                      title="اختر المقاس"
                    >
                      {product.options!.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <small>{state.sections.find((item) => item.id === product.section)?.name ?? product.section} · {product.category}</small>
              </div>
              <b className="meal-product-price">{money(currentPrice)}</b>
            </button>
            {component && <div className="meal-quantity">
              <button type="button" onClick={() => changeQuantity(product.id, component.quantity - 1)}><Minus /></button>
              <b>{component.quantity}</b>
              <button type="button" onClick={() => changeQuantity(product.id, component.quantity + 1)}><Plus /></button>
            </div>}
          </div>;
        })}{!filteredProducts.length && <div className="meal-picker-empty"><Search /><strong>لا توجد أصناف مطابقة</strong><small>غيّر القسم أو التصنيف أو كلمة البحث</small></div>}</div>
        <div className="meal-editor-summary"><span><small>مجموع أسعار الأصناف منفردة</small><b>{money(componentTotal)}</b></span><span><small>سعر الوجبة</small><b>{money(draft.price)}</b></span><span className={componentTotal > draft.price ? "saving" : ""}><small>فرق السعر للعميل</small><b>{componentTotal > draft.price ? `توفير ${money(componentTotal - draft.price)}` : money(draft.price - componentTotal)}</b></span></div>
        <footer className="meal-editor-actions">
          {initialMeal && <button type="button" className="meal-delete-action" onClick={() => setConfirmDelete(true)}><Trash2 /> حذف الوجبة</button>}
          <button className="soft-button" onClick={onClose}>إلغاء</button>
          <button className="primary-button" disabled={!draft.name.trim() || draft.price < 0 || !draft.components.length} onClick={save}><Save /> {initialMeal ? "حفظ التعديلات" : "إضافة الوجبة"}</button>
        </footer>
      </div>
    </Modal>
    {confirmDelete && initialMeal && <Modal title="تأكيد حذف الوجبة" onClose={() => setConfirmDelete(false)}>
      <div className="delete-order-confirm">
        <span className="delete-order-icon"><Trash2 /></span>
        <strong>هل تريد حذف الوجبة «{initialMeal.name}»؟</strong>
        <p>سيتم حذف الوجبة نهائيًا من قائمة الوجبات المتاحة في نقطة البيع.</p>
        <div>
          <span>سعر الوجبة <b>{money(initialMeal.price)} ج.م</b></span>
          <span>عدد الأصناف المكوّنة <b>{initialMeal.components.length} صنف</b></span>
          <span>مجموع أسعار الأصناف منفردة <b>{money(componentTotal)} ج.م</b></span>
        </div>
        <footer>
          <button type="button" className="soft-button" onClick={() => setConfirmDelete(false)}>إلغاء</button>
          <button type="button" className="delete-order-button" onClick={() => {
            update((current) => ({
              ...current,
              meals: current.meals.filter((item) => item.id !== initialMeal.id)
            }));
            notify(`تم حذف الوجبة ${initialMeal.name}`);
            setConfirmDelete(false);
            onClose();
          }}><Trash2 /> تأكيد حذف الوجبة</button>
        </footer>
      </div>
    </Modal>}
  </>;
}

export function CustomerRecordsView({ state, update, notify, onEditOrder }: ViewProps & { onEditOrder: (order: Order) => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [adding, setAdding] = useState(false);
  const normalizedSearch = search.trim().toLocaleLowerCase("ar");
  const searchDigits = search.replace(/\D/g, "");
  const customers = state.customers.filter((customer) =>
    !normalizedSearch
    || customer.name.toLocaleLowerCase("ar").includes(normalizedSearch)
    || Boolean(searchDigits && customer.phone.replace(/\D/g, "").includes(searchDigits))
    || customer.address.toLocaleLowerCase("ar").includes(normalizedSearch)
  );
  const customerOrders = (customerId: string) => state.orders
    .filter((order) => order.customerId === customerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return <div className="customers-page">
    <div className="panel customers-panel">
      <div className="panel-head customers-head">
        <div className="customers-title"><span><Users /></span><div><strong>سجل العملاء</strong><small>{state.customers.length} عميل مسجل في النظام</small></div></div>
        <button className="primary-button compact" onClick={() => setAdding(true)}><UserPlus /> إضافة عميل</button>
      </div>
      <div className="customers-toolbar">
        <label className="search-box customers-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم العميل أو رقم الهاتف أو العنوان..." /></label>
        <span>{customers.length} نتيجة</span>
      </div>
      <div className="customers-table">
        <div className="customers-row customers-table-head">
          <span>العميل</span><span>رقم الهاتف</span><span>العنوان</span><span>الطلبات</span><span>إجمالي المشتريات</span><span />
        </div>
        {customers.map((customer) => {
          const orders = customerOrders(customer.id);
          const completedOrders = orders.filter((order) => order.stage !== "returned");
          const totalSpent = completedOrders.reduce((sum, order) => sum + order.total, 0);
          return <button className="customers-row" key={customer.id} onClick={() => setSelected({ ...customer })}>
            <span className="customer-table-name"><i className="customer-avatar">{customer.name.charAt(0)}</i><strong>{customer.name}</strong></span>
            <span className="customer-table-phone"><Phone /> <b>{customer.phone}</b></span>
            <span className="customer-table-address"><MapPin /> <b>{customer.address}</b></span>
            <span className="customer-table-orders"><b>{completedOrders.length}</b></span>
            <span className="customer-table-spend"><b>{money(totalSpent)}</b></span>
            <span className="customer-table-arrow"><ChevronLeft /></span>
          </button>;
        })}
        {!customers.length && <Empty icon={<Users />} title="لا توجد نتائج مطابقة" text="راجع اسم العميل أو رقم الهاتف أو العنوان" />}
      </div>
    </div>
    {adding && <CustomerForm customers={state.customers} onClose={() => setAdding(false)} onSave={(customer) => {
      update((current) => ({ ...current, customers: [customer, ...current.customers] }));
      setAdding(false); notify("تم إضافة العميل");
    }} />}
    {selected && <CustomerFile customer={selected} state={state} onClose={() => setSelected(null)} onEdit={(customer) => {
      update((current) => ({
        ...current,
        customers: current.customers.map((item) => item.id === customer.id ? customer : item),
        orders: current.orders.map((order) => order.customerId === customer.id ? {
          ...order, customerName: customer.name, customerPhone: customer.phone, address: customer.address
        } : order)
      }));
      setSelected(customer); notify("تم تحديث بيانات العميل");
    }} onDelete={(customerId) => {
      if (!window.confirm("هل أنت تأكد من حذف هذا العميل؟")) return;
      update((current) => ({
        ...current,
        customers: current.customers.filter((item) => item.id !== customerId)
      }));
      setSelected(null);
      notify("تم حذف العميل بنجاح");
    }} onOrder={(order) => { setSelected(null); onEditOrder(order); }} />}
  </div>;
}

export function CustomerForm({ customers, onClose, onSave }: { customers: Customer[]; onClose: () => void; onSave: (customer: Customer) => void }) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", zone: "", notes: "" });
  const [attempted, setAttempted] = useState(false);
  const phoneDigits = form.phone.replace(/\D/g, "");
  const duplicatePhone = phoneDigits.length > 0 && customers.some((customer) => customer.phone.replace(/\D/g, "") === phoneDigits);
  const nameInvalid = form.name.trim().length < 2;
  const phoneInvalid = phoneDigits.length < 8;
  const addressInvalid = form.address.trim().length < 5;
  const save = () => {
    setAttempted(true);
    if (nameInvalid || phoneInvalid || addressInvalid || duplicatePhone) return;
    onSave({
      id: uid(),
      ...form,
      name: form.name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
      ordersCount: 0,
      totalSpent: 0
    });
  };
  return <Modal title="إضافة عميل جديد" onClose={onClose} size="medium">
    <form className="customer-create-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="customer-create-hero">
        <span>{form.name.trim() ? form.name.trim().charAt(0) : <UserPlus />}</span>
        <div><strong>بيانات العميل الأساسية</strong><small>سجّل بيانات التواصل وعنوان التوصيل بالتفصيل</small></div>
      </div>
      <div className="customer-create-grid">
        <label className={attempted && nameInvalid ? "invalid" : ""}>
          <span>اسم العميل <em>*</em></span>
          <div><Users /><input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="اكتب اسم العميل بالكامل" /></div>
          {attempted && nameInvalid && <small>اكتب اسمًا مكونًا من حرفين على الأقل</small>}
        </label>
        <label className={(attempted && phoneInvalid) || duplicatePhone ? "invalid" : ""}>
          <span>رقم الهاتف <em>*</em></span>
          <div><Phone /><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="01xxxxxxxxx" inputMode="tel" /></div>
          {duplicatePhone ? <small>رقم الهاتف مسجل لعميل آخر</small> : attempted && phoneInvalid && <small>اكتب رقم هاتف صحيح</small>}
        </label>
        <label className={`full-field ${attempted && addressInvalid ? "invalid" : ""}`}>
          <span>عنوان التوصيل بالتفصيل <em>*</em></span>
          <div className="textarea-field"><MapPin /><textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="المنطقة، الشارع، رقم العقار، الدور وأقرب علامة مميزة" /></div>
          {attempted && addressInvalid && <small>اكتب عنوان التوصيل بشكل أوضح</small>}
        </label>
        <label className="full-field">
          <span>ملاحظات العميل <i>اختياري</i></span>
          <div className="textarea-field"><ClipboardList /><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="مثال: يفضل الاتصال قبل الوصول أو ملاحظات خاصة بالتوصيل" /></div>
        </label>
      </div>
      <div className="customer-create-note"><MapPin /><span><strong>العنوان سيظهر في الطلب والفاتورة</strong><small>يمكن تعديل بيانات العميل لاحقًا من سجل العملاء أو تفاصيل الطلب.</small></span></div>
      <footer className="customer-create-actions">
        <button type="button" className="soft-button" onClick={onClose}>إلغاء</button>
        <button type="submit" className="primary-button"><Save /> حفظ العميل</button>
      </footer>
    </form>
  </Modal>;
}

export function CustomerFile({ customer, state, onClose, onEdit, onDelete, onOrder }: {
  customer: Customer; state: AppState; onClose: () => void; onEdit: (customer: Customer) => void; onDelete?: (customerId: string) => void; onOrder: (order: Order) => void
}) {
  const [form, setForm] = useState({ ...customer });
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const orders = state.orders
    .filter((order) => order.customerId === customer.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const completedOrders = orders.filter((order) => order.stage !== "returned");
  const totalSpent = completedOrders.reduce((sum, order) => sum + order.total, 0);
  const averageOrder = completedOrders.length ? totalSpent / completedOrders.length : 0;
  const isDirty = form.name !== customer.name
    || form.phone !== customer.phone
    || form.address !== customer.address
    || (form.notes ?? "") !== (customer.notes ?? "");
  const canSave = form.name.trim().length >= 2
    && form.phone.replace(/\D/g, "").length >= 8
    && form.address.trim().length >= 5;
  return <><Modal title={`ملف العميل: ${customer.name}`} onClose={onClose} size="wide">
    <div className="customer-file">
      <section className="customer-file-hero">
        <div className="customer-file-identity">
          <span className="customer-file-avatar">{customer.name.charAt(0)}</span>
          <div><strong>{customer.name}</strong><small><Phone /> {customer.phone}</small><small><MapPin /> {customer.address}</small></div>
        </div>
        <div className="customer-file-stats">
          <span><small>إجمالي الطلبات</small><b>{completedOrders.length}</b></span>
          <span><small>إجمالي المشتريات</small><b>{money(totalSpent)}</b></span>
          <span><small>متوسط الطلب</small><b>{money(averageOrder)}</b></span>
          <span><small>آخر طلب</small><b>{completedOrders[0] ? shortDate(completedOrders[0].createdAt) : "لا يوجد"}</b></span>
        </div>
      </section>
      <div className="customer-profile-editor">
        <div className="customer-file-section-title"><span><Edit3 /></span><div><strong>بيانات العميل</strong><small>يمكن تعديل بيانات التواصل والتوصيل من هنا</small></div></div>
        <div className="customer-profile-fields">
          <label><span>اسم العميل</span><div><Users /><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div></label>
          <label><span>رقم الهاتف</span><div><Phone /><input value={form.phone} inputMode="tel" onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div></label>
          <label className="full-field"><span>عنوان التوصيل بالتفصيل</span><div className="textarea-field"><MapPin /><textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></div></label>
          <label className="full-field"><span>ملاحظات العميل</span><div className="textarea-field"><ClipboardList /><textarea value={form.notes ?? ""} placeholder="لا توجد ملاحظات مسجلة" onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div></label>
        </div>
        <div className="customer-profile-actions">
          {onDelete && (
            <button type="button" className="soft-button danger" style={{ color: "#b66052", border: "1px solid #fecaca", background: "#fff1ee", display: "flex", alignItems: "center", gap: "5px" }} onClick={() => onDelete(customer.id)}>
              <Trash2 size={15} /> حذف العميل
            </button>
          )}
          {isDirty && <small>لديك تعديلات غير محفوظة</small>}
          <button type="button" className="primary-button" disabled={!isDirty || !canSave} onClick={() => onEdit({ ...form, name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() })}><Save /> حفظ التعديلات</button>
        </div>
      </div>
      <div className="customer-order-history">
        <div className="customer-file-section-title"><span><ReceiptText /></span><div><strong>سجل الطلبات</strong><small>{orders.length ? `${orders.length} طلب مرتبة من الأحدث` : "لا توجد طلبات مسجلة"}</small></div></div>
        <div className="customer-history-head"><span>الطلب والتاريخ</span><span>التحصيل والإجمالي</span><span /></div>
        <div className="customer-history-list">
        {orders.map((order) => <div className="customer-history-row" key={order.id} role="button" tabIndex={0} onClick={() => setViewingOrder(order)} onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") setViewingOrder(order);
        }}>
          <span><strong>طلب #{orderDisplayNumber(order)}</strong><small>{shortDate(order.createdAt)} · {order.items.length} أصناف</small></span>
          <span><b>{money(order.total)}</b><small className={order.stage === "returned" ? "pending" : order.paymentStatus === "paid" ? "paid" : "pending"}>{order.stage === "returned" ? "رفض الاستلام" : order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}</small></span>
          {order.stage !== "returned" && <button type="button" className="customer-history-edit" title="تعديل الطلب داخل نقطة البيع" onClick={(event) => {
            event.stopPropagation();
            onOrder(order);
          }}><Edit3 /><span>تعديل</span></button>}
        </div>)}
        {!orders.length && <div className="simple-empty"><ReceiptText /><span>لا توجد طلبات للعميل حتى الآن</span></div>}
        </div>
      </div>
    </div>
  </Modal>
    {viewingOrder && <CustomerOrderPreview order={viewingOrder} settings={state.settings} onClose={() => setViewingOrder(null)} onEdit={() => {
      setViewingOrder(null);
      onOrder(viewingOrder);
    }} />}
  </>;
}

function CustomerOrderPreview({ order, settings, onClose, onEdit }: { order: Order; settings: AppState["settings"]; onClose: () => void; onEdit: () => void }) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const stageLabel = stageLabels[order.stage];
  const paymentLabel = order.paymentMethod === "cash" ? "نقدي"
    : order.paymentMethod === "instapay" ? "إنستاباي"
      : "فودافون كاش";
  return <><Modal title={`تفاصيل الطلب رقم ${orderDisplayNumber(order)}`} onClose={onClose} size="medium">
    <div className="customer-order-preview">
      <div className="customer-order-preview-hero">
        <span><ReceiptText /></span>
        <div><small>رقم الوردية · العام #{order.number}</small><strong>#{orderDisplayNumber(order)}</strong></div>
        <div><small>تاريخ الطلب</small><b>{shortDate(order.createdAt)}</b></div>
        <div className="customer-order-preview-badges"><em className={order.stage}>{stageLabel}</em><em className={order.paymentStatus}>{order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}</em></div>
      </div>
      <div className="customer-order-preview-table">
        <div className="customer-order-preview-head"><span>الصنف</span><span>الكمية</span><span>الوحدة</span><span>الإجمالي</span></div>
        <div className="customer-order-preview-items">
          {order.items.map((item, index) => <div key={`${item.productId}-${item.optionId ?? "base"}-${index}`}>
            <span><strong>{item.name}</strong>{item.note && <small>{item.note}</small>}</span>
            <b>{item.quantity}</b><span>{item.unit}</span><strong>{money(item.price * item.quantity)}</strong>
          </div>)}
        </div>
      </div>
      <div className="customer-order-preview-footer">
        <div className="customer-order-preview-meta">
          <span><small>طريقة الدفع</small><b>{paymentLabel}</b></span>
          <span><small>التوصيل</small><b>{order.driver || "غير محدد"}</b></span>
        </div>
        <div className="customer-order-preview-totals">
          <span><small>قيمة الأصناف</small><b>{money(order.subtotal)}</b></span>
          <span><small>التوصيل</small><b>{money(order.deliveryFee)}</b></span>
          <span><small>الخصم</small><b>{money(order.discount)}</b></span>
          <span className="final"><small>الإجمالي</small><strong>{money(order.total)}</strong></span>
        </div>
      </div>
      <div className="customer-order-preview-actions">
        <button type="button" className="soft-button" onClick={onClose}>إغلاق</button>
        <button type="button" className="soft-button customer-preview-print" onClick={() => setInvoiceOpen(true)}><Printer /> طباعة الفاتورة</button>
        {order.stage !== "returned" && <button type="button" className="primary-button" onClick={onEdit}><Edit3 /> تعديل</button>}
      </div>
    </div>
  </Modal>
  {invoiceOpen && <InvoiceModal order={order} settings={settings} onClose={() => setInvoiceOpen(false)} />}
  </>;
}

export function SettingsView({ state, update, notify, network, updater }: ViewProps) {
  const [tab, setTab] = useState<"identity" | "operations" | "network" | "backup" | "support">("identity");
  const [settings, setSettings] = useState({ ...state.settings });
  const [serverAddress, setServerAddress] = useState(network?.serverUrl ?? "http://127.0.0.1:4312");
  const [networkTest, setNetworkTest] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => getDeviceRole());
  const [licenseInputKey, setLicenseInputKey] = useState("");
  const [licenseCopied, setLicenseCopied] = useState(false);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [printerStatus, setPrinterStatus] = useState("");
  const [testingPrinter, setTestingPrinter] = useState<"customer" | "kitchen" | null>(null);
  const desktopRuntime = isDesktopRuntime();

  const machineId = getMachineId();
  const licenseEval = evaluateLicense(state.license);

  const refreshPrinters = async () => {
    if (!desktopRuntime) return;
    setPrintersLoading(true);
    setPrinterStatus("");
    try {
      setPrinters(await listDesktopPrinters());
    } catch (error) {
      setPrinterStatus(`تعذر قراءة طابعات Windows: ${errorMessage(error)}`);
    } finally {
      setPrintersLoading(false);
    }
  };

  useEffect(() => {
    void refreshPrinters();
  }, []);

  const testPrinter = async (kind: "customer" | "kitchen") => {
    setTestingPrinter(kind);
    setPrinterStatus("");
    try {
      const printerName = kind === "customer" ? settings.customerReceiptPrinter : settings.kitchenReceiptPrinter;
      await printTestReceipt(kind, printerName, settings);
      setPrinterStatus("تم إرسال ريسيت الاختبار للطابعة بنجاح");
    } catch (error) {
      setPrinterStatus(`تعذرت طباعة الاختبار: ${errorMessage(error)}`);
    } finally {
      setTestingPrinter(null);
    }
  };

  const readLogo = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSettings({ ...settings, logoDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (!settings.restaurantName.trim()) return;
    update((current) => ({ ...current, settings }));
    notify("تم حفظ الإعدادات وتحديث هوية النظام");
  };

  const activateKey = () => {
    if (!licenseInputKey.trim()) return;
    const res = verifyLicenseKey(licenseInputKey, machineId);
    if (!res.valid) {
      notify(`خطأ في كود التفعيل: ${res.error}`);
      return;
    }
    const newLicense: LicenseInfo = {
      machineId,
      licenseKey: licenseInputKey.trim().toUpperCase(),
      type: res.type || "subscription",
      status: "active",
      activatedAt: new Date().toISOString(),
      expiresAt: res.expiresAt ?? null
    };
    update((current) => ({ ...current, license: newLicense }));
    setLicenseInputKey("");
    notify(res.type === "lifetime" ? "تم تفعيل ترخيص مدى الحياة بنجاح! 🎉" : "تم تفعيل الترخيص وتحديد فترة الاشتراك بنجاح! 🎉");
  };

  const revokeLicense = () => {
    if (!confirm("هل أنت تأكد من رغبتك في حذف وإلغاء ترخيص المنظومة؟ سيتطلب ذلك كود تفعيل جديد لمتابعة العمل.")) return;
    const expiredLicense: LicenseInfo = {
      machineId,
      type: "trial",
      status: "expired",
      activatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString()
    };
    update((current) => ({ ...current, license: expiredLicense }));
    notify("تم إلغاء الترخيص وحذف التفعيل الحالي بنجاح ⚠️");
  };

  return <div className="settings-page">
    <div className="settings-tabs" role="tablist" aria-label="أقسام الإعدادات">
      <button role="tab" aria-selected={tab === "identity"} className={tab === "identity" ? "active" : ""} onClick={() => setTab("identity")}>
        <Store /><span><strong>بيانات المطعم</strong><small>الهوية والفاتورة</small></span>
      </button>
      <button role="tab" aria-selected={tab === "operations"} className={tab === "operations" ? "active" : ""} onClick={() => setTab("operations")}>
        <SlidersHorizontal /><span><strong>إعدادات التشغيل</strong><small>المطبخ والتوصيل</small></span>
      </button>
      <button role="tab" aria-selected={tab === "network"} className={tab === "network" ? "active" : ""} onClick={() => setTab("network")}>
        <Network /><span><strong>السيرفر والشبكة</strong><small>{network?.status === "online" ? "متصل لحظيًا" : "إعداد أجهزة المطعم"}</small></span>
      </button>
      <button role="tab" aria-selected={tab === "backup"} className={tab === "backup" ? "active" : ""} onClick={() => setTab("backup")}>
        <DatabaseBackup /><span><strong>النسخ الاحتياطي</strong><small>المسارات والجدولة</small></span>
      </button>
      <button role="tab" aria-selected={tab === "support"} className={tab === "support" ? "active" : ""} onClick={() => setTab("support")}>
        <Headphones /><span><strong>الدعم الفني والتفعيل</strong><small>{licenseEval.isLifetime ? "مدى الحياة" : `${licenseEval.daysRemaining ?? 0} يوم متبقي`}</small></span>
      </button>
    </div>

    {tab === "identity" && <div className="panel settings-brand-panel" role="tabpanel">
      <div className="panel-title"><div><Store /><span><strong>هوية المطعم والفاتورة</strong><small>التغييرات تظهر في القائمة الجانبية وكل الفواتير</small></span></div></div>
      <div className="settings-brand">
        <label className="logo-uploader">
          {settings.logoDataUrl ? <img src={settings.logoDataUrl} alt="شعار المطعم" /> : <ImagePlus />}
          <span><strong>اختيار اللوجو</strong><small>PNG أو JPG ويفضل صورة مربعة</small></span>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => readLogo(event.target.files?.[0])} />
        </label>
        <div className="settings-form">
          <label>اسم المطعم<input value={settings.restaurantName} onChange={(event) => setSettings({ ...settings, restaurantName: event.target.value })} /></label>
          <label>الجملة التعريفية<input value={settings.subtitle} onChange={(event) => setSettings({ ...settings, subtitle: event.target.value })} /></label>
          <label>رقم المطعم<input value={settings.phone} onChange={(event) => setSettings({ ...settings, phone: event.target.value })} /></label>
          <label>العنوان<input value={settings.address} onChange={(event) => setSettings({ ...settings, address: event.target.value })} /></label>
          <label className="full-field">تذييل الفاتورة<input value={settings.invoiceFooter} onChange={(event) => setSettings({ ...settings, invoiceFooter: event.target.value })} /></label>
          <div className="receipt-print-settings full-field">
            <div className="receipt-print-settings-title">
              <Printer />
              <span><strong>الطباعة الفورية ESC/POS</strong><small>{desktopRuntime ? `إرسال RAW مباشر — ${printers.length} طابعة متاحة على Windows` : "الطباعة المباشرة ESC/POS تعمل في نسخة الديسكتوب"}</small></span>
              {desktopRuntime && <button type="button" className="soft-button receipt-printers-refresh" disabled={printersLoading} onClick={() => void refreshPrinters()}><RefreshCw /> {printersLoading ? "جاري التحديث..." : "تحديث الطابعات"}</button>}
            </div>
            <div className="receipt-print-options">
              <div className={settings.printCustomerReceipt ? "receipt-print-option active" : "receipt-print-option"}>
                <label className="receipt-print-option-main">
                  <input type="checkbox" checked={settings.printCustomerReceipt} onChange={(event) => setSettings({ ...settings, printCustomerReceipt: event.target.checked })} />
                  <span className="receipt-print-option-icon"><ReceiptText /></span>
                  <span><strong>فاتورة العميل</strong><small>تخرج فورًا بعد حفظ الطلب وبها الأسعار والدفع</small></span>
                  <i><b /></i>
                </label>
                <div className="receipt-printer-field">
                  <label><span>طابعة فاتورة العميل</span><select value={settings.customerReceiptPrinter ?? ""} disabled={!desktopRuntime} onChange={(event) => setSettings({ ...settings, customerReceiptPrinter: event.target.value })}>
                    <option value="">الطابعة الافتراضية في Windows</option>
                    {settings.customerReceiptPrinter && !printers.some((printer) => printer.name === settings.customerReceiptPrinter) && <option value={settings.customerReceiptPrinter}>{settings.customerReceiptPrinter} — غير متصلة</option>}
                    {printers.map((printer) => <option value={printer.name} key={printer.name}>{printer.name}{printer.isDefault ? " — الافتراضية" : ""}</option>)}
                  </select></label>
                  {desktopRuntime && <button type="button" className="soft-button" disabled={testingPrinter !== null} onClick={() => void testPrinter("customer")}><Printer /> {testingPrinter === "customer" ? "جاري الاختبار..." : "طباعة اختبار"}</button>}
                </div>
              </div>
              <div className={settings.printKitchenReceipt ? "receipt-print-option active" : "receipt-print-option"}>
                <label className="receipt-print-option-main">
                  <input type="checkbox" checked={settings.printKitchenReceipt} onChange={(event) => setSettings({ ...settings, printKitchenReceipt: event.target.checked })} />
                  <span className="receipt-print-option-icon kitchen"><CookingPot /></span>
                  <span><strong>ريسيت المطبخ</strong><small>يخرج فورًا بالأصناف والكميات والملاحظات بدون أسعار</small></span>
                  <i><b /></i>
                </label>
                <div className="receipt-printer-field">
                  <label><span>طابعة ريسيت المطبخ</span><select value={settings.kitchenReceiptPrinter ?? ""} disabled={!desktopRuntime} onChange={(event) => setSettings({ ...settings, kitchenReceiptPrinter: event.target.value })}>
                    <option value="">الطابعة الافتراضية في Windows</option>
                    {settings.kitchenReceiptPrinter && !printers.some((printer) => printer.name === settings.kitchenReceiptPrinter) && <option value={settings.kitchenReceiptPrinter}>{settings.kitchenReceiptPrinter} — غير متصلة</option>}
                    {printers.map((printer) => <option value={printer.name} key={printer.name}>{printer.name}{printer.isDefault ? " — الافتراضية" : ""}</option>)}
                  </select></label>
                  {desktopRuntime && <button type="button" className="soft-button" disabled={testingPrinter !== null} onClick={() => void testPrinter("kitchen")}><Printer /> {testingPrinter === "kitchen" ? "جاري الاختبار..." : "طباعة اختبار"}</button>}
                </div>
              </div>
            </div>
            {printerStatus && <p className={printerStatus.includes("بنجاح") ? "receipt-printer-status success" : "receipt-printer-status error"}>{printerStatus}</p>}
          </div>
          <button className="primary-button" onClick={save}><Save /> حفظ بيانات المطعم والطباعة</button>
        </div>
      </div>
    </div>}

    {tab === "operations" && <div className="panel" role="tabpanel">
      <div className="panel-title"><div><SlidersHorizontal /><span><strong>إعدادات التشغيل</strong><small>القيم الافتراضية وتنبيهات تجهيز الطلب</small></span></div></div>
      <div className="settings-form settings-operations">
        <label>رسوم التوصيل الافتراضية<input type="number" min="0" value={settings.defaultDeliveryFee} onChange={(event) => setSettings({ ...settings, defaultDeliveryFee: Number(event.target.value) })} /></label>
        <label>تنبيه المطبخ بعد (دقيقة)<input type="number" min="1" value={settings.kitchenWarningMinutes} onChange={(event) => setSettings({ ...settings, kitchenWarningMinutes: Number(event.target.value) })} /></label>
        <label>اعتبار الطلب متأخر بعد (دقيقة)<input type="number" min="1" value={settings.kitchenLateMinutes} onChange={(event) => setSettings({ ...settings, kitchenLateMinutes: Number(event.target.value) })} /></label>
        <button className="primary-button" onClick={save}><Save /> حفظ إعدادات التشغيل</button>
      </div>
    </div>}



    {tab === "network" && <div className="panel network-settings-panel" role="tabpanel">
      <div className="panel-title"><div><Server /><span><strong>السيرفر المركزي والتحديث اللحظي</strong><small>كل أجهزة الكاشير والمطبخ يجب أن تتصل بنفس العنوان</small></span></div></div>
      <div className="network-settings-content">
        <div className={`network-status-card ${network?.status ?? "offline"}`}>
          <span><i /> {network?.status === "online" ? "متصل بالسيرفر" : network?.status === "connecting" ? "جاري الاتصال" : network?.status === "local" ? "وضع المتصفح المحلي" : "غير متصل"}</span>
          <strong dir="ltr">{network?.serverUrl}</strong>
        </div>
        <div className="connected-devices-panel">
          <div className="connected-devices-head">
            <div><strong><Monitor /> الأجهزة المتصلة الآن</strong><small>تتحدث القائمة لحظيًا، ويختفي الجهاز تلقائيًا عند قطع الاتصال</small></div>
            <span><i /> {network?.connectedDevices.length ?? 0} جهاز متصل</span>
          </div>
          <div className="connected-devices-grid">
            {network?.connectedDevices.length ? network.connectedDevices.map((device) => {
              const isCurrent = device.machineId === machineId;
              const roleLabel = device.role === "server" ? "السيرفر الرئيسي"
                : device.role === "cashier" ? "كاشير"
                  : device.role === "kitchen" ? "مطبخ"
                    : device.role === "assembly" ? "تجميع" : "جهاز إضافي";
              const RoleIcon = device.role === "server" ? Server
                : device.role === "kitchen" ? CookingPot
                  : device.role === "assembly" ? Boxes
                    : device.role === "cashier" ? ShoppingBasket : Monitor;
              return <div className={`connected-device-card${isCurrent ? " current" : ""}`} key={device.connectionId}>
                <span className="connected-device-icon"><RoleIcon /></span>
                <div>
                  <strong>{device.deviceName}</strong>
                  <small>{roleLabel}{isCurrent ? " · هذا الجهاز" : ""}</small>
                </div>
                <div className="connected-device-meta">
                  <code dir="ltr">{device.ipAddress}</code>
                  <span>v{device.appVersion || "—"}</span>
                </div>
                <i className="device-online-dot" title="متصل الآن" />
              </div>;
            }) : <div className="connected-devices-empty"><Monitor /><strong>لا توجد أجهزة ظاهرة بعد</strong><small>ستظهر الأجهزة بمجرد اتصالها بالسيرفر.</small></div>}
          </div>
          {network?.embeddedServer?.networkUrl && <div className="server-network-address"><span>عنوان توصيل الأجهزة الجديدة</span><code>{network.embeddedServer.networkUrl}</code></div>}
        </div>
        <div className="network-address-form">
          <label>وظيفة هذا الجهاز<select value={deviceRole} onChange={(event) => setDeviceRole(event.target.value as DeviceRole)}>
            <option value="server">السيرفر الرئيسي</option>
            <option value="cashier">كاشير</option>
            <option value="kitchen">مطبخ</option>
            <option value="assembly">تجميع</option>
            <option value="terminal">جهاز إضافي</option>
          </select></label>
          <label>عنوان السيرفر<input dir="ltr" value={serverAddress} onChange={(event) => { setServerAddress(event.target.value); setNetworkTest("idle"); }} placeholder="http://192.168.1.10:4312" /></label>
          <button className="soft-button" disabled={networkTest === "testing"} onClick={() => {
            setNetworkTest("testing");
            testServerConnection(serverAddress).then(() => setNetworkTest("success")).catch(() => setNetworkTest("error"));
          }}><RefreshCw /> {networkTest === "testing" ? "جاري الاختبار..." : "اختبار الاتصال"}</button>
          <button className="primary-button" onClick={() => { saveDeviceRole(deviceRole); network?.changeServerUrl(serverAddress); }}><Save /> حفظ وإعادة الاتصال</button>
        </div>
        {networkTest === "success" && <p className="network-test-result success">تم الاتصال بالسيرفر بنجاح، ويمكن حفظ العنوان.</p>}
        {networkTest === "error" && <p className="network-test-result error">تعذر الوصول إلى هذا العنوان. راجع الشبكة وWindows Firewall.</p>}
      </div>
    </div>}

    {tab === "backup" && <div role="tabpanel"><BackupPanel state={state} update={update} notify={notify} /></div>}

    {tab === "support" && <div className="support-compact-container" role="tabpanel">
      <UpdatePanel updater={updater} />
      <div className="support-compact-header">
        <div className="support-brand-info-right">
          <div className="support-brand-headline">
            <h2>FYC Solutions</h2>
            <span className="support-official-badge"><ShieldCheck size={13} /> شركة الدعم الفني والحلول البرمجية</span>
            <span className="support-status-pill"><i /> متصل الآن (24/7)</span>
          </div>
          <p>مركز الدعم التقني والمساندة المباشرة لنظام إدارة المطاعم</p>
        </div>

        <div className="support-brand-logo-left" title="FYC Solutions">
          <img src="/fyc_logo.png" alt="FYC Solutions" className="support-brand-logo-img-large" />
        </div>
      </div>

      <div className="support-compact-grid">
        <div className="support-compact-card whatsapp">
          <div className="compact-card-header">
            <div className="compact-card-icon whatsapp"><MessageSquare size={18} /></div>
            <div>
              <h3>واتساب الدعم السريع</h3>
              <small>أرسل استفسارك أو صور المشكلة</small>
            </div>
          </div>
          <div className="compact-card-body">
            <strong dir="ltr">+20 121 067 7917</strong>
          </div>
          <a href="https://wa.me/201210677917" target="_blank" rel="noreferrer" className="compact-card-btn whatsapp">
            <ExternalLink size={13} />
            <span>راسلنا على الواتساب</span>
          </a>
        </div>

        <div className="support-compact-card phone">
          <div className="compact-card-header">
            <div className="compact-card-icon phone"><PhoneCall size={18} /></div>
            <div>
              <h3>اتصال هاتفي مباشر</h3>
              <small>للحالات العاجلة والاستفسارات</small>
            </div>
          </div>
          <div className="compact-card-body">
            <strong dir="ltr">+20 155 460 1660</strong>
          </div>
          <a href="tel:+201554601660" className="compact-card-btn phone">
            <Phone size={13} />
            <span>اتصل الآن</span>
          </a>
        </div>

        <div className="support-compact-card anydesk">
          <div className="compact-card-header">
            <div className="compact-card-icon anydesk">AD</div>
            <div>
              <h3>الدعم عن بعد (AnyDesk)</h3>
              <small>فحص وحل المشكلات عن بعد</small>
            </div>
          </div>
          <div className="compact-card-body">
            <span>AnyDesk Remote Access</span>
          </div>
          <a href="https://anydesk.com/en/downloads" target="_blank" rel="noreferrer" className="compact-card-btn anydesk">
            <Download size={13} />
            <span>تحميل AnyDesk</span>
          </a>
        </div>
      </div>

      {/* License & Activation Section */}
      <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "16px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
          <KeyRound size={20} style={{ color: "var(--accent)" }} />
          <span>ترخيص واشتراك المنظومة</span>
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          <div style={{
            background: licenseEval.isLifetime ? "linear-gradient(135deg, #ecfdf5, #d1fae5)" : licenseEval.status === "active" ? "linear-gradient(135deg, #eff6ff, #dbeafe)" : "linear-gradient(135deg, #fef2f2, #fee2e2)",
            border: `1px solid ${licenseEval.isLifetime ? "#a7f3d0" : licenseEval.status === "active" ? "#bfdbfe" : "#fca5a5"}`,
            borderRadius: "14px", padding: "16px", display: "flex", alignItems: "center", gap: "12px"
          }}>
            <div style={{
              width: "42px", height: "42px", borderRadius: "10px",
              background: licenseEval.isLifetime ? "#10b981" : licenseEval.status === "active" ? "#3b82f6" : "#ef4444",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <CheckCircle2 size={22} />
            </div>
            <div>
              <small style={{ fontSize: "11px", color: "#64748b", display: "block" }}>حالة الترخيص الحالية</small>
              <strong style={{ fontSize: "15px", color: "#0f172a" }}>
                {licenseEval.isLifetime ? "ترخيص دائم (مدى الحياة) 🌟" : licenseEval.status === "active" ? `ساري (${licenseEval.daysRemaining} يوم متبقي)` : "منتهي الصلاحية ⚠️"}
              </strong>
            </div>
          </div>

          <div style={{
            background: "#fff", border: "1px solid var(--line)", borderRadius: "14px", padding: "16px",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <div>
              <small style={{ fontSize: "11px", color: "#64748b", display: "block" }}>معرّف هذا الجهاز (Machine ID)</small>
              <strong style={{ fontSize: "14px", fontFamily: "monospace", color: "#1e293b", letterSpacing: "0.5px" }}>
                {machineId}
              </strong>
            </div>
            <button
              type="button"
              className="soft-button compact"
              onClick={() => {
                navigator.clipboard.writeText(machineId);
                setLicenseCopied(true);
                setTimeout(() => setLicenseCopied(false), 2000);
              }}
            >
              {licenseCopied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              <span>{licenseCopied ? "تم النسخ" : "نسخ المعرّف"}</span>
            </button>
          </div>
        </div>

        {/* License Key Form */}
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "14px", padding: "16px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "8px" }}>
            إدخال مفتاح التفعيل الجديد (من الدعم الفني)
          </label>
          <div style={{ display: "flex", gap: "10px", maxWidth: "560px" }}>
            <input
              dir="ltr"
              value={licenseInputKey}
              onChange={(e) => setLicenseInputKey(e.target.value.toUpperCase())}
              placeholder="REST-XXXX-YYYY-ZZZZ"
              style={{
                flex: 1, padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--line)",
                fontSize: "14px", fontFamily: "monospace", letterSpacing: "1px", textTransform: "uppercase"
              }}
            />
            <button type="button" className="primary-button" onClick={activateKey}>
              <KeyRound size={15} />
              <span>تفعيل الكود</span>
            </button>
            <button type="button" className="soft-button danger" onClick={revokeLicense} title="حذف وإلغاء الترخيص والتفعيل الحالي">
              <Trash2 size={15} />
              <span>إلغاء الترخيص</span>
            </button>
          </div>
        </div>
      </div>

      <div className="support-compact-footer">
        <div>
          <ShieldCheck size={14} />
          <span>جميع حقوق الملكية الفكرية محفوظة لشركة <strong>FYC Solutions</strong></span>
        </div>
        <div>
          <Clock size={13} />
          <span>خدمة الدعم متوفرة طوال أيام الأسبوع 24/7</span>
        </div>
      </div>
    </div>}
  </div>;
}
