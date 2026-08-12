import { CloudDownload, Download, ShieldCheck, X } from "lucide-react";
import type { AppUpdaterController } from "../../infrastructure/updater";

export function UpdatePrompt({ updater }: { updater: AppUpdaterController }) {
  if (!updater.promptVisible || !updater.update) return null;
  const busy = updater.status === "downloading" || updater.status === "installing";
  return <div className="update-prompt-backdrop">
    <section className="update-prompt-card" role="dialog" aria-modal="true" aria-labelledby="update-prompt-title">
      {!busy && <button className="update-prompt-close" aria-label="إغلاق" onClick={updater.dismissPrompt}><X /></button>}
      <div className="update-prompt-hero"><CloudDownload /><span><ShieldCheck /> تحديث رسمي وموقّع</span></div>
      <div className="update-prompt-content">
        <small>إصدار جديد متاح</small>
        <h2 id="update-prompt-title">Resto POS <b dir="ltr">v{updater.update.version}</b></h2>
        <p>الإصدار المثبت حاليًا <b dir="ltr">v{updater.update.currentVersion}</b></p>
        {updater.update.notes && <div className="update-prompt-notes">{updater.update.notes}</div>}
        {busy && <>
          <div className="update-prompt-progress"><i style={{ width: `${updater.progress}%` }} /></div>
          <strong>{updater.status === "installing" ? "جاري تثبيت التحديث وإعادة التشغيل..." : `جاري تنزيل التحديث ${updater.progress}%`}</strong>
        </>}
        {!busy && <div className="update-prompt-actions">
          <button className="primary-button" onClick={() => void updater.install()}><Download /> تحديث الآن</button>
          <button className="soft-button" onClick={updater.dismissPrompt}>لاحقًا</button>
        </div>}
      </div>
    </section>
  </div>;
}
