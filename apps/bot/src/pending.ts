import { randomBytes } from "node:crypto";
import type { ParsedFinanceEntry } from "@ip/core";

/**
 * Tasdiqlanmagan yozuvlar (foydalanuvchi "Saqlash" ni bosguncha). Xotirada, 10 daqiqa.
 * Kalit tasodifiy — boshqa foydalanuvchi tugma ma'lumotini taxmin qilib bosa olmaydi,
 * va baribir egasi tekshiriladi.
 */
export interface PendingEntry {
  ownerId: number;
  entry: ParsedFinanceEntry;
  createdAt: number;
}

export class PendingStore {
  private readonly map = new Map<string, PendingEntry>();
  constructor(private readonly ttlMs = 10 * 60_000, private readonly maxPerUser = 20) {}

  put(ownerId: number, entry: ParsedFinanceEntry, now = Date.now()): string {
    this.sweep(now);
    const mine = [...this.map.values()].filter((p) => p.ownerId === ownerId).length;
    if (mine >= this.maxPerUser) throw new Error("Tasdiqlanmagan yozuvlar juda ko'p. Avvalgilarini saqlang yoki bekor qiling");
    const id = randomBytes(9).toString("base64url");
    this.map.set(id, { ownerId, entry, createdAt: now });
    return id;
  }

  /** Faqat egasi oladi; olingandan keyin o'chadi (ikki marta bosish = bitta yozuv) */
  take(id: string, ownerId: number, now = Date.now()): PendingEntry | null {
    this.sweep(now);
    const p = this.map.get(id);
    if (!p || p.ownerId !== ownerId) return null;
    this.map.delete(id);
    return p;
  }

  private sweep(now: number) {
    for (const [k, v] of this.map) if (now - v.createdAt > this.ttlMs) this.map.delete(k);
  }
}

/** Oddiy tezlik cheklovi: foydalanuvchiga daqiqasiga N ta xabar */
export class RateLimiter {
  private readonly hits = new Map<number, number[]>();
  constructor(private readonly limit = 30, private readonly windowMs = 60_000) {}
  allow(userId: number, now = Date.now()): boolean {
    const arr = (this.hits.get(userId) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(userId, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(userId, arr);
    return true;
  }
}
