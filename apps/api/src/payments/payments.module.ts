import { Body, Controller, Headers, HttpCode, Inject, Injectable, Logger, Module, Post } from "@nestjs/common";
import { createHash } from "node:crypto";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../prisma/prisma.service";
import { ENV, type Env } from "../config/env";
import { Public } from "../common/http";
import { safeEqual } from "../common/guards";
import { AutomationService } from "../automation/automation.service";
import { OrdersModule, OrdersService } from "../orders/orders.module";

/**
 * To'lov tizimlari webhooklari. Har biri o'z imzosi/kaliti bilan tekshiriladi.
 * MUHIM: ishga tushirishdan oldin Payme va Click sandbox testlaridan to'liq o'tkazing.
 * Summalar tiyinda. Bir xil tranzaksiya ikki marta kelsa — ikkinchi marta pul yozilmaydi (idempotent).
 */
@Injectable()
export class PaymentsService {
  private readonly log = new Logger("Payments");
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly automation: AutomationService,
  ) {}

  async orderForPayment(orderNumber: number) {
    if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0) return null;
    const order = await this.prisma.order.findUnique({ where: { number: orderNumber }, select: { id: true, number: true, status: true, clientId: true } });
    if (!order || order.status === "CANCELLED" || order.status === "COMPLETED") return null;
    const fin = await this.orders.financials(order.id);
    if (!fin.hasApprovedEstimate) return null;
    return { order, balanceDueTiyin: fin.balanceDueTiyin };
  }

  /** To'lov tushgandan keyin: avans yopilgan bo'lsa buyurtma avtomatik "Avans to'landi" ga o'tadi */
  async afterPaid(orderId: string, amountTiyin: bigint) {
    await this.automation.emit({ type: "PAYMENT_RECEIVED", data: { orderId, amountTiyin: Number(amountTiyin) }, occurredAt: new Date() });
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true, clientId: true } });
    if (order?.status !== "CONTRACT_SIGNED") return;
    const fin = await this.orders.financials(orderId);
    if (!fin.depositPaid) return;
    const r = await this.prisma.order.updateMany({ where: { id: orderId, status: "CONTRACT_SIGNED" }, data: { status: "DEPOSIT_PAID" } });
    if (r.count) {
      await this.prisma.orderStatusHistory.create({ data: { orderId, from: "CONTRACT_SIGNED", to: "DEPOSIT_PAID", note: "To'lov tizimi orqali avtomatik" } });
      await this.automation.emit({ type: "ORDER_STATUS_CHANGED", data: { orderId, clientId: order.clientId, from: "CONTRACT_SIGNED", to: "DEPOSIT_PAID" }, occurredAt: new Date() });
    }
  }
}

// ======================= PAYME (JSON-RPC) =======================
const PaymeErr = {
  auth: { code: -32504, message: { uz: "Ruxsat yo'q", ru: "Недостаточно привилегий", en: "Insufficient privileges" } },
  method: { code: -32601, message: { uz: "Metod topilmadi", ru: "Метод не найден", en: "Method not found" } },
  parse: { code: -32700, message: { uz: "So'rov noto'g'ri", ru: "Ошибка разбора", en: "Parse error" } },
  amount: { code: -31001, message: { uz: "Summa noto'g'ri", ru: "Неверная сумма", en: "Wrong amount" } },
  order: { code: -31050, message: { uz: "Buyurtma topilmadi", ru: "Заказ не найден", en: "Order not found" }, data: "order" },
  txNotFound: { code: -31003, message: { uz: "Tranzaksiya topilmadi", ru: "Транзакция не найдена", en: "Transaction not found" } },
  cannot: { code: -31008, message: { uz: "Amalni bajarib bo'lmaydi", ru: "Невозможно выполнить операцию", en: "Cannot perform" } },
};
const PAYME_TIMEOUT_MS = 12 * 3600_000;

interface RpcBody {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

@Controller("payments/payme")
@Public()
@SkipThrottle()
export class PaymeController {
  constructor(private readonly prisma: PrismaService, private readonly svc: PaymentsService, @Inject(ENV) private readonly env: Env) {}

