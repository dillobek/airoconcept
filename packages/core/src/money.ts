/**
 * Pul har doim BUTUN son sifatida, tiyinda saqlanadi (1 so'm = 100 tiyin).
 * Float ishlatilmaydi — yaxlitlash xatolari moliyada qabul qilinmaydi.
 */
export type Tiyin = number;

export const TIYIN_PER_SOM = 100;
/** Bitta yozuv uchun yuqori chegara: 100 mlrd so'm. Xato kiritishdan himoya. */
export const MAX_AMOUNT_TIYIN: Tiyin = 100_000_000_000 * TIYIN_PER_SOM;

export function assertTiyin(value: number, label = "summa"): asserts value is Tiyin {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} butun son bo'lishi kerak (tiyin)`);
  if (value < 0) throw new RangeError(`${label} manfiy bo'lishi mumkin emas`);
  if (value > MAX_AMOUNT_TIYIN) throw new RangeError(`${label} ruxsat etilgan chegaradan katta`);
}

export function somToTiyin(som: number): Tiyin {
  if (!Number.isFinite(som)) throw new RangeError("summa son emas");
  const t = Math.round(som * TIYIN_PER_SOM);
  assertTiyin(t);
  return t;
}

/** 1250000000 tiyin -> "12 500 000 so'm" */
export function formatSom(tiyin: Tiyin, withUnit = true): string {
  assertTiyin(Math.abs(tiyin));
  const sign = tiyin < 0 ? "-" : "";
  const abs = Math.abs(tiyin);
  const som = Math.floor(abs / TIYIN_PER_SOM);
  const rest = abs % TIYIN_PER_SOM;
  const grouped = String(som).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const frac = rest ? "," + String(rest).padStart(2, "0") : "";
  return `${sign}${grouped}${frac}${withUnit ? " so'm" : ""}`;
}

const MULTIPLIERS: Record<string, number> = {
  mlrd: 1_000_000_000,
  milliard: 1_000_000_000,
  mln: 1_000_000,
  million: 1_000_000,
  m: 1_000_000,
  ming: 1_000,
  k: 1_000,
};

/**
 * Inson yozgan summani o'qiydi: "4 200 000", "4200000", "4,2 mln", "50 ming", "50k", "1.5m".
 * Natija tiyinda. O'qib bo'lmasa null.
 */
export function parseSom(input: string): Tiyin | null {
  const s = input.trim().toLowerCase().replace(/so['ʻ’`]?m/g, "").trim();
  const m = s.match(/^(\d{1,3}(?:[  ]\d{3})+|\d+(?:[.,]\d+)?)\s*(mlrd|milliard|mln|million|ming|k|m)?$/);
  if (!m) return null;
  const numPart = m[1]!;
  const unit = m[2];
  let value: number;
  if (/[  ]/.test(numPart)) {
    value = Number(numPart.replace(/[  ]/g, ""));
  } else {
    value = Number(numPart.replace(",", "."));
  }
  if (!Number.isFinite(value)) return null;
  if (unit) value *= MULTIPLIERS[unit]!;
  try {
    return somToTiyin(value);
  } catch {
    return null;
  }
}
