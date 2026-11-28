import { Bot, GrammyError, HttpError, InlineKeyboard, Keyboard, type Context } from "grammy";
import { drywallSheets, laminateM2, paintLiters, parseFinanceMessage } from "@ip/core";
import { Api, ApiError } from "./api";
import { PendingStore, RateLimiter } from "./pending";
import { CATEGORY_UZ, HELP, METHOD_UZ, esc, som } from "./texts";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN yo'q");
const api = new Api(process.env.BOT_API_URL ?? "http://localhost:4000", process.env.INTERNAL_SERVICE_TOKEN ?? "");

const bot = new Bot(TOKEN);
const pending = new PendingStore();
const limiter = new RateLimiter();

// ---- Umumiy himoya: faqat shaxsiy chat, tezlik cheklovi ----
bot.use(async (ctx, next) => {
  if (ctx.chat?.type !== "private" || !ctx.from || ctx.from.is_bot) return;
  if (!limiter.allow(ctx.from.id)) {
    if (ctx.message) await ctx.reply("Juda tez yozyapsiz. Bir daqiqadan keyin urinib ko'ring.");
    return;
  }
  await next();
});

async function withApi(ctx: Context, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403 && /bog'lanmagan/.test(e.message)) return askContact(ctx);
      await ctx.reply(`⚠️ ${esc(e.message)}`, { parse_mode: "HTML" });
      return;
    }
    console.error("Bot xatosi:", e instanceof Error ? e.message : e);
    await ctx.reply("⚠️ Xatolik yuz berdi. Keyinroq urinib ko'ring.");
  }
}

function askContact(ctx: Context) {
  return ctx.reply("Botdan foydalanish uchun telefon raqamingizni yuboring. Raqam kompaniyada xodim sifatida ro'yxatdan o'tgan bo'lishi kerak.", {
    reply_markup: new Keyboard().requestContact("📱 Raqamni yuborish").oneTime().resized(),
  });
}

bot.command("start", (ctx) =>
  withApi(ctx, async () => {
    const me = await api.call<{ name: string; role: string }>("GET", "/internal/telegram/me", ctx.from!.id);
    await ctx.reply(`Assalomu alaykum, ${esc(me.name)}!\n\n${HELP}`, { parse_mode: "HTML" });
  }),
);
bot.command(["yordam", "help"], (ctx) => ctx.reply(HELP, { parse_mode: "HTML" }));

// ---- Kontakt orqali bog'lash: faqat O'Z kontaktini yuborgan foydalanuvchi ----
bot.on("message:contact", (ctx) =>
  withApi(ctx, async () => {
    const c = ctx.message.contact;
    if (c.user_id !== ctx.from.id) {
      await ctx.reply("Faqat o'zingizning raqamingizni yuboring (tugma orqali).");
      return;
    }
    const r = await api.call<{ linked: boolean; name?: string }>("POST", "/internal/telegram/link", null, { phone: c.phone_number, telegramUserId: String(ctx.from.id) });
    if (!r.linked) {
      await ctx.reply("Bu raqam xodimlar ro'yxatida topilmadi. Rahbarga murojaat qiling.", { reply_markup: { remove_keyboard: true } });
      return;
    }
    await ctx.reply(`✅ Bog'landi: ${esc(r.name ?? "")}\n\n${HELP}`, { parse_mode: "HTML", reply_markup: { remove_keyboard: true } });
  }),
);

// ---- Hisobotlar ----
interface Summary {
  incomeTiyin: number;
  expenseTiyin: number;
  netTiyin: number;
  byCategory: { kind: string; category: string; amountTiyin: number }[];
  balancesTiyin: Record<string, number>;
}

function summaryText(title: string, s: Summary) {
  const lines = [
    `<b>${title}</b>`,
    `Kirim: <b>${som(s.incomeTiyin)}</b>`,
    `Chiqim: <b>${som(s.expenseTiyin)}</b>`,
    `Sof: <b>${som(s.netTiyin)}</b>`,
  ];
  const exp = s.byCategory.filter((c) => c.kind === "EXPENSE").sort((a, b) => b.amountTiyin - a.amountTiyin);
  if (exp.length) lines.push("", "<b>Chiqim toifalari:</b>", ...exp.map((c) => `• ${CATEGORY_UZ[c.category] ?? c.category}: ${som(c.amountTiyin)}`));
  const bal = Object.entries(s.balancesTiyin);
  if (bal.length) lines.push("", "<b>Qoldiq (barcha vaqt):</b>", ...bal.map(([m, v]) => `• ${METHOD_UZ[m] ?? m}: ${som(v)}`));
  return lines.join("\n");
}

