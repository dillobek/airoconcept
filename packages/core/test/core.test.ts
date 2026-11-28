import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSom, formatSom, somToTiyin,
  normalizeUzPhone, maskPhone,
  generateOtp, hashOtp, verifyOtpHash,
  canTransition, type TransitionContext,
  computeEstimate,
  evaluate, DEFAULT_RULES, validateRule,
  parseFinanceMessage,
  paintLiters, laminateM2, wallAreaM2,
  validateScene,
} from "../src/index.js";

const PEPPER = "x".repeat(40);
const ctx = (o: Partial<TransitionContext> = {}): TransitionContext => ({
  depositPaid: false, balanceDueTiyin: 0, hasApprovedEstimate: false, acceptanceSigned: false, ...o,
});

test("pul: o'qish va formatlash", () => {
  assert.equal(parseSom("4 200 000"), 420_000_000);
  assert.equal(parseSom("4,2 mln"), 420_000_000);
  assert.equal(parseSom("50 ming"), 5_000_000);
  assert.equal(parseSom("50k"), 5_000_000);
  assert.equal(parseSom("12 mln so'm"), 1_200_000_000);
  assert.equal(parseSom("abc"), null);
  assert.equal(parseSom("-5"), null);
  assert.equal(formatSom(1_245_000_000), "12 450 000 so'm");
  assert.equal(formatSom(150), "1,50 so'm");
  assert.throws(() => somToTiyin(Number.NaN));
});

test("telefon: normalizatsiya", () => {
  assert.equal(normalizeUzPhone("90 123 45 67"), "+998901234567");
  assert.equal(normalizeUzPhone("+998 (90) 123-45-67"), "+998901234567");
  assert.equal(normalizeUzPhone("998331112233"), "+998331112233");
  assert.equal(normalizeUzPhone("12345"), null);
  assert.equal(normalizeUzPhone("+7 900 123 45 67"), null);
  assert.equal(normalizeUzPhone("001234567"), null, "noma'lum operator kodi");
  assert.equal(maskPhone("+998901234567"), "+99890***4567");
});

test("OTP: hash, tekshirish, noto'g'ri kod", () => {
  const code = generateOtp();
  assert.match(code, /^\d{6}$/);
  const h = hashOtp("+998901234567", code, PEPPER);
  assert.ok(verifyOtpHash("+998901234567", code, h, PEPPER));
  assert.ok(!verifyOtpHash("+998901234568", code, h, PEPPER), "boshqa raqam");
  assert.ok(!verifyOtpHash("+998901234567", "000000" === code ? "111111" : "000000", h, PEPPER));
  assert.ok(!verifyOtpHash("+998901234567", "12ab56", h, PEPPER));
  assert.throws(() => hashOtp("+998901234567", code, "short"));
});

test("buyurtma holatlari: ruxsatlar va shartlar", () => {
  assert.deepEqual(canTransition("LEAD", "PLACED", "CLIENT", ctx()), { ok: true });
  assert.equal(canTransition("LEAD", "IN_PRODUCTION", "OWNER", ctx()).ok, false, "bosqichni sakrab bo'lmaydi");
  assert.equal(canTransition("MEASURED", "CONTRACT_SIGNED", "CLIENT", ctx()).ok, false, "smetasiz shartnoma yo'q");
  assert.equal(canTransition("MEASURED", "CONTRACT_SIGNED", "CLIENT", ctx({ hasApprovedEstimate: true })).ok, true);
  assert.equal(canTransition("CONTRACT_SIGNED", "DEPOSIT_PAID", "MANAGER", ctx()).ok, false, "avans tushmagan");
  assert.equal(canTransition("CONTRACT_SIGNED", "DEPOSIT_PAID", "CLIENT", ctx({ depositPaid: true })).ok, false, "mijoz o'zi to'langan deb belgilay olmaydi");
  assert.equal(canTransition("INSTALLED", "COMPLETED", "MANAGER", ctx({ acceptanceSigned: true, balanceDueTiyin: 100 })).ok, false);
  assert.equal(canTransition("INSTALLED", "COMPLETED", "MANAGER", ctx({ acceptanceSigned: true })).ok, true);
  assert.equal(canTransition("IN_PRODUCTION", "CANCELLED", "CLIENT", ctx()).ok, false);
  assert.equal(canTransition("IN_PRODUCTION", "CANCELLED", "OWNER", ctx()).ok, true);
  assert.equal(canTransition("PLACED", "CANCELLED", "CLIENT", ctx()).ok, true);
});

