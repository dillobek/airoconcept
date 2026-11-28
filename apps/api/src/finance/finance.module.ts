import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Injectable, Logger, Module, NotFoundException, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SkipThrottle } from "@nestjs/throttler";
import { z } from "zod";
import type { FinanceCategory, PaymentProvider, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ENV, type Env } from "../config/env";
import { AuthUser, CurrentUser, Public, ZodPipe, tiyin } from "../common/http";
import { InternalServiceGuard } from "../common/guards";
import { AuditService } from "../common/audit";
import { NotificationsService } from "../notifications/notifications.module";
import { formatSom } from "@ip/core";

const CATEGORIES = ["MATERIAL", "FURNITURE", "TRANSPORT", "SALARY", "RENT", "MARKETING", "TOOLS", "CLIENT_PAYMENT", "OTHER"] as const;
const METHODS = ["CASH", "CARD", "BANK", "CLICK", "PAYME", "UZUM"] as const;

const EntryDto = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]),
  category: z.enum(CATEGORIES),
  method: z.enum(METHODS).default("CASH"),
  amountTiyin: z.number().int().min(100).max(Number.MAX_SAFE_INTEGER),
  orderNumber: z.number().int().min(1).max(999_999_999).nullable().optional(),
  note: z.string().trim().max(200).default(""),
  occurredAt: z.coerce.date().optional(),
  /** Bot tugmasi ikki marta bosilsa ham bitta yozuv */
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,80}$/).optional(),
});
const RangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
const VoidDto = z.object({ reason: z.string().trim().min(3).max(200) });
const cuid = z.string().cuid();

const CAN_EXPENSE: Role[] = ["OWNER", "ACCOUNTANT", "MANAGER", "FOREMAN", "SUPPLY"];
const CAN_INCOME: Role[] = ["OWNER", "ACCOUNTANT", "MANAGER"];
const CAN_REPORT: Role[] = ["OWNER", "ACCOUNTANT"];

