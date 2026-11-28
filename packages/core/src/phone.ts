/**
 * O'zbekiston mobil raqamlarini yagona ko'rinishga keltiradi: +998XXXXXXXXX.
 * Qabul qilinadi: "90 123 45 67", "+998 (90) 123-45-67", "998901234567", "901234567".
 */
const UZ_OPERATOR_CODES = new Set([
  "20", "33", "50", "55", "61", "62", "65", "66", "67", "69", "70", "71", "72", "73", "74", "75",
  "76", "77", "78", "79", "88", "90", "91", "93", "94", "95", "97", "98", "99",
]);

export function normalizeUzPhone(input: string): string | null {
  if (typeof input !== "string" || input.length > 32) return null;
  const digits = input.replace(/\D/g, "");
  let local: string;
  if (digits.length === 12 && digits.startsWith("998")) local = digits.slice(3);
  else if (digits.length === 9) local = digits;
  else return null;
  if (!UZ_OPERATOR_CODES.has(local.slice(0, 2))) return null;
  return `+998${local}`;
}

/** Logga yozish uchun yashirish: +998901234567 -> +99890***4567 */
export function maskPhone(phone: string): string {
  if (phone.length < 8) return "***";
  return `${phone.slice(0, 6)}***${phone.slice(-4)}`;
}
