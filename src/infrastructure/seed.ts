import type { AppState, Meal, MenuSection, Product, ProductCategory } from "../domain/types";
import {
  createDefaultTreasuries, DEFAULT_PURCHASES_TREASURY_ID, DEFAULT_SALES_TREASURY_ID
} from "../shared/treasury";

const initialShiftOpenedAt = new Date().toISOString();

const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&q=80`;

export const products: Product[] = [
  { id: "p1", name: "أرز بالشعرية", category: "الأرز والإضافات", section: "meals", unit: "كيلو", price: 90, cost: 38, available: true, accent: "#c58b52", reportingMode: "weighted", imageDataUrl: photo("photo-1512058564366-95c59f581b3d") , options: [{ id: "p1-quarter", name: "ربع كيلو", unit: "كجم", price: 25, cost: 10, recipeMultiplier: 0.25 }, { id: "p1-half", name: "نصف كيلو", unit: "كجم", price: 48, cost: 20, recipeMultiplier: 0.5 }, { id: "p1-kilo", name: "كيلو", unit: "كجم", price: 90, cost: 38, recipeMultiplier: 1 }] },
  { id: "p2", name: "محشي مشكل", category: "المحاشي", section: "meals", unit: "كيلو", price: 240, cost: 135, available: true, accent: "#4e8a68", reportingMode: "weighted", imageDataUrl: photo("photo-1601050690597-df0568f70950"), options: [{ id: "p2-quarter", name: "ربع كيلو", unit: "كجم", price: 65, cost: 36, recipeMultiplier: 0.25 }, { id: "p2-half", name: "نصف كيلو", unit: "كجم", price: 125, cost: 70, recipeMultiplier: 0.5 }, { id: "p2-kilo", name: "كيلو", unit: "كجم", price: 240, cost: 135, recipeMultiplier: 1 }] },
  { id: "p3", name: "ورق عنب", category: "المحاشي", section: "meals", unit: "كيلو", price: 260, cost: 145, available: true, accent: "#4f8b5c", reportingMode: "weighted", imageDataUrl: photo("photo-1625944525533-473f1a3d54e7"), options: [{ id: "p3-half", name: "نصف كيلو", unit: "كجم", price: 135, cost: 75, recipeMultiplier: 0.5 }, { id: "p3-kilo", name: "كيلو", unit: "كجم", price: 260, cost: 145, recipeMultiplier: 1 }] },
  { id: "p4", name: "فراخ مشوية", category: "المشاوي", section: "meals", unit: "فرخة", price: 360, cost: 255, available: true, accent: "#b9654b", imageDataUrl: photo("photo-1532550907401-a500c9a57435"), options: [{ id: "p4-quarter", name: "ربع فرخة", unit: "قطعة", price: 120, cost: 85, recipeMultiplier: 0.25 }, { id: "p4-half", name: "نصف فرخة", unit: "قطعة", price: 220, cost: 155, recipeMultiplier: 0.5 }, { id: "p4-whole", name: "فرخة كاملة", unit: "قطعة", price: 360, cost: 255, recipeMultiplier: 1 }] },
  { id: "p5", name: "شيش طاووق", category: "المشاوي", section: "meals", unit: "طبق", price: 280, cost: 170, available: true, accent: "#c16c4b", imageDataUrl: photo("photo-1599487488170-d11ec9c172f0") },
  { id: "p6", name: "كفتة مشوية", category: "المشاوي", section: "meals", unit: "طبق", price: 300, cost: 190, available: true, accent: "#a95743", imageDataUrl: photo("photo-1555939594-58d7cb561ad1") },
  { id: "p7", name: "مكرونة بشاميل", category: "الصواني", section: "meals", unit: "صينية", price: 320, cost: 205, available: true, accent: "#d09255", imageDataUrl: photo("photo-1473093295043-cdd812d0e601"), options: [{ id: "p7-small", name: "صغير", unit: "صينية", price: 140, cost: 90, recipeMultiplier: 0.4 }, { id: "p7-medium", name: "وسط", unit: "صينية", price: 230, cost: 145, recipeMultiplier: 0.7 }, { id: "p7-large", name: "كبير", unit: "صينية", price: 320, cost: 205, recipeMultiplier: 1 }] },
  { id: "p8", name: "بيتزا مارغريتا", category: "البيتزا", section: "meals", unit: "بيتزا", price: 180, cost: 105, available: true, accent: "#d16c45", imageDataUrl: photo("photo-1574071318508-1cdbab80d002"), options: [{ id: "p8-small", name: "صغير", unit: "بيتزا", price: 120, cost: 70, recipeMultiplier: 0.55 }, { id: "p8-medium", name: "وسط", unit: "بيتزا", price: 180, cost: 105, recipeMultiplier: 0.8 }, { id: "p8-large", name: "كبير", unit: "بيتزا", price: 250, cost: 145, recipeMultiplier: 1.1 }] },
  { id: "p9", name: "بيتزا فراخ باربكيو", category: "البيتزا", section: "meals", unit: "بيتزا", price: 280, cost: 165, available: true, accent: "#b85b42", imageDataUrl: photo("photo-1565299624946-b28f40a0ae38"), options: [{ id: "p9-small", name: "صغير", unit: "بيتزا", price: 180, cost: 105, recipeMultiplier: 0.55 }, { id: "p9-medium", name: "وسط", unit: "بيتزا", price: 230, cost: 135, recipeMultiplier: 0.8 }, { id: "p9-large", name: "كبير", unit: "بيتزا", price: 280, cost: 165, recipeMultiplier: 1.1 }] },
  { id: "p10", name: "بطاطس محمرة", category: "المقبلات", section: "meals", unit: "طبق", price: 75, cost: 28, available: true, accent: "#d8a34e", imageDataUrl: photo("photo-1573080496219-bb080dd4f877") },
  { id: "p11", name: "سلطة خضراء", category: "المقبلات", section: "meals", unit: "طبق", price: 65, cost: 24, available: true, accent: "#63a36f", imageDataUrl: photo("photo-1512621776951-a57141f2eefe") },
  { id: "p12", name: "كشري", category: "الأطباق الرئيسية", section: "meals", unit: "علبة", price: 85, cost: 38, available: true, accent: "#b87943", imageDataUrl: photo("photo-1601050690117-94f5f6fa8bd7"), options: [{ id: "p12-small", name: "صغير", unit: "علبة", price: 55, cost: 25, recipeMultiplier: 0.6 }, { id: "p12-medium", name: "وسط", unit: "علبة", price: 70, cost: 31, recipeMultiplier: 0.8 }, { id: "p12-large", name: "كبير", unit: "علبة", price: 85, cost: 38, recipeMultiplier: 1 }] },
  { id: "d1", name: "مياه معدنية", category: "مشروبات باردة", section: "drinks", unit: "زجاجة", price: 15, cost: 6, available: true, accent: "#3c91b5", imageDataUrl: photo("photo-1548839140-29a749e1cf4d") },
  { id: "d2", name: "بيبسي كان", category: "مشروبات غازية", section: "drinks", unit: "كان", price: 35, cost: 18, available: true, accent: "#c43d3d", imageDataUrl: photo("photo-1629203849820-fdd70d49c38e") },
  { id: "d3", name: "سفن أب كان", category: "مشروبات غازية", section: "drinks", unit: "كان", price: 35, cost: 18, available: true, accent: "#5e9b5a", imageDataUrl: photo("photo-1624517452488-04869289c4ca") },
  { id: "d4", name: "عصير برتقال فريش", category: "عصائر فريش", section: "drinks", unit: "كوب", price: 70, cost: 32, available: true, accent: "#e99437", imageDataUrl: photo("photo-1600271886742-f049cd451bba"), options: [{ id: "d4-small", name: "صغير", unit: "كوب", price: 45, cost: 20, recipeMultiplier: 0.6 }, { id: "d4-large", name: "كبير", unit: "كوب", price: 70, cost: 32, recipeMultiplier: 1 }] },
  { id: "d5", name: "عصير مانجو فريش", category: "عصائر فريش", section: "drinks", unit: "كوب", price: 80, cost: 38, available: true, accent: "#e4a62b", imageDataUrl: photo("photo-1553279768-865429fa0078"), options: [{ id: "d5-small", name: "صغير", unit: "كوب", price: 50, cost: 24, recipeMultiplier: 0.6 }, { id: "d5-large", name: "كبير", unit: "كوب", price: 80, cost: 38, recipeMultiplier: 1 }] },
  { id: "d6", name: "ليمون بالنعناع", category: "عصائر فريش", section: "drinks", unit: "كوب", price: 65, cost: 27, available: true, accent: "#6da34f", imageDataUrl: photo("photo-1513558161293-caad8c7952b0") },
  { id: "d7", name: "شاي", category: "مشروبات ساخنة", section: "drinks", unit: "كوب", price: 25, cost: 7, available: true, accent: "#9a6b3c", imageDataUrl: photo("photo-1576092768241-dec231879fc3") },
  { id: "d8", name: "قهوة تركي", category: "مشروبات ساخنة", section: "drinks", unit: "فنجان", price: 45, cost: 14, available: true, accent: "#70452d", imageDataUrl: photo("photo-1495474472287-4d71bcdd2085") },
  { id: "d9", name: "كابتشينو", category: "مشروبات ساخنة", section: "drinks", unit: "كوب", price: 85, cost: 32, available: true, accent: "#b47d54", imageDataUrl: photo("photo-1572442388796-11668a67e53d") },
  { id: "d10", name: "ميلك شيك شوكولاتة", category: "مشروبات باردة", section: "drinks", unit: "كوب", price: 110, cost: 52, available: true, accent: "#85533c", imageDataUrl: photo("photo-1577805947697-89e18249d767") },
  { id: "d11", name: "مشروب غازي زجاجة", category: "مشروبات غازية", section: "drinks", unit: "زجاجة", price: 45, cost: 24, available: true, accent: "#6b7e9b", imageDataUrl: photo("photo-1554866585-cd94860890b7") },
  { id: "d12", name: "صودا بالليمون", category: "مشروبات باردة", section: "drinks", unit: "كوب", price: 60, cost: 22, available: true, accent: "#8fb7ae", imageDataUrl: photo("photo-1513558161293-caad8c7952b0") }
];

export const categories: ProductCategory[] = [...new Map(products.map((product) => [
  `${product.section}-${product.category}`,
  {
    id: `cat-${product.section}-${product.category}`,
    name: product.category,
    section: product.section,
    color: product.accent,
    active: true
  } satisfies ProductCategory
])).values()];

/** Detects the original sample menu so it can be replaced on existing installations once. */
export function isLegacyDemoMenu(menu: Pick<AppState, "products" | "sections">): boolean {
  // The original sample menu used these two sections. Some installations may
  // contain extra sample products added later, so section IDs are the reliable
  // migration signal rather than an exact product count.
  return menu.sections.some((section) => section.id === "cooked")
    && menu.sections.some((section) => section.id === "fresh")
    && !menu.sections.some((section) => section.id === "drinks");
}

export const sections: MenuSection[] = [
  { id: "meals", name: "الأكل" },
  { id: "drinks", name: "المشروبات" }
];

export const meals: Meal[] = [
  {
    id: "meal-1", name: "وجبة فراخ مشوية", price: 390, available: true,
    description: "ربع فرخة مشوية مع أرز وسلطة وبطاطس",
    components: [
      { productId: "p4", optionId: "p4-quarter", optionName: "ربع فرخة", name: "فراخ مشوية", unit: "قطعة", price: 120, cost: 85, recipeMultiplier: 0.25, quantity: 1 },
      { productId: "p1", optionId: "p1-half", optionName: "نصف كيلو", name: "أرز بالشعرية", unit: "كجم", price: 48, cost: 20, recipeMultiplier: 0.5, quantity: 1 },
      { productId: "p10", name: "بطاطس محمرة", unit: "طبق", price: 75, cost: 28, quantity: 1 },
      { productId: "p11", name: "سلطة خضراء", unit: "طبق", price: 65, cost: 24, quantity: 1 }
    ]
  },
  {
    id: "meal-2", name: "وجبة كفتة", price: 360, available: true,
    description: "كفتة مشوية مع أرز وسلطة ومياه",
    components: [
      { productId: "p6", name: "كفتة مشوية", unit: "طبق", price: 300, cost: 190, quantity: 1 },
      { productId: "p1", optionId: "p1-quarter", optionName: "ربع كيلو", name: "أرز بالشعرية", unit: "كجم", price: 25, cost: 10, recipeMultiplier: 0.25, quantity: 1 },
      { productId: "p11", name: "سلطة خضراء", unit: "طبق", price: 65, cost: 24, quantity: 1 },
      { productId: "d1", name: "مياه معدنية", unit: "زجاجة", price: 15, cost: 6, quantity: 1 }
    ]
  },
  {
    id: "meal-3", name: "وجبة بيتزا عائلية", price: 420, available: true,
    description: "بيتزا كبيرة مع بطاطس ومشروب غازي",
    components: [
      { productId: "p9", optionId: "p9-large", optionName: "كبير", name: "بيتزا فراخ باربكيو", unit: "بيتزا", price: 280, cost: 165, recipeMultiplier: 1.1, quantity: 1 },
      { productId: "p10", name: "بطاطس محمرة", unit: "طبق", price: 75, cost: 28, quantity: 1 },
      { productId: "d2", name: "بيبسي كان", unit: "كان", price: 35, cost: 18, quantity: 2 }
    ]
  },
  {
    id: "meal-4", name: "وجبة كشري كاملة", price: 170, available: true,
    description: "كشري كبير مع سلطة ومشروب",
    components: [
      { productId: "p12", optionId: "p12-large", optionName: "كبير", name: "كشري", unit: "علبة", price: 85, cost: 38, recipeMultiplier: 1, quantity: 1 },
      { productId: "p11", name: "سلطة خضراء", unit: "طبق", price: 65, cost: 24, quantity: 1 },
      { productId: "d1", name: "مياه معدنية", unit: "زجاجة", price: 15, cost: 6, quantity: 1 }
    ]
  },
  {
    id: "meal-5", name: "بوكس العائلة", price: 980, available: true,
    description: "فرخة كاملة، أرز، محشي، بطاطس، سلطات ومشروبات",
    components: [
      { productId: "p4", optionId: "p4-whole", optionName: "فرخة كاملة", name: "فراخ مشوية", unit: "قطعة", price: 360, cost: 255, recipeMultiplier: 1, quantity: 1 },
      { productId: "p1", optionId: "p1-kilo", optionName: "كيلو", name: "أرز بالشعرية", unit: "كجم", price: 90, cost: 38, recipeMultiplier: 1, quantity: 1 },
      { productId: "p2", optionId: "p2-half", optionName: "نصف كيلو", name: "محشي مشكل", unit: "كجم", price: 125, cost: 70, recipeMultiplier: 0.5, quantity: 1 },
      { productId: "p10", name: "بطاطس محمرة", unit: "طبق", price: 75, cost: 28, quantity: 1 },
      { productId: "p11", name: "سلطة خضراء", unit: "طبق", price: 65, cost: 24, quantity: 2 },
      { productId: "d2", name: "بيبسي كان", unit: "كان", price: 35, cost: 18, quantity: 4 }
    ]
  }
];

export const initialState: AppState = {
  products,
  sections,
  meals,
  savedChoiceGroups: [],
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
  cashShifts: [{ id: "initial-shift", treasuryId: DEFAULT_SALES_TREASURY_ID, openedAt: initialShiftOpenedAt, openingBalance: 500 }],
  treasuries: createDefaultTreasuries(),
  defaultSalesTreasuryId: DEFAULT_SALES_TREASURY_ID,
  defaultPurchasesTreasuryId: DEFAULT_PURCHASES_TREASURY_ID,
  suppliers: [],
  purchaseInvoices: [],
  shiftOpeningBalance: 500,
  shiftOpenedAt: initialShiftOpenedAt,
  nextOrderNumber: 1001,
  nextPurchaseInvoiceNumber: 1,
  license: {
    machineId: "",
    type: "trial",
    status: "active",
    activatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3 * 86400000).toISOString()
  },
  settings: {
    restaurantName: "مطعم ريستو",
    subtitle: "أكل طازج ومعمول بحب",
    phone: "",
    address: "",
    invoiceFooter: "شكرًا لاختياركم Resto POS — نتمنى لكم يومًا سعيدًا",
    printCustomerReceipt: true,
    printKitchenReceipt: true,
    kitchenDisplayEnabled: true,
    customerReceiptPrinter: "",
    kitchenReceiptPrinter: "",
    defaultDeliveryFee: 30,
    kitchenWarningMinutes: 30,
    kitchenLateMinutes: 45,
    mealEditorMode: "simple"
  }
};
