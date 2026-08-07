// Internal implementation. Consume it through the public feature index files.
import { useState, type ReactNode } from "react";
import {
  BadgeDollarSign, Boxes, Building2, Check, ChevronLeft, ClipboardList, CookingPot, DatabaseBackup, Edit3, ImagePlus,
  MapPin, Minus, Network, PackagePlus, Phone, Plus, Printer, ReceiptText, RefreshCw, Save, Search, Server,
  ShoppingBasket, SlidersHorizontal, Store, Trash2, UserPlus, Users, Headphones, MessageSquare, ShieldCheck,
  PhoneCall, ExternalLink, Clock, Download
} from "lucide-react";
import type {
  AppState, Customer, Meal, MenuSection, Order, Product, ProductCategory, ProductSection
} from "../../domain/types";
import type { ViewProps } from "../../shared/contracts";
import { money, shortDate, stageLabels } from "../../shared/format";
import { uid } from "../../shared/id";
import { Empty, Modal, WorkspaceSectionHeader } from "../../shared/ui";
import { BackupPanel } from "../settings/BackupPanel";
import { InvoiceModal } from "../orders/InvoiceModal";
import { testServerConnection } from "../../infrastructure/dataClient";

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
  const [section, setSection] = useState<ProductSection>(() => state.sections[0]?.id ?? "cooked");
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [search, setSearch] = useState("");
  const [draftPrices, setDraftPrices] = useState<Record<string, number>>({});
  const [draftOptionPrices, setDraftOptionPrices] = useState<Record<string, number>>({});
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
  const visibleMeals = state.meals.filter((meal) => meal.name.includes(search.trim()) || meal.components.some((item) => item.name.includes(search.trim())));
  const mealStandaloneTotal = (meal: Meal) => meal.components.reduce((sum, component) => sum + (state.products.find((product) => product.id === component.productId)?.price ?? 0) * component.quantity, 0);

  return <div className="management-page products-admin-page">
    <div className="products-menu-switch">
      {state.sections.map((item, index) => {
        const count = state.products.filter((product) => product.section === item.id).length;
        const available = state.products.filter((product) => product.section === item.id && product.available).length;
        return <button className={section === item.id ? `active ${index % 2 ? "fresh" : "cooked"}` : ""} onClick={() => { setSection(item.id); setCategoryFilter("الكل"); }} key={item.id}>
          <span>{index % 2 ? <ShoppingBasket /> : <CookingPot />}</span><div><strong>{item.name}</strong><small>{count} صنف في القسم</small></div><b>{available} متاح</b>
        </button>;
      })}
      <button className={section === MEALS_SECTION ? "meals-menu-shortcut active" : "meals-menu-shortcut"} onClick={() => { setSection(MEALS_SECTION); setCategoryFilter("الكل"); setSearch(""); }}>
        <span><ShoppingBasket /></span>
        <div><strong>الوجبات</strong><small>{state.meals.length} وجبة مكوّنة من الأصناف</small></div>
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
        <div className="meal-manage-table-head"><span>الوجبة</span><span>المكونات</span><span>سعر الأصناف منفردة</span><span>سعر الوجبة</span><span>التعديل</span><span>متاحة</span></div>
        {visibleMeals.map((meal) => <div className={meal.available ? "meal-manage-row" : "meal-manage-row unavailable"} key={meal.id}>
          <div className="meal-admin-name"><span><ShoppingBasket /></span><div><strong>{meal.name}</strong><small>{meal.components.length} صنف داخل الوجبة</small></div></div>
          <div className="meal-admin-components">{meal.components.map((component) => <span key={component.productId}><b>{component.quantity}×</b> {component.name}</span>)}</div>
          <span className="meal-standalone-price"><small>منفردة</small><b>{money(mealStandaloneTotal(meal))}</b></span>
          <span className="meal-selling-price"><small>سعر الوجبة</small><b>{money(meal.price)}</b>{mealStandaloneTotal(meal) > meal.price && <em>توفير {money(mealStandaloneTotal(meal) - meal.price)}</em>}</span>
          <button className="product-edit-button" onClick={() => { setMealToEdit({ ...meal, components: meal.components.map((item) => ({ ...item })) }); setMealsOpen(true); }}><Edit3 /><span>تعديل</span></button>
          <button className={meal.available ? "product-availability active" : "product-availability"} onClick={() => update((current) => ({ ...current, meals: current.meals.map((item) => item.id === meal.id ? { ...item, available: !item.available } : item) }))}><i /><span>{meal.available ? "متاحة" : "متوقفة"}</span></button>
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
        <div className="product-manage-table-head"><span>الصنف</span><span>الوحدة والمقاسات</span><span>التكلفة</span><span>سعر البيع السريع</span><span>تعديل</span><span>متاح</span></div>
        {products.map((product) => <div className={product.available ? "product-manage-row editable" : "product-manage-row editable unavailable"} key={product.id}>
          <div className="product-admin-name"><span className="product-admin-icon" style={{ background: `${product.accent}24`, color: product.accent }}>{product.imageDataUrl ? <img src={product.imageDataUrl} alt="" /> : <CookingPot />}</span><span><strong>{product.name}</strong><small>{product.category}</small></span></div>
          <span className="product-admin-units"><b>{product.unit}</b>{product.options?.length ? <small>{product.options.length} مقاسات</small> : <small>سعر واحد</small>}</span>
          <span className="product-admin-cost"><small>التكلفة</small><b>{money(product.cost)}</b></span>
          {product.options?.length ? <div className="option-price-summary">
            <small>حسب المقاس</small>
            <b>{money(Math.min(...product.options.map((option) => option.price)))} — {money(Math.max(...product.options.map((option) => option.price)))}</b>
          </div> : <label className={draftPrices[product.id] !== undefined && draftPrices[product.id] !== product.price ? "quick-price changed" : "quick-price"}>
            <input type="number" min="0" value={draftPrices[product.id] ?? product.price} onChange={(event) => setDraftPrices({ ...draftPrices, [product.id]: Number(event.target.value) })} onKeyDown={(event) => event.key === "Enter" && savePriceChanges()} />
            <span>سعر البيع</span>
          </label>}
          <button className="product-edit-button" title="فتح كل بيانات الصنف والمقاسات" onClick={() => setEditing({ ...product, options: product.options?.map((option) => ({ ...option })) })}><Edit3 /><span>تعديل</span></button>
          <button className={product.available ? "product-availability active" : "product-availability"} title={product.available ? "إيقاف الصنف" : "إتاحة الصنف"} onClick={() => toggle(product.id)}><i /><span>{product.available ? "متاح" : "متوقف"}</span></button>
          {!!product.options?.length && <div className="product-quick-options">
            <strong>أسعار المقاسات:</strong>
            {product.options.map((option) => {
              const key = `${product.id}:${option.id}`;
              const value = draftOptionPrices[key] ?? option.price;
              return <label className={value !== option.price ? "changed" : ""} key={option.id}><span>{option.name}</span><input type="number" min="0" value={value} onChange={(event) => setDraftOptionPrices({ ...draftOptionPrices, [key]: Number(event.target.value) })} /><small>{option.unit}</small></label>;
            })}
          </div>}
        </div>)}
        {!products.length && <Empty icon={<Search />} title="لا توجد أصناف مطابقة" text="غيّر البحث أو اختر تصنيفًا آخر" />}
      </div>
    </div>}

    {editing && <Modal title={state.products.some((item) => item.id === editing.id) ? "تعديل الصنف" : "إضافة صنف"} onClose={() => setEditing(null)} size="wide">
      <div className="product-editor-layout">
        <aside className="product-image-editor">
          <label className={editing.imageDataUrl ? "product-image-upload has-image" : "product-image-upload"}>
            {editing.imageDataUrl ? <img src={editing.imageDataUrl} alt={`صورة ${editing.name || "الصنف"}`} /> : <><span><ImagePlus /></span><strong>صورة المنتج</strong><small>اضغط لاختيار صورة واضحة</small></>}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectProductImage(event.target.files?.[0])} />
          </label>
          <div className="product-image-guidance"><strong>{editing.imageDataUrl ? "تم تحميل الصورة" : "الصورة اختيارية"}</strong><small>يفضل صورة مربعة بصيغة JPG أو PNG أو WebP، بحد أقصى 2 ميجابايت.</small></div>
          {editing.imageDataUrl && <button type="button" className="remove-product-image" onClick={() => setEditing({ ...editing, imageDataUrl: undefined })}><Trash2 /> حذف الصورة</button>}
        </aside>
        <section className="product-editor-main">
          <div className="product-editor-heading"><span><Edit3 /></span><div><strong>البيانات الأساسية</strong><small>اسم الصنف والقسم والتصنيف ووحدة البيع</small></div></div>
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
        {!!editing.options?.length && <div className="option-managed-price-note"><BadgeDollarSign /><span><strong>السعر حسب المقاس</strong><small>عدّل سعر كل مقاس من الجدول بالأسفل، ولا يوجد سعر أساسي منفصل لهذا الصنف.</small></span></div>}
        <label>التكلفة<input type="number" min="0" value={editing.cost || ""} onChange={(event) => setEditing({ ...editing, cost: Number(event.target.value) })} /></label>
        <label className="check-label"><input type="checkbox" checked={editing.available} onChange={(event) => setEditing({ ...editing, available: event.target.checked })} /> متاح للبيع حاليًا</label>
          </div>
        </section>
      </div>
      <section className="product-options-editor">
        <header>
          <div><strong>المقاسات وخيارات البيع</strong><small>مثال: نصف كيلو، كيلو، ميديم أو لارج. اتركها فارغة لو الصنف له سعر واحد.</small></div>
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
  </div>;
}

