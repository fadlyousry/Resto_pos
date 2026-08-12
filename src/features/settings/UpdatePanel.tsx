import { CheckCircle2, CloudDownload, Github, RefreshCw, Rocket, ShieldCheck } from "lucide-react";
import type { AppUpdaterController } from "../../infrastructure/updater";

export function UpdatePanel({ updater }: { updater?: AppUpdaterController }) {
  if (!updater) return null;
  const busy = updater.status === "checking" || updater.status === "downloading" || updater.status === "installing";
  const statusLabel = updater.status === "checking" ? "جاري البحث..."
    : updater.status === "available" ? `يتوفر الإصدار ${updater.update?.version}`
      : updater.status === "downloading" ? `جاري التنزيل ${updater.progress}%`
        : updater.status === "installing" ? "جاري تثبيت التحديث..."
          : updater.status === "up-to-date" ? "أحدث إصدار مثبت"
            : updater.status === "unconfigured" ? "بانتظار ربط مستودع GitHub"
              : updater.status === "error" ? "تعذر الاتصال بخدمة التحديث"
                : "جاهز للبحث عن تحديثات";

  return <section className="app-update-panel">
    <div className="app-update-icon"><CloudDownload /></div>
    <div className="app-update-copy">
      <div><strong>تحديثات Resto POS</strong><span className={`app-update-status ${updater.status}`}>{statusLabel}</span></div>
      <p>الإصدار الحالي <b dir="ltr">v{updater.configuration?.currentVersion ?? "0.1.1"}</b></p>
      {updater.configuration?.repository && <small><Github /> {updater.configuration.repository}</small>}
      {updater.status === "unconfigured" && <small><ShieldCheck /> سيتم التعرف على المستودع تلقائيًا عند البناء من GitHub Actions.</small>}
      {updater.update?.notes && <div className="app-update-notes">{updater.update.notes}</div>}
      {(updater.status === "downloading" || updater.status === "installing") && <div className="app-update-progress"><i style={{ width: `${updater.progress}%` }} /></div>}
      {updater.error && <em>{updater.error}</em>}
    </div>
    <div className="app-update-actions">
      {updater.status === "available" ? <button className="primary-button" onClick={() => void updater.install()}><Rocket /> تنزيل وتثبيت</button>
        : <button className="soft-button" disabled={!updater.desktopRuntime || busy} onClick={() => void updater.checkNow(false)}>
          {updater.status === "up-to-date" ? <CheckCircle2 /> : <RefreshCw />} {updater.status === "checking" ? "جاري البحث" : "البحث عن تحديث"}
        </button>}
    </div>
  </section>;
}
