import type { ChangeEvent } from "react";
import { ArchiveRestore, DatabaseBackup, Download, Upload } from "lucide-react";
import type { AppState } from "../../domain/types";
import type { ViewProps } from "../../shared/contracts";
import { normalizeAppState } from "../../shared/state";

export function BackupPanel({ state, update, notify }: ViewProps) {
  const downloadBackup = () => {
    const payload = {
      version: 4,
      exportedAt: new Date().toISOString(),
      ...state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `beitna-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("تم تنزيل النسخة الاحتياطية");
  };

  const restoreBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<AppState>;
        if (!Array.isArray(parsed.products) || !Array.isArray(parsed.orders) || !Array.isArray(parsed.customers)) {
          throw new Error("invalid-backup");
        }
        if (!window.confirm("استرجاع النسخة سيستبدل البيانات الحالية. هل تريد المتابعة؟")) return;
        update((current) => normalizeAppState(parsed, current));
        notify("تم استرجاع النسخة الاحتياطية");
      } catch {
        notify("ملف النسخة الاحتياطية غير صالح");
      } finally {
        input.value = "";
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="panel backup-panel settings-backup-panel">
      <div className="panel-title">
        <div>
          <DatabaseBackup />
          <span>
            <strong>النسخ الاحتياطي</strong>
            <small>نسخة كاملة من الطلبات والعملاء والمخزون والخزنة والإعدادات</small>
          </span>
        </div>
      </div>
      <div className="backup-actions">
        <button onClick={downloadBackup}>
          <Download />
          <span><strong>تنزيل نسخة</strong><small>حفظ ملف JSON على الجهاز</small></span>
        </button>
        <label>
          <Upload />
          <span><strong>استرجاع نسخة</strong><small>استبدال البيانات من نسخة سابقة</small></span>
          <input type="file" accept=".json,application/json" onChange={restoreBackup} />
        </label>
      </div>
      <p><ArchiveRestore /> يُفضّل تنزيل نسخة يومية والاحتفاظ بها على جهاز آخر أو وحدة تخزين خارجية.</p>
    </div>
  );
}
