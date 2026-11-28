import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * OTP siyosati. Kod bazada hech qachon ochiq saqlanmaydi — faqat HMAC(pepper, phone:code).
 * Pepper .env da (OTP_PEPPER), baza o'g'irlansa ham kodlarni tiklab bo'lmaydi.
 */
export const OTP_POLICY = {
  length: 6,
  ttlSeconds: 120,
  maxVerifyAttempts: 5,
  /** Bitta raqamga qayta yuborishdan oldin kutish */
  resendCooldownSeconds: 60,
  /** Bitta raqamga soatiga ko'pi bilan */
  maxSendsPerPhonePerHour: 5,
  /** Bitta IP dan soatiga ko'pi bilan (SMS-bombing himoyasi) */
  maxSendsPerIpPerHour: 20,
} as const;

export function generateOtp(length: number = OTP_POLICY.length): string {
  if (!Number.isInteger(length) || length < 4 || length > 10) throw new RangeError("OTP uzunligi 4..10");
  let code = "";
  for (let i = 0; i < length; i++) code += String(randomInt(0, 10));
  return code;
}

export function hashOtp(phone: string, code: string, pepper: string): string {
  if (!pepper || pepper.length < 32) throw new Error("OTP_PEPPER kamida 32 belgi bo'lishi kerak");
  return createHmac("sha256", pepper).update(`${phone}:${code}`).digest("hex");
}

export function verifyOtpHash(phone: string, code: string, expectedHash: string, pepper: string): boolean {
  if (!/^\d{4,10}$/.test(code)) return false;
  const actual = Buffer.from(hashOtp(phone, code, pepper), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Refresh token va boshqa tasodifiy tokenlar uchun SHA-256 (bazada faqat hash saqlanadi). */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
