import { formatSom } from "@ip/core";

export const CATEGORY_UZ: Record<string, string> = {
  MATERIAL: "Material",
  FURNITURE: "Mebel",
  TRANSPORT: "Transport",
  SALARY: "Ish haqi",
  RENT: "Ijara",
  MARKETING: "Reklama",
  TOOLS: "Asbob",
  CLIENT_PAYMENT: "Mijoz to'lovi",
  OTHER: "Boshqa",
};
export const METHOD_UZ: Record<string, string> = { CASH: "Naqd", CARD: "Karta", BANK: "Bank", CLICK: "Click", PAYME: "Payme", UZUM: "Uzum" };

/** Telegram HTML uchun xavfsiz matn (foydalanuvchi yozgan izoh HTML sifatida talqin qilinmaydi) */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const som = (t: number) => formatSom(t);

export const HELP = [
  "<b>Hisob-kitob boti</b>",
  "",
  "<b>Kirim-chiqim — oddiy matn bilan:</b>",
  "<code>Laminat 4 200 000 #1042</code> — chiqim, buyurtmaga bog'lanadi",
  "<code>taksi 50 ming</code> — chiqim",
  "<code>+ 12 mln #1042 click</code> — mijozdan kirim",
  "",
  "<b>Buyruqlar:</b>",
  "/kassa — oxirgi 30 kun va qoldiqlar",
  "/hisobot — kunlik hisobot",
  "/qarzlar — mijozlar qarzi",
  "/loyiha 1042 — buyurtma foydasi",
  "/tasdiq — tasdiq kutayotgan xarajatlar (rahbar)",
  "/kalkulyator 5 4.2 2.8 — bo'yoq, laminat, gipsokarton",
].join("\n");