bot.command("kassa", (ctx) =>
  withApi(ctx, async () => {
    const s = await api.call<Summary>("GET", "/internal/finance/summary", ctx.from!.id);
    await ctx.reply(summaryText("Oxirgi 30 kun", s), { parse_mode: "HTML" });
  }),
);

bot.command("hisobot", (ctx) =>
  withApi(ctx, async () => {
    const r = await api.call<Summary & { debtTotalTiyin: number; pendingApprovals: number; debtors: { number: number; client: { name: string }; dueTiyin: number }[] }>(
      "GET", "/internal/finance/daily-report", ctx.from!.id,
    );
    const extra = [
      "",
      `Mijozlar qarzi jami: <b>${som(r.debtTotalTiyin)}</b>`,
      ...r.debtors.map((d) => `• #${d.number} ${esc(d.client.name)}: ${som(d.dueTiyin)}`),
      r.pendingApprovals ? `\n⏳ Tasdiq kutmoqda: ${r.pendingApprovals} ta — /tasdiq` : "",
    ];
    await ctx.reply(summaryText("Oxirgi 24 soat", r) + extra.join("\n"), { parse_mode: "HTML" });
  }),
);

bot.command("qarzlar", (ctx) =>
  withApi(ctx, async () => {
    const d = await api.call<{ number: number; client: { name: string }; totalTiyin: number; paidTiyin: number; dueTiyin: number }[]>("GET", "/internal/finance/debts", ctx.from!.id);
    if (!d.length) return void (await ctx.reply("Qarzdor mijozlar yo'q 👍"));
    const lines = d.slice(0, 30).map((x) => `#${x.number} ${esc(x.client.name)} — <b>${som(x.dueTiyin)}</b> (to'landi ${som(x.paidTiyin)} / ${som(x.totalTiyin)})`);
    await ctx.reply(`<b>Mijozlar qarzi</b>\n${lines.join("\n")}`, { parse_mode: "HTML" });
  }),
);

bot.command("loyiha", (ctx) =>
  withApi(ctx, async () => {
    const n = Number((ctx.match ?? "").replace("#", "").trim());
    if (!Number.isSafeInteger(n) || n <= 0) return void (await ctx.reply("Buyurtma raqamini yozing: /loyiha 1042"));
    const p = await api.call<{ number: number; revenueTiyin: number; expenseTiyin: number; profitTiyin: number; expenses: { category: string; amountTiyin: number }[] }>(
      "GET", `/internal/finance/orders/${n}/profit`, ctx.from!.id,
    );
    const lines = [
      `<b>Buyurtma #${p.number}</b>`,
      `Tushum: ${som(p.revenueTiyin)}`,
      ...p.expenses.map((e) => `• ${CATEGORY_UZ[e.category] ?? e.category}: −${som(e.amountTiyin)}`),
      `Xarajat jami: ${som(p.expenseTiyin)}`,
      `<b>Sof foyda: ${som(p.profitTiyin)}</b>`,
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  }),
);

bot.command("tasdiq", (ctx) =>
  withApi(ctx, async () => {
    const list = await api.call<{ id: string; amountTiyin: number; note: string; category: string; createdBy: string }[]>("GET", "/internal/finance/pending", ctx.from!.id);
    if (!list.length) return void (await ctx.reply("Tasdiq kutayotgan xarajat yo'q."));
    for (const e of list.slice(0, 10)) {
      await ctx.reply(`${esc(e.createdBy)}: ${esc(e.note || CATEGORY_UZ[e.category] || "")} — <b>${som(e.amountTiyin)}</b>`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("✅ Tasdiqlash", `a:${e.id}`).text("❌ Rad etish", `r:${e.id}`),
      });
    }
  }),
);

