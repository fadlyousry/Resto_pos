import type { LicenseInfo, LicenseType } from "../domain/types";

const LICENSE_SECRET = "RESTRANT-PRO-SECRET-KEY-2026";
const MACHINE_ID_KEY = "restrant_machine_id";

/**
  توليد أو جلب معرف الجهاز الفريد (Machine ID)
 */
export function getMachineId(): string {
  let id = localStorage.getItem(MACHINE_ID_KEY);
  if (!id) {
    const raw = `${navigator.userAgent}-${navigator.language}-${screen.width}x${screen.height}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    const hexHash = Math.abs(hash).toString(16).toUpperCase().padStart(6, "0");
    const randomHex = Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase();
    id = `POS-${hexHash}-${randomHex}`;
    localStorage.setItem(MACHINE_ID_KEY, id);
  }
  return id;
}

/**
  خوارزمية تشفير وتوقيع مفتاح التفعيل (Simple Hash Checksum)
 */
function calculateSignature(machineId: string, typeCode: string, expiryHex: string): string {
  const payload = `${machineId.trim().toUpperCase()}:${typeCode}:${expiryHex}:${LICENSE_SECRET}`;
  let hash1 = 5381;
  let hash2 = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash1 = (hash1 * 33) ^ char;
    hash2 = (hash2 ^ char) * 16777619;
  }
  const sig1 = Math.abs(hash1).toString(16).toUpperCase().padStart(4, "0");
  const sig2 = Math.abs(hash2).toString(16).toUpperCase().padStart(4, "0");
  return (sig1 + sig2).slice(0, 6);
}

/**
  توليد مفتاح تفعيل جديد (للاستخدام عند إعطاء الترخيص للعميل)
 */
export function generateLicenseKey(
  machineId: string,
  type: LicenseType,
  days: number = 365
): string {
  const cleanId = machineId.trim().toUpperCase();
  const typeCode = type === "lifetime" ? "LIFE" : type === "subscription" ? "SUBS" : "TRIL";
  
  let expiryHex = "FFFFFFFF";
  if (type !== "lifetime") {
    const expiryTimestamp = Math.floor(Date.now() / 1000) + days * 86400;
    expiryHex = expiryTimestamp.toString(16).toUpperCase().padStart(8, "0");
  }
  
  const signature = calculateSignature(cleanId, typeCode, expiryHex);
  return `REST-${typeCode}-${expiryHex}-${signature}`;
}

export interface VerificationResult {
  valid: boolean;
  type?: LicenseType;
  expiresAt?: string | null;
  error?: string;
}

/**
  فحص والتحقق من صحة مفتاح الترخيص المدخل
 */
export function verifyLicenseKey(key: string, machineId: string): VerificationResult {
  if (!key || typeof key !== "string") {
    return { valid: false, error: "كود الترخيص غير متاح" };
  }
  
  const cleanKey = key.trim().toUpperCase();
  const parts = cleanKey.split("-");
  
  if (parts.length !== 4 || parts[0] !== "REST") {
    return { valid: false, error: "صيغة مفتاح التفعيل غير صحيحة" };
  }
  
  const [, typeCode, expiryHex, signature] = parts;
  const cleanMachineId = machineId.trim().toUpperCase();
  
  const expectedSignature = calculateSignature(cleanMachineId, typeCode, expiryHex);
  if (signature !== expectedSignature) {
    return { valid: false, error: "كود التفعيل غير متوافق مع هذا الجهاز" };
  }
  
  let type: LicenseType = "subscription";
  if (typeCode === "LIFE") type = "lifetime";
  else if (typeCode === "TRIL") type = "trial";
  
  let expiresAt: string | null = null;
  if (typeCode !== "LIFE") {
    const expirySec = parseInt(expiryHex, 16);
    if (isNaN(expirySec)) {
      return { valid: false, error: "تاريخ الانتهاء في الكود غير صالح" };
    }
    const expiryMs = expirySec * 1000;
    if (Date.now() > expiryMs) {
      return { valid: false, error: "كود التفعيل انتهت صلاحيته بالتقويم" };
    }
    expiresAt = new Date(expiryMs).toISOString();
  }
  
  return { valid: true, type, expiresAt };
}

export interface LicenseStatusEvaluation {
  status: "active" | "expired" | "unlicensed";
  daysRemaining: number | null;
  formattedExpiry: string;
  isLifetime: boolean;
}

/**
  تقييم حالة الترخيص والأيام المتبقية
 */
export function evaluateLicense(license?: LicenseInfo | null): LicenseStatusEvaluation {
  if (!license || !license.type) {
    const defaultTrialExpires = new Date(Date.now() + 3 * 86400000).toISOString();
    return {
      status: "active",
      daysRemaining: 3,
      formattedExpiry: new Date(defaultTrialExpires).toLocaleDateString("ar-EG"),
      isLifetime: false
    };
  }
  
  if (license.type === "lifetime") {
    return {
      status: "active",
      daysRemaining: null,
      formattedExpiry: "مدى الحياة (دائم)",
      isLifetime: true
    };
  }
  
  if (!license.expiresAt) {
    return {
      status: "expired",
      daysRemaining: 0,
      formattedExpiry: "منتهي",
      isLifetime: false
    };
  }
  
  const expiryMs = new Date(license.expiresAt).getTime();
  const nowMs = Date.now();
  const diffMs = expiryMs - nowMs;
  const days = Math.ceil(diffMs / 86400000);
  
  if (days <= 0) {
    return {
      status: "expired",
      daysRemaining: 0,
      formattedExpiry: new Date(expiryMs).toLocaleDateString("ar-EG"),
      isLifetime: false
    };
  }
  
  return {
    status: "active",
    daysRemaining: days,
    formattedExpiry: new Date(expiryMs).toLocaleDateString("ar-EG"),
    isLifetime: false
  };
}
