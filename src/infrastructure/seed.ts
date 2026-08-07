import type { AppState, MenuSection, Product, ProductCategory } from "../domain/types";

const initialShiftOpenedAt = new Date().toISOString();

export const products: Product[] = [
  { id: "p1", name: "مكرونة بشاميل", category: "صواني", section: "cooked", unit: "صينية وسط", price: 280, cost: 175, available: true, accent: "#e9a15c" },
  { id: "p2", name: "محشي مشكل", category: "محاشي", section: "cooked", unit: "كيلو", price: 190, cost: 112, available: true, accent: "#7e9a63" },
  { id: "p3", name: "فراخ محمرة", category: "فراخ", section: "cooked", unit: "فرخة", price: 360, cost: 270, available: true, accent: "#cc7655" },
  { id: "p4", name: "ورق عنب", category: "محاشي", section: "cooked", unit: "كيلو", price: 210, cost: 125, available: true, accent: "#6e8d5b" },
  { id: "p5", name: "كفتة في الفرن", category: "لحوم", section: "cooked", unit: "كيلو", price: 420, cost: 315, available: true, accent: "#a85f4d" },
  { id: "p6", name: "أرز بالشعرية", category: "إضافات", section: "cooked", unit: "طبق", price: 55, cost: 24, available: true, accent: "#d6b270" },
  { id: "p7", name: "ملوخية", category: "طواجن", section: "cooked", unit: "طبق", price: 70, cost: 31, available: true, accent: "#62845d" },
  { id: "p8", name: "رقاق باللحمة", category: "صواني", section: "cooked", unit: "صينية وسط", price: 330, cost: 220, available: true, accent: "#c48a54" },
  { id: "p9", name: "فراخ متبلة", category: "فراخ", section: "fresh", unit: "كيلو", price: 230, cost: 178, available: true, accent: "#db8e64" },
  { id: "p10", name: "كفتة جاهزة للتسوية", category: "لحوم", section: "fresh", unit: "كيلو", price: 350, cost: 282, available: true, accent: "#b36954" },
  { id: "p11", name: "سمبوسك لحمة", category: "مجمدات", section: "fresh", unit: "دستة", price: 135, cost: 78, available: true, accent: "#d3a565" },
  { id: "p12", name: "محشي جاهز للتسوية", category: "محاشي", section: "fresh", unit: "كيلو", price: 155, cost: 93, available: true, accent: "#829867" },
  { id: "p13", name: "بانيه متبل", category: "فراخ", section: "fresh", unit: "كيلو", price: 285, cost: 230, available: true, accent: "#d49b72" },
  { id: "p14", name: "صينية بطاطس بالفراخ", category: "صواني", section: "fresh", unit: "صينية", price: 310, cost: 235, available: false, accent: "#bb7f57" }
];

const categories: ProductCategory[] = [...new Map(products.map((product) => [
  `${product.section}-${product.category}`,
  {
    id: `cat-${product.section}-${product.category}`,
    name: product.category,
    section: product.section,
    color: product.accent,
    active: true
  } satisfies ProductCategory
])).values()];

export const sections: MenuSection[] = [
  { id: "cooked", name: "مطبوخ" },
  { id: "fresh", name: "طازة / غير مطبوخ" }
];