function need(user: AuthUser, roles: Role[]) {
  if (!roles.includes(user.role)) throw new ForbiddenException("Bu amal uchun huquqingiz yo'q");
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(user: AuthUser, dto: z.infer<typeof EntryDto>) {
    need(user, dto.kind === "INCOME" ? CAN_INCOME : CAN_EXPENSE);
    if (dto.kind === "INCOME" && !["CLIENT_PAYMENT", "OTHER"].includes(dto.category)) throw new BadRequestException("Kirim toifasi noto'g'ri");
    if (dto.kind === "EXPENSE" && dto.category === "CLIENT_PAYMENT") throw new BadRequestException("Chiqim toifasi noto'g'ri");
    if (dto.occurredAt && dto.occurredAt.getTime() > Date.now() + 3600_000) throw new BadRequestException("Kelajakdagi sana");

    if (dto.idempotencyKey) {
      const dup = await this.prisma.financeEntry.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (dup) return this.present(dup);
    }
    let orderId: string | null = null;
    if (dto.orderNumber) {
      const order = await this.prisma.order.findUnique({ where: { number: dto.orderNumber }, select: { id: true, status: true } });
      if (!order) throw new NotFoundException(`#${dto.orderNumber} buyurtma topilmadi`);
      orderId = order.id;
    }
    if (dto.kind === "INCOME" && dto.category === "CLIENT_PAYMENT" && !orderId) throw new BadRequestException("Mijoz to'lovi uchun buyurtma raqami kerak (#1042)");

    const thresholdTiyin = BigInt(this.env.FINANCE_APPROVAL_THRESHOLD) * 100n;
    const amount = BigInt(dto.amountTiyin);
    const needsApproval = dto.kind === "EXPENSE" && user.role !== "OWNER" && amount >= thresholdTiyin;

    const entry = await this.prisma.$transaction(async (tx) => {
      const e = await tx.financeEntry.create({
        data: {
          kind: dto.kind,
          category: dto.category as FinanceCategory,
          method: dto.method as PaymentProvider,
          amountTiyin: amount,
          orderId,
          note: dto.note,
          occurredAt: dto.occurredAt ?? new Date(),
          status: needsApproval ? "PENDING_APPROVAL" : "CONFIRMED",
          createdById: user.id,
          idempotencyKey: dto.idempotencyKey ?? null,
        },
      });
      if (!needsApproval && dto.kind === "INCOME" && dto.category === "CLIENT_PAYMENT" && orderId) {
        // Mijoz to'lovi buyurtma hisobiga ham yoziladi (avans/qarz hisobi shundan)
        await tx.payment.create({ data: { orderId, provider: dto.method as PaymentProvider, amountTiyin: amount, status: "PAID", performedAt: new Date(), externalId: `fin:${e.id}`, createdById: user.id } });
      }
      return e;
    });
    await this.audit.record(user.id, "finance.create", "financeEntry", entry.id, { kind: dto.kind, amountTiyin: dto.amountTiyin, status: entry.status });
    if (needsApproval) await this.notify.toRole("OWNER", "finance_approval", { note: dto.note || dto.category, amount: formatSom(dto.amountTiyin) });
    return this.present(entry);
  }

  async decide(user: AuthUser, id: string, approve: boolean) {
    need(user, ["OWNER"]);
    const e = await this.prisma.financeEntry.findUnique({ where: { id } });
    if (!e || e.status !== "PENDING_APPROVAL") throw new NotFoundException("Tasdiq kutayotgan yozuv topilmadi");
    const updated = await this.prisma.financeEntry.updateMany({
      where: { id, status: "PENDING_APPROVAL" },
      data: { status: approve ? "CONFIRMED" : "REJECTED", approvedById: user.id },
    });
    if (updated.count === 0) throw new NotFoundException();
    await this.audit.record(user.id, approve ? "finance.approve" : "finance.reject", "financeEntry", id);
    return { id, status: approve ? "CONFIRMED" : "REJECTED" };
  }

  /** Pul yozuvi o'chirilmaydi — bekor qilinadi, sababi bilan */
  async void(user: AuthUser, id: string, reason: string) {
    need(user, CAN_REPORT);
    const e = await this.prisma.financeEntry.findUnique({ where: { id } });
    if (!e || e.status === "VOID") throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.financeEntry.update({ where: { id }, data: { status: "VOID", voidReason: reason } }),
      this.prisma.payment.updateMany({ where: { externalId: `fin:${id}`, status: "PAID" }, data: { status: "CANCELLED", cancelledAt: new Date() } }),
    ]);
    await this.audit.record(user.id, "finance.void", "financeEntry", id, { reason });
    return { id, status: "VOID" };
  }

  pending(user: AuthUser) {
    need(user, ["OWNER"]);
    return this.prisma.financeEntry
      .findMany({ where: { status: "PENDING_APPROVAL" }, orderBy: { createdAt: "asc" }, take: 50, include: { createdBy: { select: { name: true } } } })
      .then((rows) => rows.map((r) => ({ ...this.present(r), createdBy: r.createdBy.name })));
  }

  async summary(user: AuthUser, q: z.infer<typeof RangeQuery>) {
    need(user, CAN_REPORT);
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getTime() - 30 * 24 * 3600_000);
    if (from > to) throw new BadRequestException("Sana oralig'i noto'g'ri");
    const where: Prisma.FinanceEntryWhereInput = { status: "CONFIRMED", occurredAt: { gte: from, lte: to } };
    const [byKind, byCategory, byMethod, cashAll] = await Promise.all([
      this.prisma.financeEntry.groupBy({ by: ["kind"], where, _sum: { amountTiyin: true } }),
      this.prisma.financeEntry.groupBy({ by: ["kind", "category"], where, _sum: { amountTiyin: true } }),
      this.prisma.financeEntry.groupBy({ by: ["kind", "method"], where, _sum: { amountTiyin: true } }),
      this.prisma.financeEntry.groupBy({ by: ["kind", "method"], where: { status: "CONFIRMED" }, _sum: { amountTiyin: true } }),
    ]);
    const sum = (k: string) => tiyin(byKind.find((r) => r.kind === k)?._sum.amountTiyin ?? 0n);
    const balances: Record<string, number> = {};
    for (const r of cashAll) balances[r.method] = (balances[r.method] ?? 0) + (r.kind === "INCOME" ? 1 : -1) * tiyin(r._sum.amountTiyin ?? 0n);
    return {
      from, to,
      incomeTiyin: sum("INCOME"),
      expenseTiyin: sum("EXPENSE"),
      netTiyin: sum("INCOME") - sum("EXPENSE"),
      byCategory: byCategory.map((r) => ({ kind: r.kind, category: r.category, amountTiyin: tiyin(r._sum.amountTiyin ?? 0n) })),
      byMethod: byMethod.map((r) => ({ kind: r.kind, method: r.method, amountTiyin: tiyin(r._sum.amountTiyin ?? 0n) })),
      balancesTiyin: balances,
    };
  }

  /** Mijozlar qarzi: tasdiqlangan smeta − to'langan summa */
  async debts(user: AuthUser) {
    need(user, ["OWNER", "ACCOUNTANT", "MANAGER"]);
    const orders = await this.prisma.order.findMany({
      where: { status: { notIn: ["CANCELLED"] }, estimates: { some: { status: "APPROVED" } } },
      select: {
        id: true, number: true, status: true,
        client: { select: { name: true, phone: true } },
        estimates: { where: { status: "APPROVED" }, select: { totalTiyin: true }, take: 1 },
        payments: { where: { status: "PAID" }, select: { amountTiyin: true } },
      },
      take: 1000,
    });
    return orders
      .map((o) => {
        const total = o.estimates[0]?.totalTiyin ?? 0n;
        const paid = o.payments.reduce((s, p) => s + p.amountTiyin, 0n);
        return { orderId: o.id, number: o.number, status: o.status, client: o.client, totalTiyin: tiyin(total), paidTiyin: tiyin(paid), dueTiyin: tiyin(total > paid ? total - paid : 0n) };
      })
      .filter((d) => d.dueTiyin > 0)
      .sort((a, b) => b.dueTiyin - a.dueTiyin);
  }

  /** Bitta buyurtmaning foydasi: tushum − bog'langan xarajatlar */
  async orderProfit(user: AuthUser, number: number) {
    need(user, CAN_REPORT);
    const order = await this.prisma.order.findUnique({ where: { number }, select: { id: true, number: true, status: true } });
    if (!order) throw new NotFoundException("Buyurtma topilmadi");
    const [paid, expenses] = await Promise.all([
      this.prisma.payment.aggregate({ where: { orderId: order.id, status: "PAID" }, _sum: { amountTiyin: true } }),
      this.prisma.financeEntry.groupBy({ by: ["category"], where: { orderId: order.id, kind: "EXPENSE", status: "CONFIRMED" }, _sum: { amountTiyin: true } }),
    ]);
    const revenue = tiyin(paid._sum.amountTiyin ?? 0n);
    const exp = expenses.map((e) => ({ category: e.category, amountTiyin: tiyin(e._sum.amountTiyin ?? 0n) }));
    const totalExp = exp.reduce((s, e) => s + e.amountTiyin, 0);
    return { number: order.number, status: order.status, revenueTiyin: revenue, expenses: exp, expenseTiyin: totalExp, profitTiyin: revenue - totalExp };
  }

  async dailyReport(user: AuthUser) {
    need(user, CAN_REPORT);
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 3600_000);
    const [s, debts, pendingCount] = await Promise.all([this.summary(user, { from: start, to: end }), this.debts(user), this.prisma.financeEntry.count({ where: { status: "PENDING_APPROVAL" } })]);
    return { ...s, debtTotalTiyin: debts.reduce((x, d) => x + d.dueTiyin, 0), debtors: debts.slice(0, 5), pendingApprovals: pendingCount };
  }

  private present(e: { id: string; kind: string; category: string; method: string; amountTiyin: bigint; note: string; status: string; occurredAt: Date; orderId: string | null }) {
    return { id: e.id, kind: e.kind, category: e.category, method: e.method, amountTiyin: tiyin(e.amountTiyin), note: e.note, status: e.status, occurredAt: e.occurredAt, orderId: e.orderId };
  }
}