  @Post()
  @HttpCode(200)
  async rpc(@Headers("authorization") auth: string | undefined, @Body() body: RpcBody) {
    const id = body?.id ?? null;
    const fail = (e: object) => ({ id, error: e });
    if (!this.env.PAYME_KEY) return fail(PaymeErr.auth);
    const expected = "Basic " + Buffer.from(`Paycom:${this.env.PAYME_KEY}`).toString("base64");
    if (typeof auth !== "string" || !safeEqual(auth, expected)) return fail(PaymeErr.auth);
    if (!body || typeof body.method !== "string" || typeof body.params !== "object" || body.params === null) return fail(PaymeErr.parse);
    const p = body.params;

    const amount = typeof p.amount === "number" && Number.isSafeInteger(p.amount) ? BigInt(p.amount) : null;
    const account = (p.account ?? {}) as Record<string, unknown>;
    const orderNumber = Number(account.order);
    const txId = typeof p.id === "string" && p.id.length <= 64 ? p.id : null;

    const result = (r: object) => ({ id, result: r });
    const stateOf = (s: { status: string; providerState: number | null }) => s.providerState ?? (s.status === "PAID" ? 2 : 1);

    switch (body.method) {
      case "CheckPerformTransaction": {
        const info = await this.svc.orderForPayment(orderNumber);
        if (!info) return fail(PaymeErr.order);
        if (!amount || amount <= 0n || amount > info.balanceDueTiyin) return fail(PaymeErr.amount);
        return result({ allow: true });
      }
      case "CreateTransaction": {
        if (!txId) return fail(PaymeErr.parse);
        const existing = await this.prisma.payment.findUnique({ where: { provider_externalId: { provider: "PAYME", externalId: txId } } });
        if (existing) {
          if (existing.status !== "PENDING") return fail(PaymeErr.cannot);
          if (Date.now() - existing.createdAt.getTime() > PAYME_TIMEOUT_MS) {
            await this.prisma.payment.update({ where: { id: existing.id }, data: { status: "CANCELLED", providerState: -1, cancelledAt: new Date(), cancelReason: 4 } });
            return fail(PaymeErr.cannot);
          }
          return result({ create_time: existing.createdAt.getTime(), transaction: existing.id, state: 1 });
        }
        const info = await this.svc.orderForPayment(orderNumber);
        if (!info) return fail(PaymeErr.order);
        if (!amount || amount <= 0n || amount > info.balanceDueTiyin) return fail(PaymeErr.amount);
        const created = await this.prisma.payment.create({
          data: { orderId: info.order.id, provider: "PAYME", amountTiyin: amount, externalId: txId, status: "PENDING", providerState: 1, providerTimeMs: typeof p.time === "number" ? BigInt(p.time) : null },
        });
        return result({ create_time: created.createdAt.getTime(), transaction: created.id, state: 1 });
      }
      case "PerformTransaction": {
        if (!txId) return fail(PaymeErr.parse);
        const tx = await this.prisma.payment.findUnique({ where: { provider_externalId: { provider: "PAYME", externalId: txId } } });
        if (!tx) return fail(PaymeErr.txNotFound);
        if (tx.status === "PAID") return result({ transaction: tx.id, perform_time: tx.performedAt!.getTime(), state: 2 });
        if (tx.status !== "PENDING") return fail(PaymeErr.cannot);
        if (Date.now() - tx.createdAt.getTime() > PAYME_TIMEOUT_MS) {
          await this.prisma.payment.update({ where: { id: tx.id }, data: { status: "CANCELLED", providerState: -1, cancelledAt: new Date(), cancelReason: 4 } });
          return fail(PaymeErr.cannot);
        }
        const now = new Date();
        const upd = await this.prisma.payment.updateMany({ where: { id: tx.id, status: "PENDING" }, data: { status: "PAID", providerState: 2, performedAt: now } });
        if (upd.count && tx.orderId) await this.svc.afterPaid(tx.orderId, tx.amountTiyin);
        return result({ transaction: tx.id, perform_time: now.getTime(), state: 2 });
      }
      case "CancelTransaction": {
        if (!txId) return fail(PaymeErr.parse);
        const tx = await this.prisma.payment.findUnique({ where: { provider_externalId: { provider: "PAYME", externalId: txId } } });
        if (!tx) return fail(PaymeErr.txNotFound);
        const reason = typeof p.reason === "number" ? p.reason : null;
        if (tx.status === "PENDING") {
          const t = new Date();
          await this.prisma.payment.update({ where: { id: tx.id }, data: { status: "CANCELLED", providerState: -1, cancelledAt: t, cancelReason: reason } });
          return result({ transaction: tx.id, cancel_time: t.getTime(), state: -1 });
        }
        if (tx.status === "PAID") {
          // Qaytarish (refund) — buxgalteriya tekshiradi; holat -2
          const t = new Date();
          await this.prisma.payment.update({ where: { id: tx.id }, data: { status: "REFUNDED", providerState: -2, cancelledAt: t, cancelReason: reason } });
          return result({ transaction: tx.id, cancel_time: t.getTime(), state: -2 });
        }
        return result({ transaction: tx.id, cancel_time: tx.cancelledAt?.getTime() ?? 0, state: stateOf(tx) });
      }
      case "CheckTransaction": {
        if (!txId) return fail(PaymeErr.parse);
        const tx = await this.prisma.payment.findUnique({ where: { provider_externalId: { provider: "PAYME", externalId: txId } } });
        if (!tx) return fail(PaymeErr.txNotFound);
        return result({
          create_time: tx.createdAt.getTime(),
          perform_time: tx.performedAt?.getTime() ?? 0,
          cancel_time: tx.cancelledAt?.getTime() ?? 0,
          transaction: tx.id,
          state: stateOf(tx),
          reason: tx.cancelReason,
        });
      }
      case "GetStatement": {
        const from = typeof p.from === "number" ? new Date(p.from) : null;
        const to = typeof p.to === "number" ? new Date(p.to) : null;
        if (!from || !to || from > to) return fail(PaymeErr.parse);
        const rows = await this.prisma.payment.findMany({ where: { provider: "PAYME", createdAt: { gte: from, lte: to } }, include: { order: { select: { number: true } } }, take: 5000 });
        return result({
          transactions: rows.map((t) => ({
            id: t.externalId, time: Number(t.providerTimeMs ?? 0), amount: Number(t.amountTiyin), account: { order: t.order?.number },
            create_time: t.createdAt.getTime(), perform_time: t.performedAt?.getTime() ?? 0, cancel_time: t.cancelledAt?.getTime() ?? 0,
            transaction: t.id, state: stateOf(t), reason: t.cancelReason,
          })),
        });
      }
      default:
        return fail(PaymeErr.method);
    }
  }
}

// ======================= CLICK (SHOP API) =======================
type ClickBody = Record<string, string | undefined>;

function somStringToTiyin(s: string | undefined): bigint | null {
  if (!s || !/^\d{1,13}(\.\d{1,2})?$/.test(s)) return null;
  const [a, b = ""] = s.split(".");
  return BigInt(a!) * 100n + BigInt((b + "00").slice(0, 2));
}

@Controller("payments/click")
@Public()
@SkipThrottle()
export class ClickController {
  constructor(private readonly prisma: PrismaService, private readonly svc: PaymentsService, @Inject(ENV) private readonly env: Env) {}

