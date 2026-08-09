import type { OrderStage, PaymentMethod } from "../domain/types";

export const money = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export const qty = (value: number) => {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 3 });
};

export const shortDate = (value: string) =>
  new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));

export const currentArabicDate = () =>
  new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());

export const dateKey = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const todayKey = () => dateKey(new Date());

export const paymentLabels: Record<PaymentMethod, string> = {
  cash: "نقدي",
  instapay: "إنستاباي",
  vodafone: "فودافون كاش"
};

export const stageLabels: Record<OrderStage, string> = {
  preparing: "قيد التجهيز",
  ready: "جاهز",
  delivered: "تم التوصيل"
};
