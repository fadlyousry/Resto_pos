// Internal implementation. Consume it through the public feature index files.
import { useState } from "react";
import {
  Boxes, Building2, ChevronLeft, ClipboardList, Edit3, ImagePlus, PackagePlus,
  Plus, ReceiptText, Save, Search, Settings, Trash2
} from "lucide-react";
import type {
  AppState, Customer, Order, OrderItem, Product, ProductCategory, ProductSection
} from "../../domain/types";
import type { ViewProps } from "../../shared/contracts";
import { money, shortDate } from "../../shared/format";
import { uid } from "../../shared/id";
import { Modal } from "../../shared/ui";

const emptyProduct = (category?: ProductCategory): Product => ({
  id: uid(), name: "", category: category?.name ?? "", section: category?.section ?? "cooked",
  unit: "طبق", price: 0, cost: 0, available: true, accent: category?.color ?? "#6f927d"
});

export function ProductCatalogView({ state, update, notify }: ViewProps) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [section, setSection] = useState<"all" | ProductSection>("all");
  const [search, setSearch] = useState("");
  const products = state.products.filter((product) =>
    (section === "all" || product.section === section) && product.name.includes(search.trim())
  );
  const saveProduct = () => {
    if (!editing?.name.trim() || !editing.category || !editing.unit || editing.price < 0 || editing.cost < 0) return;
    update((current) => ({
      ...current,
      products: current.products.some((item) => item.id === editing.id)
        ? current.products.map((item) => item.id === editing.id ? editing : item)
        : [editing, ...current.products]
    }));
    setEditing(null);
    notify("تم حفظ الصنف");
  };
  const toggle = (id: string) => update((current) => ({
    ...current, products: current.products.map((product) => product.id === id ? { ...product, available: !product.available } : product)
  }));
  const categories = state.categories.filter((item) => item.active && (!editing || item.section === editing.section));

  return <div className="management-page">
    <div className="panel">
      <div className="panel-head management-head">
        <div>
          <strong>الأصناف والتصنيفات</strong>
          <small>{state.products.filter((item) => item.available).length} متاح من {state.products.length} صنف</small>
        </div>
        <div className="management-actions">
          <button className="soft-button" onClick={() => setCategoriesOpen(true)}><Boxes /> إدارة التصنيفات</button>
          <button className="primary-button compact" onClick={() => setEditing(emptyProduct(state.categories.find((item) => item.active)))}><PackagePlus /> صنف جديد</button>
        </div>
      </div>
      <div className="management-filters">
        <label className="search-box"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن صنف..." /></label>
        <div className="filter-tabs">
          <button className={section === "all" ? "active" : ""} onClick={() => setSection("all")}>الكل</button>
          <button className={section === "cooked" ? "active" : ""} onClick={() => setSection("cooked")}>مطبوخ</button>
          <button className={section === "fresh" ? "active" : ""} onClick={() => setSection("fresh")}>طازة</button>
        </div>
      </div>
      <div className="product-management">
        {products.map((product) => <div className={product.available ? "product-manage-row editable" : "product-manage-row editable unavailable"} key={product.id}>
          <span className="color-dot" style={{ background: product.accent }} />
          <div><strong>{product.name}</strong><small>{product.section === "cooked" ? "مطبوخ" : "طازة"} · {product.category}</small></div>
          <span>{product.unit}</span>
          <span className="product-cost"><small>تكلفة {money(product.cost)}</small><b>{money(product.price)}</b></span>
          <button className="icon-row-button" title="تعديل الصنف" onClick={() => setEditing({ ...product })}><Edit3 /></button>
          <button className={product.available ? "toggle active" : "toggle"} title="إتاحة الصنف" onClick={() => toggle(product.id)}><i /></button>
        </div>)}
      </div>
    </div>

    {editing && <Modal title={state.products.some((item) => item.id === editing.id) ? "تعديل الصنف" : "إضافة صنف"} onClose={() => setEditing(null)} size="wide">
      <div className="editor-grid">
        <label>اسم الصنف<input autoFocus value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
        <label>القسم<select value={editing.section} onChange={(event) => {
          const next = event.target.value as ProductSection;
          const first = state.categories.find((item) => item.section === next && item.active);
          setEditing({ ...editing, section: next, category: first?.name ?? "" });
        }}><option value="cooked">مطبوخ</option><option value="fresh">طازة / غير مطبوخ</option></select></label>
        <label>التصنيف<select value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })}>
          <option value="">اختر التصنيف</option>{categories.map((item) => <option key={item.id}>{item.name}</option>)}
        </select></label>
        <label>وحدة البيع<input value={editing.unit} onChange={(event) => setEditing({ ...editing, unit: event.target.value })} placeholder="طبق، كيلو، صينية..." /></label>
        <label>سعر البيع<input type="number" min="0" value={editing.price || ""} onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })} /></label>
        <label>التكلفة<input type="number" min="0" value={editing.cost || ""} onChange={(event) => setEditing({ ...editing, cost: Number(event.target.value) })} /></label>
        <label>لون الصنف<input type="color" value={editing.accent} onChange={(event) => setEditing({ ...editing, accent: event.target.value })} /></label>
        <label className="check-label"><input type="checkbox" checked={editing.available} onChange={(event) => setEditing({ ...editing, available: event.target.checked })} /> متاح للبيع حاليًا</label>
      </div>
      <button className="primary-button modal-save" onClick={saveProduct}><Save /> حفظ الصنف</button>
    </Modal>}
    {categoriesOpen && <CategoryManager state={state} update={update} notify={notify} onClose={() => setCategoriesOpen(false)} />}
  </div>;
}