function CategoryManager({ state, update, notify, onClose }: ViewProps & { onClose: () => void }) {
  const firstSection = state.sections[0]?.id ?? "cooked";
  const [form, setForm] = useState<Omit<ProductCategory, "id">>({ name: "", section: firstSection, color: "#6f927d", active: true });
  const [editingId, setEditingId] = useState("");
  const [sectionFilter, setSectionFilter] = useState<ProductSection>(firstSection);
  const [search, setSearch] = useState("");
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
  return <Modal title="إدارة التصنيفات" onClose={onClose} size="wide">
    <div className="category-manager">
      <div className="category-manager-hero">
        <span><Boxes /></span>
        <div><strong>تنظيم تصنيفات المنيو</strong><small>أنشئ تصنيفات منفصلة داخل كل قسم لتسهيل الوصول للأصناف في نقطة البيع</small></div>
        <div><b>{state.categories.length}</b><small>إجمالي التصنيفات</small></div>
      </div>
      <div className="category-section-switch">
        {state.sections.map((item, index) => <button className={sectionFilter === item.id ? `active ${index % 2 ? "fresh" : ""}` : ""} onClick={() => { setSectionFilter(item.id); resetForm(item.id); }} key={item.id}>{index % 2 ? <ShoppingBasket /> : <CookingPot />}<span><strong>{item.name}</strong><small>{state.categories.filter((category) => category.section === item.id).length} تصنيف</small></span></button>)}
      </div>
      <div className={editingId ? "category-form editing" : "category-form"}>
        <div className="category-form-title"><span>{editingId ? <Edit3 /> : <Plus />}</span><div><strong>{editingId ? "تعديل التصنيف" : "إضافة تصنيف جديد"}</strong><small>{editingId ? "سيتم تحديث التصنيف في كل الأصناف المرتبطة به" : `سيُضاف إلى قسم ${state.sections.find((item) => item.id === form.section)?.name ?? "المنيو"}`}</small></div></div>
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
      <button className="category-edit-action" onClick={() => {
        setEditingId(category.id);
        setForm({ name: category.name, section: category.section, color: category.color, active: category.active });
      }}><Edit3 /> تعديل</button>
      <button className={category.active ? "product-availability active" : "product-availability"} onClick={() => update((current) => ({
        ...current, categories: current.categories.map((item) => item.id === category.id ? { ...item, active: !item.active } : item)
      }))}><i /><span>{category.active ? "متاح" : "متوقف"}</span></button>
    </div>;
      })}
      {!visibleCategories.length && <Empty icon={<Boxes />} title="لا توجد تصنيفات" text="أضف تصنيفًا جديدًا أو غيّر كلمة البحث" />}
    </div>
    </div>
  </Modal>;
}

