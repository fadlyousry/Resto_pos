import { useState } from "react";
import { KeyRound, ShieldAlert, Copy, CheckCircle2, AlertCircle, Headphones, MessageSquare, PhoneCall, ExternalLink, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { getMachineId, verifyLicenseKey } from "../../shared/license";
import type { LicenseInfo } from "../../domain/types";

interface LicenseLockModalProps {
  license?: LicenseInfo;
  onActivate: (newLicense: LicenseInfo) => void;
}

export function LicenseLockModal({ license, onActivate }: LicenseLockModalProps) {
  const machineId = license?.machineId || getMachineId();
  const [inputKey, setInputKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showSupport, setShowSupport] = useState(false);

  const copyMachineId = () => {
    navigator.clipboard.writeText(machineId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivate = () => {
    setErrorMsg("");
    setSuccessMsg("");
    
    if (!inputKey.trim()) {
      setErrorMsg("يرجى إدخال كود الترخيص");
      return;
    }

    const res = verifyLicenseKey(inputKey, machineId);
    if (!res.valid) {
      setErrorMsg(res.error || "كود غير صالح");
      return;
    }

    const updatedLicense: LicenseInfo = {
      machineId,
      licenseKey: inputKey.trim().toUpperCase(),
      type: res.type || "subscription",
      status: "active",
      activatedAt: new Date().toISOString(),
      expiresAt: res.expiresAt ?? null
    };

    setSuccessMsg(res.type === "lifetime" ? "تم تفعيل ترخيص مدى الحياة بنجاح! 🎉" : "تم تفعيل الترخيص بنجاح! 🎉");
    setTimeout(() => {
      onActivate(updatedLicense);
    }, 1200);
  };

  return (
    <div className="license-lock-overlay" style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 99999, background: "rgba(15, 23, 42, 0.95)",
      backdropFilter: "blur(12px)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: "20px"
    }}>
      <div className="license-lock-card" style={{
        background: "#ffffff", borderRadius: "20px", width: "100%", maxWidth: "520px",
        padding: "32px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        textAlign: "center", direction: "rtl", fontFamily: "inherit"
      }}>
        <div style={{
          width: "72px", height: "72px", borderRadius: "50%",
          background: "#fef2f2", color: "#ef4444", display: "flex",
          alignItems: "center", justifyContent: "center", margin: "0 auto 20px"
        }}>
          <ShieldAlert size={38} />
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>
          انتهت فترة ترخيص المنظومة
        </h2>
        <p style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6", marginBottom: "24px" }}>
          لقد انتهت الصلاحية المحددة للنسخة الحالية. يرجى إدخال مفتاح التفعيل الجديد للتجديد ومتابعة المبيعات والعمليات.
        </p>

        {/* Machine ID Box */}
        <div style={{
          background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px",
          padding: "12px 16px", marginBottom: "20px", display: "flex",
          alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ textAlign: "right" }}>
            <span style={{ display: "block", fontSize: "11px", color: "#94a3b8", fontWeight: "600" }}>
              معرّف هذا الجهاز (Machine ID)
            </span>
            <strong style={{ fontSize: "14px", fontFamily: "monospace", color: "#1e293b", letterSpacing: "0.5px" }}>
              {machineId}
            </strong>
          </div>
          <button type="button" onClick={copyMachineId} style={{
            background: copied ? "#10b981" : "#e2e8f0", color: copied ? "#fff" : "#334155",
            border: "none", borderRadius: "8px", padding: "8px 12px", fontSize: "12px",
            cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s"
          }}>
            {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
            <span>{copied ? "تم النسخ" : "نسخ المعرّف"}</span>
          </button>
        </div>

        {/* Key Input Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
          <div style={{ position: "relative" }}>
            <input
              dir="ltr"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value.toUpperCase())}
              placeholder="REST-XXXX-YYYY-ZZZZ"
              style={{
                width: "100%", padding: "14px 16px", borderRadius: "10px",
                border: "1.5px solid #cbd5e1", fontSize: "15px", fontFamily: "monospace",
                textAlign: "center", textTransform: "uppercase", letterSpacing: "1px",
                outline: "none", transition: "border 0.2s"
              }}
            />
          </div>

          {errorMsg && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#ef4444", fontSize: "12px", justifyContent: "center" }}>
              <AlertCircle size={14} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#10b981", fontSize: "13px", fontWeight: "600", justifyContent: "center" }}>
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleActivate}
            style={{
              width: "100%", padding: "14px", borderRadius: "10px",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#ffffff",
              border: "none", fontSize: "14px", fontWeight: "600", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)"
            }}
          >
            <KeyRound size={18} />
            <span>تفعيل الترخيص ومتابعة العمل</span>
          </button>
        </div>

        {/* Technical Support Section Button */}
        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "16px", marginTop: "16px" }}>
          <button
            type="button"
            onClick={() => setShowSupport(!showSupport)}
            style={{
              width: "100%", padding: "12px", borderRadius: "10px",
              background: showSupport ? "#ecfdf5" : "#f8fafc", color: showSupport ? "#047857" : "#334155",
              border: `1px solid ${showSupport ? "#a7f3d0" : "#cbd5e1"}`,
              fontSize: "13px", fontWeight: "600", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              transition: "all 0.2s"
            }}
          >
            <Headphones size={18} style={{ color: "#10b981" }} />
            <span>بيانات التواصل والدعم الفني المباشر</span>
            {showSupport ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showSupport && (
            <div style={{
              marginTop: "12px", background: "#f8fafc", border: "1px solid #e2e8f0",
              borderRadius: "14px", padding: "16px", textAlign: "right", display: "flex",
              flexDirection: "column", gap: "12px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#0f172a", fontSize: "13px", fontWeight: "700" }}>
                <ShieldCheck size={16} style={{ color: "#10b981" }} />
                <span>شركة FYC Solutions (الدعم الفني المباشر)</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <a
                  href="https://wa.me/201210677917"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: "#25d366", color: "#fff", padding: "10px", borderRadius: "10px",
                    textDecoration: "none", fontSize: "12px", fontWeight: "600", display: "flex",
                    alignItems: "center", justifyContent: "center", gap: "6px"
                  }}
                >
                  <MessageSquare size={15} />
                  <span>واتساب: <span dir="ltr" style={{ display: "inline-block" }}>+20 121 067 7917</span></span>
                  <ExternalLink size={12} />
                </a>

                <a
                  href="tel:+201554601660"
                  style={{
                    background: "#0284c7", color: "#fff", padding: "10px", borderRadius: "10px",
                    textDecoration: "none", fontSize: "12px", fontWeight: "600", display: "flex",
                    alignItems: "center", justifyContent: "center", gap: "6px"
                  }}
                >
                  <PhoneCall size={15} />
                  <span>اتصال: <span dir="ltr" style={{ display: "inline-block" }}>+20 155 460 1660</span></span>
                </a>
              </div>

              <p style={{ fontSize: "11px", color: "#64748b", margin: 0, textAlign: "center" }}>
                انسخ <strong>معرّف الجهاز (Machine ID)</strong> الموضح أعلاه وأرسله للدعم الفني للحصول على مفتاح التفعيل الفوري.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
