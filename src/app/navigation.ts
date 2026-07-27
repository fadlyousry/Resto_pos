import {
  BarChart3, Bike, Boxes, CookingPot, LayoutGrid, PackageCheck, ReceiptText,
  Settings2, Users, WalletCards, Warehouse, type LucideIcon
} from "lucide-react";

export type AppView =
  | "pos"
  | "orders"
  | "kitchen"
  | "aggregation"
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
  { id: "pos", label: "نقطة البيع", icon: LayoutGrid },
  { id: "orders", label: "الطلبات", icon: ReceiptText },
  { id: "kitchen", label: "المطبخ", icon: CookingPot },
  { id: "aggregation", label: "التجميع", icon: PackageCheck },
  { id: "delivery", label: "التوصيل والمندوبين", icon: Bike },
  { id: "customers", label: "العملاء", icon: Users },
  { id: "products", label: "الأصناف", icon: Boxes },
  { id: "inventory", label: "المخزون والوصفات", icon: Warehouse },
  { id: "cash", label: "الخزنة", icon: WalletCards },
  { id: "reports", label: "التقارير", icon: BarChart3 },
  { id: "settings", label: "الإعدادات", icon: Settings2 }
];