function SectionManager({ state, update, notify, onClose }: ViewProps & { onClose: () => void }) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<ProductSection>("");
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
  return <Modal title="إدارة الأقسام" onClose={onClose} size="medium">
    <div className="section-manager">
      <div className="category-manager-hero section-manager-hero">
        <span><SlidersHorizontal /></span>
        <div><strong>أقسام المنيو</strong><small>أضف أقسامًا جديدة أو غيّر أسماء الأقسام الحالية</small></div>
        <div><b>{state.sections.length}</b><small>قسم</small></div>
      </div>
      <div className={editingId ? "category-form editing section-form" : "category-form section-form"}>
        <div className="category-form-title"><span>{editingId ? <Edit3 /> : <Plus />}</span><div><strong>{editingId ? "تعديل اسم القسم" : "إضافة قسم جديد"}</strong><small>سيظهر الاسم في نقطة البيع والأصناف والمطبخ</small></div></div>
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
          </div>;
        })}
      </div>
    </div>
  </Modal>;
}

function MealManager({ state, update, notify, initialMeal, onClose }: ViewProps & { initialMeal: Meal | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Meal>(() => initialMeal
    ? { ...initialMeal, components: initialMeal.components.map((item) => ({ ...item })) }
    : { id: uid(), name: "", price: 0, available: true, components: [] });
  const [productSearch, setProductSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [mealCategoryFilter, setMealCategoryFilter] = useState("all");
  const selected = (productId: string) => draft.components.find((item) => item.productId === productId);
  const toggleProduct = (product: Product) => {
    const exists = selected(product.id);
    setDraft({
      ...draft,
      components: exists
        ? draft.components.filter((item) => item.productId !== product.id)
        : [...draft.components, { productId: product.id, name: product.name, quantity: 1 }]
    });
  };
  const changeQuantity = (productId: string, quantity: number) => {
    setDraft({ ...draft, components: draft.components.map((item) => item.productId === productId ? { ...item, quantity: Math.max(1, quantity) } : item) });
  };
  const componentTotal = draft.components.reduce((sum, component) => {
    const product = state.products.find((item) => item.id === component.productId);
    return sum + (product?.price ?? 0) * component.quantity;
  }, 0);
  const availableProducts = state.products.filter((product) => product.available);
  const sectionProducts = availableProducts.filter((product) =>
    sectionFilter === "all"
    || (sectionFilter === "selected" ? Boolean(selected(product.id)) : product.section === sectionFilter)
  );
  const mealCategories = [...new Set(sectionProducts.map((product) => product.category))];
  const normalizedProductSearch = productSearch.trim().toLocaleLowerCase("ar");
  const filteredProducts = sectionProducts.filter((product) =>
    (mealCategoryFilter === "all" || product.category === mealCategoryFilter)
    && (!normalizedProductSearch || product.name.toLocaleLowerCase("ar").includes(normalizedProductSearch))
  );
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

  return <Modal title={initialMeal ? "تعديل الوجبة" : "إضافة وجبة جديدة"} onClose={onClose} size="wide">
    <div className="meal-editor-modal">
      <div className="meal-main-fields">
        <label>اسم الوجبة<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="مثال: وجبة فردية" /></label>
        <label>سعر الوجبة<input type="number" min="0" value={draft.price || ""} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label>
        <label className="check-label"><input type="checkbox" checked={draft.available} onChange={(event) => setDraft({ ...draft, available: event.target.checked })} /> متاحة للبيع</label>
      </div>
      <div className="meal-product-filters">
        <label className="search-box meal-product-search"><Search /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="ابحث عن صنف بالاسم..." /></label>
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
        return <div className={component ? "selected" : ""} key={product.id}>
          <button className="meal-product-toggle" onClick={() => toggleProduct(product)}><span>{component && <Check />}</span><div><strong>{product.name}</strong><small>{state.sections.find((item) => item.id === product.section)?.name ?? product.section} · {product.category}</small></div><b className="meal-product-price">{money(product.price)}</b></button>
          {component && <div className="meal-quantity"><button onClick={() => changeQuantity(product.id, component.quantity - 1)}><Minus /></button><b>{component.quantity}</b><button onClick={() => changeQuantity(product.id, component.quantity + 1)}><Plus /></button></div>}
        </div>;
      })}{!filteredProducts.length && <div className="meal-picker-empty"><Search /><strong>لا توجد أصناف مطابقة</strong><small>غيّر القسم أو التصنيف أو كلمة البحث</small></div>}</div>
      <div className="meal-editor-summary"><span><small>مجموع أسعار الأصناف منفردة</small><b>{money(componentTotal)}</b></span><span><small>سعر الوجبة</small><b>{money(draft.price)}</b></span><span className={componentTotal > draft.price ? "saving" : ""}><small>فرق السعر للعميل</small><b>{componentTotal > draft.price ? `توفير ${money(componentTotal - draft.price)}` : money(draft.price - componentTotal)}</b></span></div>
      <footer className="meal-editor-actions"><button className="soft-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={!draft.name.trim() || draft.price < 0 || !draft.components.length} onClick={save}><Save /> {initialMeal ? "حفظ التعديلات" : "إضافة الوجبة"}</button></footer>
    </div>
  </Modal>;
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
          const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
          return <button className="customers-row" key={customer.id} onClick={() => setSelected({ ...customer })}>
            <span className="customer-table-name"><i className="customer-avatar">{customer.name.charAt(0)}</i><strong>{customer.name}</strong></span>
            <span className="customer-table-phone"><Phone /> <b>{customer.phone}</b></span>
            <span className="customer-table-address"><MapPin /> <b>{customer.address}</b></span>
            <span className="customer-table-orders"><b>{orders.length}</b></span>
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