function routes(prefix: string) {
  @Controller(prefix)
  class C {
    constructor(readonly svc: FinanceService) {}
    @Post("entries") create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(EntryDto)) dto: z.infer<typeof EntryDto>) { return this.svc.create(u, dto); }
    @Post("entries/:id/approve") approve(@CurrentUser() u: AuthUser, @Param("id", new ZodPipe(cuid)) id: string) { return this.svc.decide(u, id, true); }
    @Post("entries/:id/reject") reject(@CurrentUser() u: AuthUser, @Param("id", new ZodPipe(cuid)) id: string) { return this.svc.decide(u, id, false); }
    @Post("entries/:id/void") void(@CurrentUser() u: AuthUser, @Param("id", new ZodPipe(cuid)) id: string, @Body(new ZodPipe(VoidDto)) dto: z.infer<typeof VoidDto>) { return this.svc.void(u, id, dto.reason); }
    @Get("pending") pending(@CurrentUser() u: AuthUser) { return this.svc.pending(u); }
    @Get("summary") summary(@CurrentUser() u: AuthUser, @Query(new ZodPipe(RangeQuery)) q: z.infer<typeof RangeQuery>) { return this.svc.summary(u, q); }
    @Get("debts") debts(@CurrentUser() u: AuthUser) { return this.svc.debts(u); }
    @Get("orders/:number/profit") profit(@CurrentUser() u: AuthUser, @Param("number", new ZodPipe(z.coerce.number().int().min(1).max(999_999_999))) n: number) { return this.svc.orderProfit(u, n); }
    @Get("daily-report") daily(@CurrentUser() u: AuthUser) { return this.svc.dailyReport(u); }
  }
  return C;
}