bot.command("kalkulyator", async (ctx) => {
  const nums = (ctx.match ?? "").replace(/,/g, ".").split(/\s+/).filter(Boolean).map(Number);
  if (nums.length < 3 || nums.some((n) => !Number.isFinite(n))) {
    await ctx.reply("Xona o'lchamini yozing (metr): /kalkulyator uzunlik kenglik balandlik\nMasalan: /kalkulyator 5 4.2 2.8");
    return;
  }
  try {
    const room = { lengthM: nums[0]!, widthM: nums[1]!, heightM: nums[2]!, openingsM2: nums[3] ?? 0 };
    const lam = laminateM2(room);
    await ctx.reply(
      [
        `<b>Xona ${room.lengthM} × ${room.widthM} × ${room.heightM} m</b>`,
        `Bo'yoq (2 qavat): <b>${paintLiters(room)} litr</b>`,
        `Laminat (+10%): <b>${lam.m2} m²</b> — ${lam.packs} qadoq`,
        `Gipsokarton (shift): <b>${drywallSheets(room)} list</b>`,
        "",
        "<i>Standart me'yorlar bo'yicha taxminiy hisob.</i>",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  } catch (e) {
    await ctx.reply(`⚠️ ${esc(e instanceof Error ? e.message : "O'lcham noto'g'ri")}`, { parse_mode: "HTML" });
  }
});

// ---- Erkin matn: kirim/chiqim ----
bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return void (await ctx.reply("Noma'lum buyruq. /yordam"));
  const parsed = parseFinanceMessage(ctx.message.text);
  if (!parsed.ok) return void (await ctx.reply(`${esc(parsed.error)}\n\n/yordam — namunalar`, { parse_mode: "HTML" }));
  const e = parsed.entry;
  let id: string;
  try {
    id = pending.put(ctx.from.id, e);
  } catch (err) {
    return void (await ctx.reply(err instanceof Error ? err.message : "Xato"));
  }
  const text = [
    e.kind === "INCOME" ? "🟢 <b>Kirim</b>" : "🔴 <b>Chiqim</b>",
    `Summa: <b>${som(e.amountTiyin)}</b>`,
    `Toifa: ${CATEGORY_UZ[e.category]}`,
    `Usul: ${METHOD_UZ[e.method]}`,
    e.orderNumber ? `Buyurtma: #${e.orderNumber}` : "Buyurtma: —",
    e.note ? `Izoh: ${esc(e.note)}` : "",
    "",
    "To'g'rimi?",
  ].filter(Boolean).join("\n");
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("✅ Saqlash", `c:${id}`).text("❌ Bekor", `x:${id}`) });
});

bot.on("message:photo", (ctx) =>
  ctx.reply("Chek suratini izoh bilan yuboring, masalan: «Laminat 4 200 000 #1042». Chekdan summani avtomatik o'qish keyingi versiyada qo'shiladi."),
);

// ---- Tugmalar ----
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const m = data.match(/^([cxar]):([A-Za-z0-9_-]{1,40})$/);
  if (!m) return void (await ctx.answerCallbackQuery());
  const [, action, id] = m as unknown as [string, "c" | "x" | "a" | "r", string];

  if (action === "x") {
    pending.take(id, ctx.from.id);
    await ctx.answerCallbackQuery({ text: "Bekor qilindi" });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    return;
  }
  if (action === "c") {
    const p = pending.take(id, ctx.from.id);
    if (!p) return void (await ctx.answerCallbackQuery({ text: "Muddati o'tgan. Qayta yozing.", show_alert: true }));
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await withApi(ctx, async () => {
      const r = await api.call<{ status: string; amountTiyin: number }>("POST", "/internal/finance/entries", ctx.from.id, {
        kind: p.entry.kind,
        category: p.entry.category,
        method: p.entry.method,
        amountTiyin: p.entry.amountTiyin,
        orderNumber: p.entry.orderNumber,
        note: p.entry.note,
        idempotencyKey: `tg:${ctx.from.id}:${id}`,
      });
      await ctx.reply(r.status === "PENDING_APPROVAL" ? `⏳ Saqlandi, rahbar tasdig'ini kutmoqda (${som(r.amountTiyin)}).` : `✅ Saqlandi: ${som(r.amountTiyin)}`);
    });
    return;
  }
  // a / r — rahbar tasdig'i
  await ctx.answerCallbackQuery();
  await withApi(ctx, async () => {
    await api.call("POST", `/internal/finance/entries/${id}/${action === "a" ? "approve" : "reject"}`, ctx.from.id);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply(action === "a" ? "✅ Tasdiqlandi" : "❌ Rad etildi");
  });
});

bot.catch((err) => {
  const e = err.error;
  if (e instanceof GrammyError) console.error("Telegram xatosi:", e.description);
  else if (e instanceof HttpError) console.error("Telegram bilan aloqa yo'q:", e.message);
  else console.error("Kutilmagan xato:", e instanceof Error ? e.message : e);
});

void bot.api.setMyCommands([
  { command: "kassa", description: "Kassa va 30 kunlik hisob" },
  { command: "hisobot", description: "Kunlik hisobot" },
  { command: "qarzlar", description: "Mijozlar qarzi" },
  { command: "loyiha", description: "Buyurtma foydasi: /loyiha 1042" },
  { command: "tasdiq", description: "Tasdiq kutayotgan xarajatlar" },
  { command: "kalkulyator", description: "Bo'yoq, laminat, gipsokarton" },
  { command: "yordam", description: "Yordam" },
]);

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());
void bot.start({ drop_pending_updates: true, allowed_updates: ["message", "callback_query"] });
console.log("Hisob-kitob boti ishga tushdi");
