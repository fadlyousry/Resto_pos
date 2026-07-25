import type { AppState, Product } from "./types";

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

export const initialState: AppState = {
  products,
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
  cashTransactions: [],
  shiftOpeningBalance: 500,
  shiftOpenedAt: new Date().toISOString(),
  nextOrderNumber: 1001
};