/** CRM uchun (JWT) */
export const FinanceController = routes("finance");

/** Telegram bot uchun (ichki token + Telegram ID). Rol tekshiruvi servisda — ikkala kirish uchun bir xil. */
const InternalBase = routes("internal/finance");
@Public()
@SkipThrottle()
@UseGuards(InternalServiceGuard)
export class InternalFinanceController extends InternalBase {}

/** Har kuni 08:30 (Toshkent) rahbar va buxgalterga Telegram'da kunlik hisobot */
@Injectable()
export class DailyReportJob {
  private readonly log = new Logger("DailyReport");
  constructor(private readonly prisma: PrismaService, private readonly svc: FinanceService, private readonly notify: NotificationsService) {}

  @Cron("30 8 * * *", { timeZone: "Asia/Tashkent" })
  async run() {
    const recipients = await this.prisma.user.findMany({ where: { role: { in: ["OWNER", "ACCOUNTANT"] }, isActive: true, telegramId: { not: null } }, select: { id: true, role: true, phone: true } });
    for (const r of recipients) {
      try {
        const d = await this.svc.dailyReport({ id: r.id, role: r.role, phone: r.phone });
        const text = [
          "Kunlik hisobot (24 soat)",
          `Kirim: ${formatSom(d.incomeTiyin)}`,
          `Chiqim: ${formatSom(d.expenseTiyin)}`,
          `Sof: ${formatSom(d.netTiyin)}`,
          `Mijozlar qarzi: ${formatSom(d.debtTotalTiyin)}`,
          d.pendingApprovals ? `Tasdiq kutmoqda: ${d.pendingApprovals} ta (/tasdiq)` : "",
        ].filter(Boolean).join("\n");
        await this.notify.toUser(r.id, "daily_report", { text }, ["TELEGRAM"]);
      } catch (e) {
        this.log.error(e);
      }
    }
  }
}

@Module({ controllers: [FinanceController, InternalFinanceController], providers: [FinanceService, DailyReportJob] })
export class FinanceModule {}
