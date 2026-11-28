/**
 * Hisob-kitob botiga yozilgan oddiy matnni moliya yozuviga aylantiradi.
 *   "Laminat 4 200 000 #1042"        -> chiqim, 4 200 000 so'm, buyurtma 1042, toifa MATERIAL
 *   "+ 12 mln #1042 click"           -> kirim, 12 000 000 so'm, buyurtma 1042, usul CLICK
 *   "taksi 50 ming"                  -> chiqim, 50 000 so'm, toifa TRANSPORT
 * Natija har doim foydalanuvchi tasdig'idan keyin saqlanadi.
 */
import { parseSom, type Tiyin } from "./money.js";

export type FinanceKind = "INCOME" | "EXPENSE";
export type FinanceCategory =
  | "MATERIAL"
  | "FURNITURE"
  | "TRANSPORT"
  | "SALARY"
  | "RENT"
  | "MARKETING"
  | "TOOLS"
  | "CLIENT_PAYMENT"
  | "OTHER";
export type PaymentMethod = "CASH" | "CARD" | "BANK" | "CLICK" | "PAYME" | "UZUM";

export interface ParsedFinanceEntry {
  kind: FinanceKind;
  amountTiyin: Tiyin;
  category: FinanceCategory;
  method: PaymentMethod;
  orderNumber: number | null;
  note: string;
}

const CATEGORY_KEYWORDS: [FinanceCategory, RegExp][] = [
  ["MATERIAL", /(laminat|bo['ʻ’]?yoq|kraska|gipso|profil|plitka|kafel|sement|shpak|klei|yelim|oboy|parket|material)/i],
  ["FURNITURE", /(divan|kreslo|stol|stul|shkaf|kravat|mebel|tumba|komod)/i],
  ["TRANSPORT", /(taksi|yetkaz|dostavka|benzin|yoqilg|transport|gazel|labo)/i],
  ["SALARY", /(maosh|oylik|avans|usta|brigada|ish haqi|sdelka)/i],
  ["RENT", /(ijara|arenda)/i],
  ["MARKETING", /(reklama|target|instagram|marketing|banner)/i],
  ["TOOLS", /(asbob|instrument|perforator|drel|disk)/i],
];

const METHOD_KEYWORDS: [PaymentMethod, RegExp][] = [
  ["CLICK", /\bclick\b/i],
  ["PAYME", /\bpayme\b/i],
  ["UZUM", /\buzum\b/i],
  ["CARD", /\b(karta|card|plastik)\b/i],
  ["BANK", /\b(bank|perechis|o['ʻ’]?tkazma|hisob raqam)\b/i],
  ["CASH", /\b(naqd|nal)\b/i],
];

export type ParseResult = { ok: true; entry: ParsedFinanceEntry } | { ok: false; error: string };

export function parseFinanceMessage(text: string): ParseResult {
  if (typeof text !== "string") return { ok: false, error: "Matn yo'q" };
  let s = text.trim();
  if (s.length === 0) return { ok: false, error: "Matn bo'sh" };
  if (s.length > 300) return { ok: false, error: "Matn juda uzun (300 belgigacha)" };

  let kind: FinanceKind = "EXPENSE";
  if (/^\+/.test(s) || /^(kirim|tushum)\b/i.test(s)) {
    kind = "INCOME";
    s = s.replace(/^\+\s*|^(kirim|tushum)\s*/i, "");
  } else if (/^-/.test(s) || /^(chiqim|xarajat)\b/i.test(s)) {
    s = s.replace(/^-\s*|^(chiqim|xarajat)\s*/i, "");
  }

  let orderNumber: number | null = null;
  const orderMatch = s.match(/#(\d{1,9})\b/);
  if (orderMatch) {
    orderNumber = Number(orderMatch[1]);
    s = s.replace(orderMatch[0], " ");
  }

  // Summani topish: birinchi raqamli bo'lak (ming ajratgich bo'shliqlari va birlik bilan)
  const amountRe = /(\d{1,3}(?:[  ]\d{3})+|\d+(?:[.,]\d+)?)\s*(mlrd|milliard|mln|million|ming|k|m)?(?=\s|$|[^\p{L}\d])/u;
  const am = s.match(amountRe);
  if (!am) return { ok: false, error: "Summa topilmadi. Masalan: Laminat 4 200 000 #1042" };
  const amountTiyin = parseSom(am[0].trim());
  if (amountTiyin === null || amountTiyin <= 0) return { ok: false, error: "Summa noto'g'ri" };
  s = s.replace(am[0], " ");

  let method: PaymentMethod = "CASH";
  for (const [m, re] of METHOD_KEYWORDS) {
    if (re.test(s)) {
      method = m;
      s = s.replace(re, " ");
      break;
    }
  }

  const note = s.replace(/\s+/g, " ").trim();
  let category: FinanceCategory = kind === "INCOME" ? "CLIENT_PAYMENT" : "OTHER";
  if (kind === "EXPENSE") {
    for (const [c, re] of CATEGORY_KEYWORDS) {
      if (re.test(note)) {
        category = c;
        break;
      }
    }
  }
  return { ok: true, entry: { kind, amountTiyin, category, method, orderNumber, note: note.slice(0, 200) } };
}
