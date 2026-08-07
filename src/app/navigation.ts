import {
  BarChart3, Bike, Boxes, CookingPot, History, LayoutGrid, ReceiptText,
  Settings2, ShoppingCart, Users, WalletCards, Warehouse, type LucideIcon
} from "lucide-react";

export type AppView =
  | "pos"
  | "purchase-pos"
  | "purchase-history"
  | "orders"
  | "kitchen"
  | "delivery"
  | "customers"
  | "products"
  | "inventory"
  | "cash"
  | "reports"
  | "settings";

export interface NavigationItem {
  id: AppView;
  label: string;
  icon: LucideIcon;
}

export const navigationItems: NavigationItem[] = [
  { id: "pos", label: "نقطة البيع (مبيعات)", icon: LayoutGrid },
  { id: "orders", label: "الطلبات", icon: ReceiptText },
  { id: "kitchen", label: "المطبخ", icon: CookingPot },
  { id: "delivery", label: "التوصيل والمندوبين", icon: Bike },
  { id: "purchase-pos", label: "فاتورة مشتريات", icon: ShoppingCart },
  { id: "purchase-history", label: "المشتريات السابقة", icon: History },
  { id: "inventory", label: "المخزون والوصفات", icon: Warehouse },
  { id: "products", label: "الأصناف والمنيو", icon: Boxes },
  { id: "cash", label: "الخزنة والورديات", icon: WalletCards },
  { id: "customers", label: "سجل العملاء", icon: Users },
  { id: "reports", label: "التقارير والإحصائيات", icon: BarChart3 },
  { id: "settings", label: "الإعدادات", icon: Settings2 }
];