test("smeta: butun sonli hisob, chegirma, avans", () => {
  const e = computeEstimate(
    [
      { kind: "PRODUCT", title: "Divan", unitPriceTiyin: 1_290_000_000, quantityMilli: 1000 },
      { kind: "MATERIAL", title: "Laminat", unitPriceTiyin: 10_500_000, quantityMilli: 20_000, discountBp: 500 },
    ],
    { orderDiscountBp: 200, depositBp: 5000 },
  );
  assert.equal(e.subtotalTiyin, 1_290_000_000 + 210_000_000);
  // laminat: 210 000 000 - 5% = 199 500 000; jami qatorlar 1 489 500 000; -2% = 1 459 710 000
  assert.equal(e.totalTiyin, 1_459_710_000);
  assert.equal(e.depositTiyin, 729_855_000);
  assert.ok(Number.isInteger(e.totalTiyin));
  assert.throws(() => computeEstimate([]));
  assert.throws(() => computeEstimate([{ kind: "PRODUCT", title: "x", unitPriceTiyin: -1, quantityMilli: 1000 }]));
  assert.throws(() => computeEstimate([{ kind: "PRODUCT", title: "x", unitPriceTiyin: 100, quantityMilli: 1000, discountBp: 9000 }]));
});

test("avtomatik qoidalar: standart qoidalar to'g'ri va mos keladi", () => {
  for (const r of DEFAULT_RULES) assert.deepEqual(validateRule(r), [], r.id);
  const now = new Date("2026-12-01T10:00:00Z");
  const planned = evaluate({ type: "ORDER_STATUS_CHANGED", data: { orderId: "o1", from: "CONTRACT_SIGNED", to: "DEPOSIT_PAID" }, occurredAt: now }, DEFAULT_RULES);
  assert.equal(planned.length, 3);
  assert.ok(planned.some((p) => p.action.type === "CREATE_TASK" && p.action.role === "PRODUCTION"));
  const review = evaluate({ type: "ORDER_STATUS_CHANGED", data: { to: "COMPLETED" }, occurredAt: now }, DEFAULT_RULES);
  assert.equal(review[0]!.runAt.toISOString(), "2026-12-08T10:00:00.000Z");
  const idle = evaluate({ type: "PROJECT_IDLE", data: { idleHours: 10, hasOrder: false }, occurredAt: now }, DEFAULT_RULES);
  assert.equal(idle.length, 0, "48 soatdan kam");
  const injected = evaluate({ type: "PROJECT_IDLE", data: { __proto__: 1 } as never, occurredAt: now }, DEFAULT_RULES);
  assert.equal(injected.length, 0);
});

test("bot matn parseri", () => {
  const a = parseFinanceMessage("Laminat 4 200 000 #1042");
  assert.ok(a.ok);
  if (a.ok) {
    assert.equal(a.entry.kind, "EXPENSE");
    assert.equal(a.entry.amountTiyin, 420_000_000);
    assert.equal(a.entry.orderNumber, 1042);
    assert.equal(a.entry.category, "MATERIAL");
    assert.equal(a.entry.note, "Laminat");
  }
  const b = parseFinanceMessage("+ 12 mln #1042 click");
  assert.ok(b.ok && b.entry.kind === "INCOME" && b.entry.amountTiyin === 1_200_000_000 && b.entry.method === "CLICK");
  const c = parseFinanceMessage("taksi 50 ming");
  assert.ok(c.ok && c.entry.category === "TRANSPORT" && c.entry.amountTiyin === 5_000_000);
  assert.equal(parseFinanceMessage("salom").ok, false);
  assert.equal(parseFinanceMessage("x".repeat(400)).ok, false);
});

test("kalkulyatorlar", () => {
  const room = { lengthM: 5, widthM: 4.2, heightM: 2.8, openingsM2: 5 };
  assert.equal(wallAreaM2(room), 46.52);
  assert.equal(paintLiters(room), 11);
  assert.deepEqual(laminateM2(room), { m2: 23.43, packs: 11 });
  assert.throws(() => paintLiters({ lengthM: -1, widthM: 2, heightM: 2 }));
});

test("3D sahna tekshiruvi", () => {
  const ok = validateScene({
    version: 1, room: { lengthM: 5, widthM: 4.2, heightM: 2.8 },
    items: [{ id: "a1", productId: "sofa-oslo", x: 1, z: 1, rotationDeg: 90, price: 1 }],
  });
  assert.ok(ok.ok);
  if (ok.ok) assert.ok(!("price" in ok.scene.items[0]!), "klient yuborgan narx tashlanadi");
  const bad = validateScene({ version: 1, room: { lengthM: 5, widthM: 4, heightM: 2.8 }, items: [{ id: "a", productId: "p", x: 9, z: 1, rotationDeg: 0 }] });
  assert.ok(!bad.ok);
  assert.ok(!validateScene({ version: 1, room: { lengthM: 5, widthM: 4, heightM: 2.8 }, items: [{ id: "<script>", productId: "p", x: 1, z: 1, rotationDeg: 0 }] }).ok);
});