function CategoryManager({ state, update, notify, onClose }: ViewProps & { onClose: () => void }) {
  const [form, setForm] = useState<Omit<ProductCategory, "id">>({ name: "", section: "cooked", color: "#6f927d", active: true });
  const [editingId, setEditingId] = useState("");
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
    setEditingId(""); setForm({ ...form, name: "" }); notify(editingId ? "تم تعديل التصنيف وتحديث أصنافه" : "تمت إضافة التصنيف");
  };
  return <Modal title="إدارة التصنيفات" onClose={onClose} size="wide">
    <div className="category-create">
      <label>اسم التصنيف<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>القسم<select value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value as ProductSection })}><option value="cooked">مطبوخ</option><option value="fresh">طازة</option></select></label>
      <label>اللون<input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
      <button className="primary-button" onClick={add}>{editingId ? <Save /> : <Plus />} {editingId ? "حفظ" : "إضافة"}</button>
    </div>
    <div className="category-manager-list">{state.categories.map((category) => <div key={category.id}>
      <span className="color-dot" style={{ background: category.color }} />
      <span><strong>{category.name}</strong><small>{category.section === "cooked" ? "مطبوخ" : "طازة"}</small></span>
      <button className="icon-row-button" onClick={() => { setEditingId(category.id); setForm({ name: category.name, section: category.section, color: category.color, active: category.active }); }}><Edit3 /></button>
      <button className={category.active ? "toggle active" : "toggle"} onClick={() => update((current) => ({
        ...current, categories: current.categories.map((item) => item.id === category.id ? { ...item, active: !item.active } : item)
      }))}><i /></button>
    </div>)}</div>
  </Modal>;
}

export function CustomerRecordsView({ state, update, notify }: ViewProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const customers = state.customers.filter((customer) => customer.name.includes(search) || customer.phone.includes(search));
  return <div className="panel">
    <div className="panel-head">
      <label className="search-box"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الموبايل..." /></label>
      <button className="primary-button compact" onClick={() => setAdding(true)}><Plus /> عميل جديد</button>
    </div>
    <div className="customer-cards">
      {customers.map((customer) => <article className="clickable-card" key={customer.id} onClick={() => setSelected({ ...customer })}>
        <div className="customer-card-head"><span className="customer-avatar">{customer.name.charAt(0)}</span><div><strong>{customer.name}</strong><small>{customer.phone}</small></div><ChevronLeft /></div>
        <p>{customer.address}</p>
        <div className="customer-metrics"><span><small>عدد الطلبات</small><b>{state.orders.filter((order) => order.customerId === customer.id).length}</b></span><span><small>إجمالي المشتريات</small><b>{money(customer.totalSpent)}</b></span><span><small>نقاط الولاء</small><b>{customer.loyaltyPoints ?? 0}</b></span></div>
      </article>)}
    </div>
    {adding && <CustomerForm onClose={() => setAdding(false)} onSave={(customer) => {
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
    }} onOrder={setEditingOrder} />}
    {editingOrder && <OrderEditorModal order={editingOrder} state={state} update={update} notify={notify} onClose={() => setEditingOrder(null)} />}
  </div>;
}

