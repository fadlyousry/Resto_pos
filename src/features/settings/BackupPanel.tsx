import { useEffect, useState, type ChangeEvent } from "react";
import {
  ArchiveRestore, CalendarClock, Database, DatabaseBackup, Download, FolderOpen,
  HardDrive, History, Save, Upload
} from "lucide-react";
import type { AppState } from "../../domain/types";
import type { ViewProps } from "../../shared/contracts";
import { normalizeAppState } from "../../shared/state";
import {
  canUseDesktopBackups,
  createStateBackup,
  getStorageInfo,
  saveBackupPreferences,
  selectBackupDirectory,
  selectDataDirectory,
  type BackupPreferences,
  type StorageInfo
} from "../../infrastructure/backup";

const defaultPreferences: BackupPreferences = {
  backupOnStartup: true,
  backupOnClose: true,
  backupIntervalMinutes: 60,
  backupRetentionCount: 30
};

export function BackupPanel({ state, update, notify }: ViewProps) {
  const desktopRuntime = canUseDesktopBackups();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [working, setWorking] = useState("");

  useEffect(() => {
    if (!desktopRuntime) return;
    getStorageInfo().then(applyStorageInfo).catch((error) => {
      console.error(error);
      notify("تعذر قراءة إعدادات التخزين");
    });
  }, [desktopRuntime]);

  const applyStorageInfo = (info: StorageInfo) => {
    setStorage(info);
    setPreferences({
      backupOnStartup: info.backupOnStartup,
      backupOnClose: info.backupOnClose,
      backupIntervalMinutes: info.backupIntervalMinutes,
      backupRetentionCount: info.backupRetentionCount
    });
  };

  const runDesktopAction = async (key: string, action: () => Promise<StorageInfo>, success: string) => {
    setWorking(key);
    try {
      applyStorageInfo(await action());
      notify(success);
    } catch (error) {
      console.error(error);
      notify("تعذر تنفيذ العملية");
    } finally {
      setWorking("");
    }
  };

  const createManualBackup = async () => {
    setWorking("backup");
    try {
      const result = await createStateBackup(state, "manual");
      applyStorageInfo(await getStorageInfo());
      notify(`تم إنشاء النسخة الاحتياطية في ${result.path}`);
    } catch (error) {
      console.error(error);
      notify("تعذر إنشاء النسخة الاحتياطية");
    } finally {
      setWorking("");
    }
  };

  const saveSchedule = () => runDesktopAction(
    "schedule",
    () => saveBackupPreferences(preferences),
    "تم حفظ جدول النسخ الاحتياطي"
  );

  const downloadBackup = () => {
    const payload = {
      version: 5,
      exportedAt: new Date().toISOString(),
      backupReason: "download",
      ...state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `resto-pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
    <div className="backup-settings-layout">
      <div className="panel backup-panel settings-backup-panel">
        <div className="panel-title">
          <div>
            <DatabaseBackup />
            <span>
              <strong>البيانات والنسخ الاحتياطي</strong>
              <small>حدد مكان قاعدة البيانات وجدول الحماية التلقائية</small>
            </span>
          </div>
          {storage && <span className="backup-health-badge"><History /> {storage.backupCount} نسخة محفوظة</span>}
        </div>

        {desktopRuntime && storage ? <>
          <section className="storage-location-card">
            <div className="storage-location-icon"><Database /></div>
            <div className="storage-location-copy">
              <span>قاعدة البيانات الأساسية</span>
              <strong dir="ltr">{storage.databasePath}</strong>
              <small>هذا المسار مستقل عن مكان تثبيت البرنامج.</small>
            </div>
            <button className="soft-button" disabled={!storage.hostServer || Boolean(working)} onClick={() => void runDesktopAction(
              "data-directory",
              selectDataDirectory,
              "تم اختيار المسار؛ أغلق البرنامج وافتحه لإتمام النقل"
            )}><FolderOpen /> تغيير المجلد</button>
          </section>

          {storage.requiresRestart && <div className="storage-restart-alert">
            <HardDrive />
            <span><strong>سيتم نقل قاعدة البيانات عند التشغيل التالي</strong><small dir="ltr">{storage.pendingDataDirectory}</small></span>
          </div>}

          <section className="storage-location-card backup-directory-card">
            <div className="storage-location-icon"><ArchiveRestore /></div>
            <div className="storage-location-copy">
              <span>مجلد النسخ الاحتياطية</span>
              <strong dir="ltr">{storage.backupDirectory}</strong>
              <small>{storage.lastBackupAtMs ? `آخر نسخة: ${new Date(storage.lastBackupAtMs).toLocaleString("ar-EG")}` : "لم يتم إنشاء نسخة تلقائية بعد"}</small>
            </div>
            <button className="soft-button" disabled={Boolean(working)} onClick={() => void runDesktopAction(
              "backup-directory",
              selectBackupDirectory,
              "تم تغيير مجلد النسخ الاحتياطية"
            )}><FolderOpen /> تغيير المجلد</button>
          </section>

          {!storage.hostServer && <p className="backup-client-note">إدارة قاعدة البيانات والنسخ التلقائي متاحة على جهاز السيرفر الرئيسي فقط. يمكنك تنزيل نسخة يدوية من هذا الجهاز.</p>}

          <section className="backup-schedule-card">
            <div className="backup-schedule-heading"><CalendarClock /><span><strong>جدول النسخ التلقائي</strong><small>تُحفظ نسخة JSON كاملة يمكن استرجاعها من أي تثبيت جديد.</small></span></div>
            <div className="backup-trigger-grid">
              <label className={preferences.backupOnStartup ? "active" : ""}>
                <input type="checkbox" checked={preferences.backupOnStartup} onChange={(event) => setPreferences({ ...preferences, backupOnStartup: event.target.checked })} />
                <span><strong>عند فتح البرنامج</strong><small>نسخة واحدة بعد تحميل البيانات</small></span>
              </label>
              <label className={preferences.backupOnClose ? "active" : ""}>
                <input type="checkbox" checked={preferences.backupOnClose} onChange={(event) => setPreferences({ ...preferences, backupOnClose: event.target.checked })} />
                <span><strong>عند إغلاق البرنامج</strong><small>حفظ آخر حالة قبل الإغلاق</small></span>
              </label>
            </div>
            <div className="backup-schedule-fields">
              <label>نسخة دورية كل
                <select value={preferences.backupIntervalMinutes} onChange={(event) => setPreferences({ ...preferences, backupIntervalMinutes: Number(event.target.value) })}>
                  <option value={0}>متوقفة</option>
                  <option value={15}>15 دقيقة</option>
                  <option value={30}>30 دقيقة</option>
                  <option value={60}>ساعة</option>
                  <option value={180}>3 ساعات</option>
                  <option value={360}>6 ساعات</option>
                  <option value={720}>12 ساعة</option>
                  <option value={1440}>يوميًا</option>
                </select>
              </label>
              <label>الاحتفاظ بآخر
                <div><input type="number" min="1" max="365" value={preferences.backupRetentionCount} onChange={(event) => setPreferences({ ...preferences, backupRetentionCount: Number(event.target.value) })} /><span>نسخة</span></div>
              </label>
              <button className="primary-button" disabled={!storage.hostServer || Boolean(working)} onClick={() => void saveSchedule()}><Save /> حفظ الجدول</button>
            </div>
          </section>
        </> : <p className="backup-desktop-hint"><HardDrive /> إعداد مكان قاعدة البيانات والجدولة متاح داخل تطبيق ويندوز.</p>}

        <div className="backup-actions">
          {desktopRuntime && <button disabled={Boolean(working)} onClick={() => void createManualBackup()}>
            <DatabaseBackup />
            <span><strong>{working === "backup" ? "جاري إنشاء النسخة..." : "نسخ الآن"}</strong><small>حفظ مباشر داخل مجلد النسخ المحدد</small></span>
          </button>}
          <button onClick={downloadBackup}>
            <Download />
            <span><strong>تنزيل نسخة</strong><small>اختيار مكان الحفظ من المتصفح</small></span>
          </button>
          <label>
            <Upload />
            <span><strong>استرجاع نسخة</strong><small>استبدال البيانات من ملف سابق</small></span>
            <input type="file" accept=".json,application/json" onChange={restoreBackup} />
          </label>
        </div>
        <p><ArchiveRestore /> يفضّل وضع مجلد البيانات على بارتشن غير C، والنسخ الاحتياطية على قرص أو وحدة تخزين أخرى للحماية من تلف الهارد.</p>
      </div>
    </div>
  );
}
