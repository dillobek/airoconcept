import { assertTiyin, type Tiyin } from "./money.js";

export type EstimateLineKind = "PRODUCT" | "MATERIAL" | "SERVICE";

export interface EstimateLineInput {
  kind: EstimateLineKind;
  title: string;
  /** Bir birlik narxi, tiyin */
  unitPriceTiyin: Tiyin;
  /** Miqdor milli-birlikda (1 dona = 1000, 2,5 m² = 2500) — kasr miqdor ham butun sonda */
  quantityMilli: number;
  /** Qatorga chegirma, bazis punktlarda (1% = 100) */
  discountBp?: number;
}

export interface EstimateLine extends EstimateLineInput {
  grossTiyin: Tiyin;
  discountTiyin: Tiyin;
  totalTiyin: Tiyin;
}

export interface Estimate {
  lines: EstimateLine[];
  subtotalTiyin: Tiyin;
  discountTiyin: Tiyin;
  totalTiyin: Tiyin;
  depositTiyin: Tiyin;
}

export const MAX_DISCOUNT_BP = 3000; // 30% dan ortiq chegirma faqat rahbar orqali alohida
export const MAX_LINES = 500;

/** Butun sonli bo'lish, yarimni yuqoriga yaxlitlash (half-up), manfiy bo'lmagan sonlar uchun */
function mulDivRound(a: number, b: number, d: number): number {
  const big = (BigInt(a) * BigInt(b) * 2n + BigInt(d)) / (2n * BigInt(d));
  const n = Number(big);
  if (!Number.isSafeInteger(n)) throw new RangeError("Hisob chegaradan oshdi");
  return n;
}

export function computeEstimate(
  input: EstimateLineInput[],
  opts: { orderDiscountBp?: number; depositBp?: number } = {},
): Estimate {
  if (!Array.isArray(input) || input.length === 0) throw new RangeError("Smetada kamida bitta qator bo'lishi kerak");
  if (input.length > MAX_LINES) throw new RangeError(`Smetada ${MAX_LINES} tadan ortiq qator bo'lmaydi`);
  const orderDiscountBp = opts.orderDiscountBp ?? 0;
  const depositBp = opts.depositBp ?? 5000;
  for (const [label, bp, max] of [
    ["Umumiy chegirma", orderDiscountBp, MAX_DISCOUNT_BP],
    ["Avans foizi", depositBp, 10000],
  ] as const) {
    if (!Number.isInteger(bp) || bp < 0 || bp > max) throw new RangeError(`${label} noto'g'ri`);
  }

  const lines: EstimateLine[] = input.map((l, i) => {
    if (!l.title || l.title.length > 200) throw new RangeError(`${i + 1}-qator nomi noto'g'ri`);
    assertTiyin(l.unitPriceTiyin, `${i + 1}-qator narxi`);
    if (!Number.isSafeInteger(l.quantityMilli) || l.quantityMilli <= 0 || l.quantityMilli > 100_000_000)
      throw new RangeError(`${i + 1}-qator miqdori noto'g'ri`);
    const bp = l.discountBp ?? 0;
    if (!Number.isInteger(bp) || bp < 0 || bp > MAX_DISCOUNT_BP) throw new RangeError(`${i + 1}-qator chegirmasi noto'g'ri`);
    const gross = mulDivRound(l.unitPriceTiyin, l.quantityMilli, 1000);
    const disc = mulDivRound(gross, bp, 10000);
    return { ...l, discountBp: bp, grossTiyin: gross, discountTiyin: disc, totalTiyin: gross - disc };
  });

  const afterLines = lines.reduce((s, l) => s + l.totalTiyin, 0);
  const lineDiscounts = lines.reduce((s, l) => s + l.discountTiyin, 0);
  const subtotal = lines.reduce((s, l) => s + l.grossTiyin, 0);
  const orderDisc = mulDivRound(afterLines, orderDiscountBp, 10000);
  const total = afterLines - orderDisc;
  assertTiyin(total, "Jami");
  return {
    lines,
    subtotalTiyin: subtotal,
    discountTiyin: lineDiscounts + orderDisc,
    totalTiyin: total,
    depositTiyin: mulDivRound(total, depositBp, 10000),
  };
}