export function CustomerForm({ onClose, onSave }: { onClose: () => void; onSave: (customer: Customer) => void }) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", zone: "", notes: "" });
  const save = () => {
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim()) return;
    onSave({ id: uid(), ...form, ordersCount: 0, totalSpent: 0, loyaltyPoints: 0 });
  };
  return <Modal title="إضافة عميل جديد" onClose={onClose}><div className="form-stack">
    <label>اسم العميل<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label>رقم الموبايل<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
    <label>العنوان بالتفصيل<textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
    <label>ملاحظات العميل<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
    <button className="primary-button" onClick={save}><Save /> حفظ واختيار العميل</button>
  </div></Modal>;
}

export function CustomerFile({ customer, state, onClose, onEdit, onOrder }: {
  customer: Customer; state: AppState; onClose: () => void; onEdit: (customer: Customer) => void; onOrder: (order: Order) => void
}) {
  const [form, setForm] = useState({ ...customer });
  const orders = state.orders.filter((order) => order.customerId === customer.id);
  return <Modal title={`ملف العميل: ${customer.name}`} onClose={onClose} size="wide">
    <div className="customer-file">
      <div className="customer-profile-editor">
        <div className="customer-file-title"><span className="customer-avatar">{customer.name.charAt(0)}</span><span><strong>{customer.name}</strong><small>{orders.length} طلب مسجل</small></span></div>
        <label>الاسم<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>الموبايل<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label>العنوان بالتفصيل<textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
        <label>ملاحظات<textarea value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <button className="soft-button" onClick={() => onEdit(form)}><Save /> حفظ بيانات العميل</button>
      </div>
      <div className="customer-order-history">
        <h3><ClipboardList /> سجل الطلبات</h3>
        {orders.map((order) => <button key={order.id} onClick={() => onOrder(order)}>
          <span><strong>طلب #{order.number}</strong><small>{shortDate(order.createdAt)} · {order.items.length} أصناف</small></span>
          <span><b>{money(order.total)}</b><small>{order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}</small></span>
          <Edit3 />
        </button>)}
        {!orders.length && <div className="simple-empty"><ReceiptText /><span>لا توجد طلبات للعميل حتى الآن</span></div>}
      </div>
    </div>
  </Modal>;
}

