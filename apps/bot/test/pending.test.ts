import { test } from "node:test";
import assert from "node:assert/strict";
import { PendingStore, RateLimiter } from "../src/pending";
import { esc } from "../src/texts";

const entry = { kind: "EXPENSE" as const, amountTiyin: 100, category: "OTHER" as const, method: "CASH" as const, orderNumber: null, note: "x" };

test("tasdiqlanmagan yozuv: faqat egasi oladi, bir marta", () => {
  const s = new PendingStore();
  const id = s.put(1, entry);
  assert.equal(s.take(id, 2), null, "boshqa foydalanuvchi ololmaydi");
  assert.ok(s.take(id, 1));
  assert.equal(s.take(id, 1), null, "ikkinchi bosish — hech narsa");
});

test("tasdiqlanmagan yozuv: muddati o'tadi va cheklov", () => {
  const s = new PendingStore(1000, 2);
  const id = s.put(1, entry, 0);
  assert.equal(s.take(id, 1, 5000), null);
  s.put(1, entry, 10_000);
  s.put(1, entry, 10_000);
  assert.throws(() => s.put(1, entry, 10_000));
});

test("tezlik cheklovi", () => {
  const r = new RateLimiter(2, 1000);
  assert.ok(r.allow(1, 0));
  assert.ok(r.allow(1, 10));
  assert.ok(!r.allow(1, 20));
  assert.ok(r.allow(1, 1500));
});

test("HTML ekranlash", () => {
  assert.equal(esc("<b>&"), "&lt;b&gt;&amp;");
});
