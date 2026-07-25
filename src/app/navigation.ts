import {
  BadgePercent, BarChart3, Bike, Boxes, CookingPot, LayoutGrid, ReceiptText,
  Settings2, Users, WalletCards, Warehouse, type LucideIcon
} from "lucide-react";

export type AppView =
  | "pos"
  | "orders"
  | "kitchen"
  | "delivery"
  | "customers"
  | "products"
  | "inventory"
  | "growth"
  | "cash"
  | "reports"
  | "settings";

export interface NavigationItem {
  id: AppView;
  label: string;
  icon: LucideIcon;
}

export const navigationItems: NavigationItem[] = [
  { id: "pos", label: "نقطة البيع", icon: LayoutGrid },
  { id: "orders", label: "الطلبات", icon: ReceiptText },
  { id: "kitchen", label: "المطبخ والتجميع", icon: CookingPot },
  { id: "delivery", label: "التوصيل والمندوبين", icon: Bike },
  { id: "customers", label: "العملاء", icon: Users },
  { id: "products", label: "الأصناف", icon: Boxes },
  { id: "inventory", label: "المخزون والوصفات", icon: Warehouse },
  { id: "growth", label: "الولاء والعروض", icon: BadgePercent },
  { id: "cash", label: "الخزنة", icon: WalletCards },
  { id: "reports", label: "التقارير", icon: BarChart3 },
  { id: "settings", label: "الإعدادات", icon: Settings2 }
];
