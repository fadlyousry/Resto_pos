import type { Order, OrderStage, PaymentMethod } from "../domain/types";

export const orderDisplayNumber = (order: Pick<Order, "number" | "shiftNumber">) =>
  order.shiftNumber ?? order.number;

export const money = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export const qty = (value: number) => {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 3 });
};

export const RESTAURANT_TIME_ZONE = "Africa/Cairo";

const sqliteUtcDatePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/** Normalize stored timestamps while preserving restaurant-local scheduled times. */
export const appDate = (value: string | Date) => {
  if (value instanceof Date) return value;
  const normalized = sqliteUtcDatePattern.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return new Date(normalized);
};

export const dateTimeValue = (value: string | Date) => appDate(value).getTime();

const cairoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RESTAURANT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export const shortDate = (value: string) => {
  const isRestaurantWallTime = localDateTimePattern.test(value);
  const date = isRestaurantWallTime ? new Date(`${value}Z`) : appDate(value);
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    timeZone: isRestaurantWallTime ? "UTC" : RESTAURANT_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
};

export const currentArabicDate = () =>
  new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    timeZone: RESTAURANT_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());

export const dateKey = (value: string | Date) => {
  if (typeof value === "string" && (/^\d{4}-\d{2}-\d{2}$/.test(value) || localDateTimePattern.test(value))) {
    return value.slice(0, 10);
  }
  return cairoDateFormatter.format(appDate(value));
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
  delivered: "تم التوصيل",
  returned: "رفض الاستلام"
};