  private signOk(b: ClickBody, withPrepare: boolean): boolean {
    if (!this.env.CLICK_SECRET_KEY || !b.sign_string) return false;
    const parts = [b.click_trans_id, b.service_id, this.env.CLICK_SECRET_KEY, b.merchant_trans_id, ...(withPrepare ? [b.merchant_prepare_id] : []), b.amount, b.action, b.sign_time];
    if (parts.some((x) => x === undefined)) return false;
    const md5 = createHash("md5").update(parts.join("")).digest("hex");
    return safeEqual(md5, String(b.sign_string).toLowerCase());
  }

  private answer(b: ClickBody, error: number, note: string, extra: Record<string, unknown> = {}) {
    return { click_trans_id: b.click_trans_id ?? null, merchant_trans_id: b.merchant_trans_id ?? null, error, error_note: note, ...extra };
  }

  @Post("prepare")
  @HttpCode(200)
  async prepare(@Body() b: ClickBody) {
    if (!this.signOk(b, false)) return this.answer(b, -1, "SIGN CHECK FAILED");
    if (b.service_id !== this.env.CLICK_SERVICE_ID) return this.answer(b, -8, "Service mismatch");
    if (b.action !== "0") return this.answer(b, -3, "Action not found");
    const amount = somStringToTiyin(b.amount);
    const info = await this.svc.orderForPayment(Number(b.merchant_trans_id));
    if (!info) return this.answer(b, -5, "Order not found");
    if (!amount || amount <= 0n || amount > info.balanceDueTiyin) return this.answer(b, -2, "Incorrect amount");
    const ext = String(b.click_trans_id).slice(0, 64);
    const existing = await this.prisma.payment.findUnique({ where: { provider_externalId: { provider: "CLICK", externalId: ext } } });
    if (existing) {
      if (existing.status === "PAID") return this.answer(b, -4, "Already paid");
      if (existing.status === "CANCELLED") return this.answer(b, -9, "Transaction cancelled");
      return this.answer(b, 0, "Success", { merchant_prepare_id: existing.seq });
    }
    const p = await this.prisma.payment.create({ data: { orderId: info.order.id, provider: "CLICK", amountTiyin: amount, externalId: ext, status: "PENDING" } });
    return this.answer(b, 0, "Success", { merchant_prepare_id: p.seq });
  }

  @Post("complete")
  @HttpCode(200)
  async complete(@Body() b: ClickBody) {
    if (!this.signOk(b, true)) return this.answer(b, -1, "SIGN CHECK FAILED");
    if (b.action !== "1") return this.answer(b, -3, "Action not found");
    const seq = Number(b.merchant_prepare_id);
    const p = Number.isSafeInteger(seq) ? await this.prisma.payment.findUnique({ where: { seq } }) : null;
    if (!p || p.provider !== "CLICK" || p.externalId !== String(b.click_trans_id)) return this.answer(b, -6, "Transaction not found");
    if (p.status === "PAID") return this.answer(b, -4, "Already paid", { merchant_confirm_id: p.seq });
    if (p.status === "CANCELLED") return this.answer(b, -9, "Transaction cancelled");
    const amount = somStringToTiyin(b.amount);
    if (amount !== p.amountTiyin) return this.answer(b, -2, "Incorrect amount");
    if (b.error && Number(b.error) < 0) {
      await this.prisma.payment.update({ where: { id: p.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      return this.answer(b, -9, "Transaction cancelled");
    }
    const upd = await this.prisma.payment.updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: "PAID", performedAt: new Date() } });
    if (upd.count && p.orderId) await this.svc.afterPaid(p.orderId, p.amountTiyin);
    return this.answer(b, 0, "Success", { merchant_confirm_id: p.seq });
  }
}

@Module({ imports: [OrdersModule], controllers: [PaymeController, ClickController], providers: [PaymentsService] })
export class PaymentsModule {}