export function CustomerFile({ customer, state, onClose, onEdit, onOrder }: {
  customer: Customer; state: AppState; onClose: () => void; onEdit: (customer: Customer) => void; onOrder: (order: Order) => void
}) {
  const [form, setForm] = useState({ ...customer });
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const orders = state.orders
    .filter((order) => order.customerId === customer.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
  const averageOrder = orders.length ? totalSpent / orders.length : 0;
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
          <span><small>إجمالي الطلبات</small><b>{orders.length}</b></span>
          <span><small>إجمالي المشتريات</small><b>{money(totalSpent)}</b></span>
          <span><small>متوسط الطلب</small><b>{money(averageOrder)}</b></span>
          <span><small>آخر طلب</small><b>{orders[0] ? shortDate(orders[0].createdAt) : "لا يوجد"}</b></span>
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
          <span><strong>طلب #{order.number}</strong><small>{shortDate(order.createdAt)} · {order.items.length} أصناف</small></span>
          <span><b>{money(order.total)}</b><small className={order.paymentStatus === "paid" ? "paid" : "pending"}>{order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}</small></span>
          <button type="button" className="customer-history-edit" title="تعديل الطلب داخل نقطة البيع" onClick={(event) => {
            event.stopPropagation();
            onOrder(order);
          }}><Edit3 /><span>تعديل</span></button>
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
  return <><Modal title={`تفاصيل الطلب رقم ${order.number}`} onClose={onClose} size="medium">
    <div className="customer-order-preview">
      <div className="customer-order-preview-hero">
        <span><ReceiptText /></span>
        <div><small>رقم الطلب</small><strong>#{order.number}</strong></div>
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
          <span><small>التوصيل</small><b>{order.driver || order.deliveryCompany || "غير محدد"}</b></span>
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
        <button type="button" className="primary-button" onClick={onEdit}><Edit3 /> تعديل</button>
      </div>
    </div>
  </Modal>
  {invoiceOpen && <InvoiceModal order={order} settings={settings} onClose={() => setInvoiceOpen(false)} />}
  </>;
}

export function SettingsView({ state, update, notify, network }: ViewProps) {
  const [tab, setTab] = useState<"identity" | "operations" | "delivery" | "network" | "backup" | "support">("identity");
  const [settings, setSettings] = useState({ ...state.settings });
  const [company, setCompany] = useState({ name: "", phone: "", baseFee: state.settings.defaultDeliveryFee, notes: "" });
  const [serverAddress, setServerAddress] = useState(network?.serverUrl ?? "http://127.0.0.1:4312");
  const [networkTest, setNetworkTest] = useState<"idle" | "testing" | "success" | "error">("idle");
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
  const addCompany = () => {
    if (!company.name.trim()) return;
    update((current) => ({ ...current, deliveryCompanies: [...current.deliveryCompanies, { id: uid(), ...company, active: true }] }));
    setCompany({ name: "", phone: "", baseFee: settings.defaultDeliveryFee, notes: "" });
    notify("تمت إضافة شركة التوصيل");
  };
  return <div className="settings-page">
    <div className="settings-tabs" role="tablist" aria-label="أقسام الإعدادات">
      <button role="tab" aria-selected={tab === "identity"} className={tab === "identity" ? "active" : ""} onClick={() => setTab("identity")}>
        <Store /><span><strong>بيانات المطعم</strong><small>الهوية والفاتورة</small></span>
      </button>
      <button role="tab" aria-selected={tab === "operations"} className={tab === "operations" ? "active" : ""} onClick={() => setTab("operations")}>
        <SlidersHorizontal /><span><strong>إعدادات التشغيل</strong><small>المطبخ والتوصيل</small></span>
      </button>
      <button role="tab" aria-selected={tab === "delivery"} className={tab === "delivery" ? "active" : ""} onClick={() => setTab("delivery")}>
        <Building2 /><span><strong>شركات التوصيل</strong><small>{state.deliveryCompanies.length} شركة مسجلة</small></span>
      </button>
      <button role="tab" aria-selected={tab === "network"} className={tab === "network" ? "active" : ""} onClick={() => setTab("network")}>
        <Network /><span><strong>السيرفر والشبكة</strong><small>{network?.status === "online" ? "متصل لحظيًا" : "إعداد أجهزة المطعم"}</small></span>
      </button>
      <button role="tab" aria-selected={tab === "backup"} className={tab === "backup" ? "active" : ""} onClick={() => setTab("backup")}>
        <DatabaseBackup /><span><strong>النسخ الاحتياطي</strong><small>تنزيل واسترجاع البيانات</small></span>
      </button>
      <button role="tab" aria-selected={tab === "support"} className={tab === "support" ? "active" : ""} onClick={() => setTab("support")}>
        <Headphones /><span><strong>الدعم الفني</strong><small>التواصل ومعلومات النظام</small></span>
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
          <button className="primary-button" onClick={save}><Save /> حفظ بيانات المطعم</button>
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

    {tab === "delivery" && <div className="panel" role="tabpanel">
      <div className="panel-title"><div><Building2 /><span><strong>شركات التوصيل</strong><small>تظهر للكاشير أثناء تسجيل الطلب</small></span></div></div>
      <div className="company-create">
        <input placeholder="اسم الشركة" value={company.name} onChange={(event) => setCompany({ ...company, name: event.target.value })} />
        <input placeholder="رقم التواصل" value={company.phone} onChange={(event) => setCompany({ ...company, phone: event.target.value })} />
        <input type="number" min="0" placeholder="التكلفة" value={company.baseFee || ""} onChange={(event) => setCompany({ ...company, baseFee: Number(event.target.value) })} />
        <button className="primary-button compact" onClick={addCompany}><Plus /> إضافة شركة</button>
      </div>
      <div className="company-list">{state.deliveryCompanies.map((item) => <div key={item.id}><Building2 /><span><strong>{item.name}</strong><small>{item.phone || "بدون رقم"} · {money(item.baseFee)}</small></span><button className={item.active ? "toggle active" : "toggle"} onClick={() => update((current) => ({ ...current, deliveryCompanies: current.deliveryCompanies.map((company) => company.id === item.id ? { ...company, active: !company.active } : company) }))}><i /></button></div>)}</div>
    </div>}

    {tab === "network" && <div className="panel network-settings-panel" role="tabpanel">
      <div className="panel-title"><div><Server /><span><strong>السيرفر المركزي والتحديث اللحظي</strong><small>كل أجهزة الكاشير والمطبخ يجب أن تتصل بنفس العنوان</small></span></div></div>
      <div className="network-settings-content">
        <div className={`network-status-card ${network?.status ?? "offline"}`}>
          <span><i /> {network?.status === "online" ? "متصل بالسيرفر" : network?.status === "connecting" ? "جاري الاتصال" : network?.status === "local" ? "وضع المتصفح المحلي" : "غير متصل"}</span>
          <strong dir="ltr">{network?.serverUrl}</strong>
        </div>
        <div className="network-guide">
          <div><strong>جهاز السيرفر الرئيسي</strong><small>اترك العنوان المحلي كما هو. عنوان توصيل الأجهزة الأخرى:</small><code>{network?.embeddedServer?.networkUrl ?? "سيظهر عنوان الشبكة عند تشغيل نسخة Windows"}</code></div>
          <div><strong>جهاز الكاشير أو المطبخ الإضافي</strong><small>اكتب عنوان جهاز السيرفر الظاهر هنا، ثم احفظ وأعد الاتصال.</small></div>
        </div>
        <div className="network-address-form">
          <label>عنوان السيرفر<input dir="ltr" value={serverAddress} onChange={(event) => { setServerAddress(event.target.value); setNetworkTest("idle"); }} placeholder="http://192.168.1.10:4312" /></label>
          <button className="soft-button" disabled={networkTest === "testing"} onClick={() => {
            setNetworkTest("testing");
            testServerConnection(serverAddress).then(() => setNetworkTest("success")).catch(() => setNetworkTest("error"));
          }}><RefreshCw /> {networkTest === "testing" ? "جاري الاختبار..." : "اختبار الاتصال"}</button>
          <button className="primary-button" onClick={() => network?.changeServerUrl(serverAddress)}><Save /> حفظ وإعادة الاتصال</button>
        </div>
        {networkTest === "success" && <p className="network-test-result success">تم الاتصال بالسيرفر بنجاح، ويمكن حفظ العنوان.</p>}
        {networkTest === "error" && <p className="network-test-result error">تعذر الوصول إلى هذا العنوان. راجع الشبكة وWindows Firewall.</p>}
      </div>
    </div>}

    {tab === "backup" && <div role="tabpanel"><BackupPanel state={state} update={update} notify={notify} /></div>}

    {tab === "support" && <div className="support-compact-container" role="tabpanel">
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

      <div className="support-compact-footer">
        <div>
          <ShieldCheck size={14} />
          <span>مرخص ومدعوم رسمياً من شركة <strong>FYC Solutions</strong></span>
        </div>
        <div>
          <Clock size={13} />
          <span>خدمة الدعم متوفرة طوال أيام الأسبوع 24/7</span>
        </div>
      </div>
    </div>}
  </div>;
}
