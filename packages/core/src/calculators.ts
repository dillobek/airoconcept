/**
 * Botdagi tezkor kalkulyatorlar. Kirish metrda, natija yuqoriga yaxlitlangan.
 * Sarflash me'yorlari standart qiymatlar — kompaniya o'z me'yorini berib o'zgartiradi.
 */
export interface RoomDims {
  lengthM: number;
  widthM: number;
  heightM: number;
  /** Deraza va eshiklar umumiy maydoni, m² */
  openingsM2?: number;
}

function check(n: number, label: string, max = 1000) {
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new RangeError(`${label} noto'g'ri`);
}

export function floorAreaM2(r: RoomDims): number {
  check(r.lengthM, "Uzunlik", 200);
  check(r.widthM, "Kenglik", 200);
  return round2(r.lengthM * r.widthM);
}

export function wallAreaM2(r: RoomDims): number {
  check(r.lengthM, "Uzunlik", 200);
  check(r.widthM, "Kenglik", 200);
  check(r.heightM, "Balandlik", 20);
  const openings = r.openingsM2 ?? 0;
  if (!Number.isFinite(openings) || openings < 0) throw new RangeError("Eshik/deraza maydoni noto'g'ri");
  return round2(Math.max(0, 2 * (r.lengthM + r.widthM) * r.heightM - openings));
}

/** Bo'yoq: litr. Standart: 2 qavat, 1 litr ~ 9 m² */
export function paintLiters(r: RoomDims, coats = 2, m2PerLiter = 9): number {
  check(coats, "Qavatlar soni", 5);
  check(m2PerLiter, "Sarf me'yori", 50);
  return Math.ceil((wallAreaM2(r) * coats) / m2PerLiter);
}

/** Laminat: m², zaxira bilan (standart 10%), qadoq hajmiga yaxlitlab */
export function laminateM2(r: RoomDims, wastePct = 10, packM2 = 2.13): { m2: number; packs: number } {
  if (!Number.isFinite(wastePct) || wastePct < 0 || wastePct > 50) throw new RangeError("Zaxira foizi noto'g'ri");
  check(packM2, "Qadoq hajmi", 10);
  const need = floorAreaM2(r) * (1 + wastePct / 100);
  const packs = Math.ceil(need / packM2);
  return { m2: round2(packs * packM2), packs };
}

/** Gipsokarton: list soni (standart 1,2 × 2,5 m = 3 m²), shift uchun, 10% zaxira */
export function drywallSheets(r: RoomDims, sheetM2 = 3, wastePct = 10): number {
  check(sheetM2, "List maydoni", 10);
  return Math.ceil((floorAreaM2(r) * (1 + wastePct / 100)) / sheetM2);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
