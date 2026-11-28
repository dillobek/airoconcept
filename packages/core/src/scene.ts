/**
 * 3D sahna (xonadagi mebellar joylashuvi) — klient yuboradi, server shu yerda tekshiradi.
 * Hech qachon klientdan narx olinmaydi: sahnada faqat productId/variantId bor, narx bazadan olinadi.
 */
export interface SceneItem {
  id: string;
  productId: string;
  variantId?: string;
  /** Xona ichidagi joy, metr */
  x: number;
  z: number;
  /** Aylanish, gradus */
  rotationDeg: number;
}

export interface RoomScene {
  version: 1;
  room: { lengthM: number; widthM: number; heightM: number };
  wallColorId?: string;
  floorMaterialId?: string;
  items: SceneItem[];
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
export const MAX_SCENE_ITEMS = 300;

export type SceneValidation = { ok: true; scene: RoomScene } | { ok: false; errors: string[] };

function num(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

export function validateScene(input: unknown): SceneValidation {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) return { ok: false, errors: ["Sahna obyekt bo'lishi kerak"] };
  const s = input as Record<string, unknown>;
  if (s.version !== 1) errors.push("Sahna versiyasi qo'llab-quvvatlanmaydi");
  const room = s.room as Record<string, unknown> | undefined;
  if (!room || !num(room.lengthM, 0.5, 100) || !num(room.widthM, 0.5, 100) || !num(room.heightM, 1.8, 10))
    errors.push("Xona o'lchamlari noto'g'ri");
  for (const k of ["wallColorId", "floorMaterialId"] as const) {
    if (s[k] !== undefined && (typeof s[k] !== "string" || !ID_RE.test(s[k] as string))) errors.push(`${k} noto'g'ri`);
  }
  if (!Array.isArray(s.items)) errors.push("items ro'yxat bo'lishi kerak");
  else if (s.items.length > MAX_SCENE_ITEMS) errors.push(`Xonada ${MAX_SCENE_ITEMS} tadan ortiq buyum bo'lmaydi`);
  else if (room && num(room.lengthM, 0.5, 100) && num(room.widthM, 0.5, 100)) {
    const ids = new Set<string>();
    s.items.forEach((raw, i) => {
      const it = raw as Record<string, unknown>;
      const p = `${i + 1}-buyum`;
      if (typeof it.id !== "string" || !ID_RE.test(it.id) || ids.has(it.id)) errors.push(`${p}: id noto'g'ri yoki takror`);
      else ids.add(it.id);
      if (typeof it.productId !== "string" || !ID_RE.test(it.productId)) errors.push(`${p}: productId noto'g'ri`);
      if (it.variantId !== undefined && (typeof it.variantId !== "string" || !ID_RE.test(it.variantId))) errors.push(`${p}: variantId noto'g'ri`);
      if (!num(it.x, 0, room.lengthM as number) || !num(it.z, 0, room.widthM as number)) errors.push(`${p}: xonadan tashqarida`);
      if (!num(it.rotationDeg, -360, 360)) errors.push(`${p}: burchak noto'g'ri`);
    });
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 50) };
  const r = room as { lengthM: number; widthM: number; heightM: number };
  return {
    ok: true,
    scene: {
      version: 1,
      room: { lengthM: r.lengthM, widthM: r.widthM, heightM: r.heightM },
      ...(s.wallColorId ? { wallColorId: s.wallColorId as string } : {}),
      ...(s.floorMaterialId ? { floorMaterialId: s.floorMaterialId as string } : {}),
      // Faqat ruxsat etilgan maydonlar nusxalanadi (ortiqcha maydonlar tashlanadi)
      items: (s.items as Record<string, unknown>[]).map((it) => ({
        id: it.id as string,
        productId: it.productId as string,
        ...(it.variantId ? { variantId: it.variantId as string } : {}),
        x: it.x as number,
        z: it.z as number,
        rotationDeg: it.rotationDeg as number,
      })),
    },
  };
}