export function OrderEditorModal({ order, state, update, notify, onClose }: ViewProps & { order: Order; onClose: () => void }) {
  const [draft, setDraft] = useState<Order>({ ...order, items: order.items.map((item) => ({ ...item })) });
  const [productId, setProductId] = useState("");
  const subtotal = draft.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = Math.max(0, subtotal + draft.deliveryFee - draft.discount);
  const changeQty = (id: string, delta: number) => setDraft({
    ...draft, items: draft.items.map((item) => item.productId === id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0)
  });
  const addProduct = () => {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;
    const found = draft.items.find((item) => item.productId === product.id);
    setDraft({
      ...draft,
      items: found ? draft.items.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...draft.items, { productId: product.id, name: product.name, unit: product.unit, price: product.price, cost: product.cost, quantity: 1, section: product.section }]
    });
    setProductId("");
  };
  const save = () => {
    if (!draft.items.length) return;
    const oldUsage = recipeUsage(order.items, state);
    const newUsage = recipeUsage(draft.items, state);
    const now = new Date().toISOString();
    const totalDifference = total - order.total;
    const paymentTransactions: AppState["cashTransactions"] = [];
    if (order.paymentStatus === "pending" && draft.paymentStatus === "paid") paymentTransactions.push({
      id: uid(), type: "collection", method: draft.paymentMethod, amount: total, direction: "in",
      description: `تحصيل بعد تعديل فاتورة #${order.number}`, orderId: order.id, createdAt: now
    });
    if (order.paymentStatus === "paid" && draft.paymentStatus === "pending") paymentTransactions.push({
      id: uid(), type: "withdrawal", method: order.paymentMethod, amount: order.total, direction: "out",
      description: `عكس تحصيل فاتورة #${order.number}`, orderId: order.id, createdAt: now
    });
    if (order.paymentStatus === "paid" && draft.paymentStatus === "paid" && totalDifference !== 0) paymentTransactions.push({
      id: uid(), type: totalDifference > 0 ? "deposit" : "withdrawal",
      method: draft.paymentMethod, amount: Math.abs(totalDifference),
      direction: totalDifference > 0 ? "in" : "out",
      description: `فرق تعديل فاتورة #${order.number}`, orderId: order.id, createdAt: now
    });
    update((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === order.id ? { ...draft, subtotal, total } : item),
      ingredients: current.ingredients.map((ingredient) => {
        const delta = (newUsage.get(ingredient.id) ?? 0) - (oldUsage.get(ingredient.id) ?? 0);
        return { ...ingredient, stockQty: Math.max(0, ingredient.stockQty - delta) };
      }),
      stockMovements: [...current.stockMovements, ...[...new Set([...oldUsage.keys(), ...newUsage.keys()])].flatMap((ingredientId) => {
        const delta = (newUsage.get(ingredientId) ?? 0) - (oldUsage.get(ingredientId) ?? 0);
        if (!delta) return [];
        const ingredient = current.ingredients.find((item) => item.id === ingredientId);
        return [{
          id: uid(), ingredientId, ingredientName: ingredient?.name ?? "مكون",
          type: delta > 0 ? "consume" as const : "adjustment" as const,
          quantity: Math.abs(delta), unitCost: ingredient?.unitCost ?? 0,
          description: `تسوية تعديل طلب #${order.number}`, orderId: order.id, createdAt: now
        }];
      })],
      customers: current.customers.map((customer) => customer.id === order.customerId ? {
        ...customer, totalSpent: Math.max(0, customer.totalSpent + totalDifference)
      } : customer),
      cashTransactions: [...paymentTransactions, ...current.cashTransactions]
    }));
    notify(`تم تعديل الطلب #${order.number} وتسوية المخزون`);
    onClose();
  };
  const deliveryType = draft.driverId ? "driver" : draft.deliveryCompanyId ? "company" : "later";
  return <Modal title={`تعديل الطلب #${order.number}`} onClose={onClose} size="wide">
    <div className="order-editor">
      <div className="order-editor-items">
        <div className="add-order-item"><select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">إضافة صنف...</option>{state.products.filter((item) => item.available).map((item) => <option value={item.id} key={item.id}>{item.name} — {money(item.price)}</option>)}</select><button onClick={addProduct}><Plus /></button></div>
        {draft.items.map((item) => <div key={item.productId}><span><strong>{item.name}</strong><small>{money(item.price)} / {item.unit}</small></span><span className="edit-quantity"><button onClick={() => changeQty(item.productId, -1)}>-</button><b>{item.quantity}</b><button onClick={() => changeQty(item.productId, 1)}>+</button></span><b>{money(item.price * item.quantity)}</b><button className="icon-row-button" onClick={() => changeQty(item.productId, -item.quantity)}><Trash2 /></button></div>)}
      </div>
      <div className="order-editor-fields">
        <label>عنوان التوصيل<textarea value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
        <label>موعد التوصيل<input type="datetime-local" value={draft.scheduledFor?.slice(0, 16) ?? ""} onChange={(event) => setDraft({ ...draft, scheduledFor: event.target.value || undefined })} /></label>
        <label>ملاحظات<textarea value={draft.note ?? ""} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
        <div className="form-row"><label>التوصيل<input type="number" min="0" value={draft.deliveryFee} onChange={(event) => setDraft({ ...draft, deliveryFee: Number(event.target.value) })} /></label><label>الخصم<input type="number" min="0" value={draft.discount} onChange={(event) => setDraft({ ...draft, discount: Number(event.target.value) })} /></label></div>
        <div className="form-row">
          <label>طريقة الدفع<select value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value as Order["paymentMethod"] })}><option value="cash">نقدي</option><option value="instapay">إنستاباي</option><option value="vodafone">فودافون كاش</option></select></label>
          <label>حالة التحصيل<select value={draft.paymentStatus} onChange={(event) => setDraft({ ...draft, paymentStatus: event.target.value as Order["paymentStatus"] })}><option value="pending">معلق</option><option value="paid">تم التحصيل</option></select></label>
        </div>
        <label>جهة التوصيل<select value={deliveryType} onChange={(event) => {
          if (event.target.value === "later") setDraft({ ...draft, driverId: undefined, driver: undefined, deliveryCompanyId: undefined, deliveryCompany: undefined });
          else if (event.target.value === "driver") setDraft({ ...draft, deliveryCompanyId: undefined, deliveryCompany: undefined, driverId: state.drivers.find((item) => item.active)?.id, driver: state.drivers.find((item) => item.active)?.name });
          else setDraft({ ...draft, driverId: undefined, driver: undefined, deliveryCompanyId: state.deliveryCompanies.find((item) => item.active)?.id, deliveryCompany: state.deliveryCompanies.find((item) => item.active)?.name });
        }}><option value="later">تحديد لاحقًا</option><option value="driver">مندوب المطعم</option><option value="company">شركة توصيل</option></select></label>
        {deliveryType === "driver" && <label>المندوب<select value={draft.driverId} onChange={(event) => { const item = state.drivers.find((driver) => driver.id === event.target.value); setDraft({ ...draft, driverId: item?.id, driver: item?.name }); }}>{state.drivers.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        {deliveryType === "company" && <label>الشركة<select value={draft.deliveryCompanyId} onChange={(event) => { const item = state.deliveryCompanies.find((company) => company.id === event.target.value); setDraft({ ...draft, deliveryCompanyId: item?.id, deliveryCompany: item?.name }); }}>{state.deliveryCompanies.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        <div className="editor-total"><span>الإجمالي بعد التعديل</span><strong>{money(total)}</strong></div>
        <button className="primary-button" onClick={save}><Save /> حفظ التعديل</button>
      </div>
    </div>
  </Modal>;
}

function recipeUsage(items: OrderItem[], state: AppState) {
  const usage = new Map<string, number>();
  items.forEach((item) => state.recipes.filter((recipe) => recipe.productId === item.productId).forEach((recipe) => {
    usage.set(recipe.ingredientId, (usage.get(recipe.ingredientId) ?? 0) + recipe.quantity * item.quantity);
  }));
  return usage;
}

export function SettingsView({ state, update, notify }: ViewProps) {
  const [settings, setSettings] = useState({ ...state.settings });
  const [company, setCompany] = useState({ name: "", phone: "", baseFee: state.settings.defaultDeliveryFee, notes: "" });
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
    <div className="panel settings-brand-panel">
      <div className="panel-title"><div><Settings /><span><strong>هوية المطعم والفاتورة</strong><small>التغييرات تظهر في القائمة الجانبية وكل الفواتير</small></span></div></div>
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
          <label>رسوم التوصيل الافتراضية<input type="number" min="0" value={settings.defaultDeliveryFee} onChange={(event) => setSettings({ ...settings, defaultDeliveryFee: Number(event.target.value) })} /></label>
          <label>تنبيه المطبخ بعد (دقيقة)<input type="number" min="1" value={settings.kitchenWarningMinutes} onChange={(event) => setSettings({ ...settings, kitchenWarningMinutes: Number(event.target.value) })} /></label>
          <label>اعتبار الطلب متأخر بعد (دقيقة)<input type="number" min="1" value={settings.kitchenLateMinutes} onChange={(event) => setSettings({ ...settings, kitchenLateMinutes: Number(event.target.value) })} /></label>
          <button className="primary-button" onClick={save}><Save /> حفظ الإعدادات</button>
        </div>
      </div>
    </div>
    <div className="panel">
      <div className="panel-title"><div><Building2 /><span><strong>شركات التوصيل</strong><small>تظهر للكاشير أثناء تسجيل الطلب</small></span></div></div>
      <div className="company-create">
        <input placeholder="اسم الشركة" value={company.name} onChange={(event) => setCompany({ ...company, name: event.target.value })} />
        <input placeholder="رقم التواصل" value={company.phone} onChange={(event) => setCompany({ ...company, phone: event.target.value })} />
        <input type="number" min="0" placeholder="التكلفة" value={company.baseFee || ""} onChange={(event) => setCompany({ ...company, baseFee: Number(event.target.value) })} />
        <button className="primary-button compact" onClick={addCompany}><Plus /> إضافة شركة</button>
      </div>
      <div className="company-list">{state.deliveryCompanies.map((item) => <div key={item.id}><Building2 /><span><strong>{item.name}</strong><small>{item.phone || "بدون رقم"} · {money(item.baseFee)}</small></span><button className={item.active ? "toggle active" : "toggle"} onClick={() => update((current) => ({ ...current, deliveryCompanies: current.deliveryCompanies.map((company) => company.id === item.id ? { ...company, active: !company.active } : company) }))}><i /></button></div>)}</div>
    </div>
  </div>;
}
