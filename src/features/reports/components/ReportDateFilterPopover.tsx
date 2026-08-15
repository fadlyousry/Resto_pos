import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import type { DateRangeFilter, ReportDatePreset } from "../types";

interface ReportDateFilterPopoverProps {
  filter: DateRangeFilter;
  preset: ReportDatePreset;
  customFrom: string;
  customTo: string;
  onSelectPreset: (preset: ReportDatePreset, from?: string, to?: string) => void;
}

export function ReportDateFilterPopover({
  filter,
  preset,
  customFrom,
  customTo,
  onSelectPreset
}: ReportDateFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draftPreset, setDraftPreset] = useState<ReportDatePreset>(preset);
  const [draftFrom, setDraftFrom] = useState(customFrom);
  const [draftTo, setDraftTo] = useState(customTo);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftPreset(preset);
    setDraftFrom(customFrom);
    setDraftTo(customTo);
  }, [preset, customFrom, customTo]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const handleApply = () => {
    onSelectPreset(draftPreset, draftFrom, draftTo);
    setOpen(false);
  };

  const handleClear = () => {
    setDraftPreset("today");
    onSelectPreset("today");
    setOpen(false);
  };

  return (
    <div className="orders-date-filter" ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        className={`orders-date-filter-button ${preset !== "today" ? "active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <CalendarRange size={16} />
        <span><strong>{filter.label}</strong></span>
        <ChevronDown size={14} className={open ? "open" : ""} />
      </button>

      {open && (
        <div className="orders-date-popover" style={{ left: 0, right: "auto" }}>
          <div className="orders-date-quick">
            {([
              ["today", "اليوم"],
              ["yesterday", "أمس"],
              ["last7", "آخر 7 أيام"],
              ["this_month", "هذا الشهر"],
              ["last_month", "الشهر السابق"],
              ["all", "كل الفترات"]
            ] as const).map(([id, label]) => (
              <button
                type="button"
                className={draftPreset === id ? "active" : ""}
                key={id}
                onClick={() => {
                  setDraftPreset(id);
                  onSelectPreset(id, draftFrom, draftTo);
                  setOpen(false);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="orders-date-divider" />
          <strong className="orders-custom-date-title">تاريخ مخصص:</strong>
          <div className="orders-custom-date">
            <label>
              <span>من:</span>
              <input
                type="date"
                value={draftFrom}
                onChange={(e) => {
                  setDraftPreset("custom");
                  setDraftFrom(e.target.value);
                }}
              />
            </label>
            <label>
              <span>إلى:</span>
              <input
                type="date"
                value={draftTo}
                onChange={(e) => {
                  setDraftPreset("custom");
                  setDraftTo(e.target.value);
                }}
              />
            </label>
          </div>

          <div className="orders-date-actions">
            <button type="button" className="apply" onClick={handleApply}>
              تطبيق
            </button>
            <button type="button" className="clear" onClick={handleClear}>
              مسح
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
