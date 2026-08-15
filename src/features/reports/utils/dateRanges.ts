import { dateKey, todayKey } from "../../../shared/format";
import type { DateRangeFilter, ReportDatePreset } from "../types";

export function formatArabicDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(new Date(`${dateStr}T12:00:00`));
  } catch {
    return dateStr;
  }
}

export function offsetDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getDateRangeForPreset(
  preset: ReportDatePreset,
  customFrom?: string,
  customTo?: string
): DateRangeFilter {
  const today = todayKey();

  switch (preset) {
    case "today":
      return {
        preset: "today",
        from: today,
        to: today,
        label: "اليوم"
      };

    case "yesterday": {
      const yesterday = offsetDate(today, -1);
      return {
        preset: "yesterday",
        from: yesterday,
        to: yesterday,
        label: "أمس"
      };
    }

    case "last7": {
      const from = offsetDate(today, -6);
      return {
        preset: "last7",
        from,
        to: today,
        label: "آخر 7 أيام"
      };
    }

    case "this_month": {
      const from = `${today.slice(0, 7)}-01`;
      return {
        preset: "this_month",
        from,
        to: today,
        label: "هذا الشهر"
      };
    }

    case "last_month": {
      const year = Number(today.slice(0, 4));
      const month = Number(today.slice(5, 7));
      const lastMonthYear = month === 1 ? year - 1 : year;
      const lastMonth = month === 1 ? 12 : month - 1;
      const lastMonthStr = String(lastMonth).padStart(2, "0");
      const lastDay = new Date(lastMonthYear, lastMonth, 0).getDate();
      return {
        preset: "last_month",
        from: `${lastMonthYear}-${lastMonthStr}-01`,
        to: `${lastMonthYear}-${lastMonthStr}-${String(lastDay).padStart(2, "0")}`,
        label: "الشهر السابق"
      };
    }

    case "all":
      return {
        preset: "all",
        from: "",
        to: "",
        label: "كل الفترات"
      };

    case "custom": {
      const from = customFrom ?? today;
      const to = customTo ?? today;
      let label = "فترة مخصصة";
      if (from && to) {
        label = `${formatArabicDate(from)} – ${formatArabicDate(to)}`;
      } else if (from) {
        label = `من ${formatArabicDate(from)}`;
      } else if (to) {
        label = `حتى ${formatArabicDate(to)}`;
      }
      return {
        preset: "custom",
        from,
        to,
        label
      };
    }
  }
}

export function isDateInRange(targetDateStr: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  const key = dateKey(targetDateStr);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

export function getPreviousComparisonRange(current: DateRangeFilter): { from: string; to: string } | null {
  if (!current.from || !current.to) return null;
  const fromDate = new Date(`${current.from}T12:00:00Z`);
  const toDate = new Date(`${current.to}T12:00:00Z`);
  const diffDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  const prevTo = offsetDate(current.from, -1);
  const prevFrom = offsetDate(prevTo, -(diffDays - 1));
  return { from: prevFrom, to: prevTo };
}