export const initialState: AppState = {
  products,
  sections,
  meals: [],
  categories,
  customers: [
    { id: "c1", name: "منى أحمد", phone: "01012345678", address: "شارع التحرير، الدقي، الدور الثالث", zone: "الدقي", ordersCount: 8, totalSpent: 2460, lastOrder: new Date(Date.now() - 86400000 * 2).toISOString() },
    { id: "c2", name: "أحمد ياسر", phone: "01123456789", address: "ميدان لبنان، المهندسين", zone: "المهندسين", ordersCount: 4, totalSpent: 1380, lastOrder: new Date(Date.now() - 86400000 * 5).toISOString() },
    { id: "c3", name: "سارة محمود", phone: "01234567890", address: "شارع فيصل الرئيسي، الطالبية", zone: "فيصل", ordersCount: 11, totalSpent: 4240, lastOrder: new Date(Date.now() - 86400000).toISOString() }
  ],
  orders: [],
  drivers: [
    { id: "d1", name: "محمود علي", phone: "01098765432", active: true, vehicle: "موتوسيكل", createdAt: new Date().toISOString() },
    { id: "d2", name: "كريم حسن", phone: "01187654321", active: true, vehicle: "موتوسيكل", createdAt: new Date().toISOString() }
  ],
  deliveryCompanies: [
    { id: "dc1", name: "مرسول", phone: "", baseFee: 45, active: true, notes: "شركة توصيل خارجية" },
    { id: "dc2", name: "شركة توصيل محلية", phone: "01000000000", baseFee: 35, active: true }
  ],
  driverSettlements: [],
  ingredients: [
    { id: "i1", name: "فراخ", unit: "كجم", stockQty: 12, minStock: 4, unitCost: 175, active: true },
    { id: "i2", name: "لحمة مفرومة", unit: "كجم", stockQty: 6, minStock: 2, unitCost: 310, active: true },
    { id: "i3", name: "أرز", unit: "كجم", stockQty: 18, minStock: 5, unitCost: 38, active: true },
    { id: "i4", name: "مكرونة", unit: "كجم", stockQty: 9, minStock: 3, unitCost: 42, active: true },
    { id: "i5", name: "لبن ومنتجات ألبان", unit: "لتر", stockQty: 11, minStock: 3, unitCost: 48, active: true },
    { id: "i6", name: "خضار مشكل", unit: "كجم", stockQty: 14, minStock: 4, unitCost: 32, active: true },
    { id: "i7", name: "ورق عنب", unit: "كجم", stockQty: 3.5, minStock: 2, unitCost: 85, active: true },
    { id: "i8", name: "سمن وزيوت", unit: "كجم", stockQty: 4, minStock: 1.5, unitCost: 165, active: true },
    { id: "i9", name: "توابل وصلصة", unit: "كجم", stockQty: 2.5, minStock: 1, unitCost: 120, active: true },
    { id: "i10", name: "مواد تغليف", unit: "قطعة", stockQty: 120, minStock: 40, unitCost: 4, active: true }
  ],
  recipes: [
    { id: "r1", productId: "p1", ingredientId: "i4", quantity: 1.2 },
    { id: "r2", productId: "p1", ingredientId: "i5", quantity: 1 },
    { id: "r3", productId: "p1", ingredientId: "i2", quantity: 0.35 },
    { id: "r4", productId: "p2", ingredientId: "i3", quantity: 0.45 },
    { id: "r5", productId: "p2", ingredientId: "i6", quantity: 0.55 },
    { id: "r6", productId: "p3", ingredientId: "i1", quantity: 1.5 },
    { id: "r7", productId: "p3", ingredientId: "i8", quantity: 0.08 },
    { id: "r8", productId: "p4", ingredientId: "i7", quantity: 0.45 },
    { id: "r9", productId: "p4", ingredientId: "i3", quantity: 0.5 },
    { id: "r10", productId: "p5", ingredientId: "i2", quantity: 1 },
    { id: "r11", productId: "p6", ingredientId: "i3", quantity: 0.25 },
    { id: "r12", productId: "p8", ingredientId: "i2", quantity: 0.45 },
    { id: "r13", productId: "p9", ingredientId: "i1", quantity: 1 },
    { id: "r14", productId: "p10", ingredientId: "i2", quantity: 1 },
    { id: "r15", productId: "p12", ingredientId: "i3", quantity: 0.45 },
    { id: "r16", productId: "p12", ingredientId: "i6", quantity: 0.55 }
  ],
  stockMovements: [],
  cashTransactions: [],
  cashShifts: [{ id: "initial-shift", openedAt: initialShiftOpenedAt, openingBalance: 500 }],
  suppliers: [],
  purchaseInvoices: [],
  shiftOpeningBalance: 500,
  shiftOpenedAt: initialShiftOpenedAt,
  nextOrderNumber: 1001,
  nextPurchaseInvoiceNumber: 1,
  settings: {
    restaurantName: "بيتنا",
    subtitle: "أكل بيتي معمول بحب",
    phone: "",
    address: "",
    invoiceFooter: "شكرًا لاختياركم بيتنا",
    defaultDeliveryFee: 30,
    kitchenWarningMinutes: 30,
    kitchenLateMinutes: 45
  }
};
