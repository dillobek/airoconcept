import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Prisma, type OrderStatus } from "@prisma/client";
import { canTransition, computeEstimate, ORDER_STATUSES, type EstimateLineInput } from "@ip/core";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser, CurrentUser, Roles, ZodPipe, tiyin } from "../common/http";
import { AutomationService } from "../automation/automation.service";
import { ProjectsModule, ProjectsService } from "../projects/projects.module";

const cuid = z.string().cuid();
const CreateOrderDto = z.object({
  projectId: cuid,
  address: z.string().trim().min(5).max(300),
  region: z.string().trim().max(60).optional(),
  measurementAt: z.coerce.date().optional(),
});
const TransitionDto = z.object({ to: z.enum(ORDER_STATUSES), note: z.string().trim().max(500).optional() });
const ListQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
const LineDto = z.object({
  kind: z.enum(["PRODUCT", "MATERIAL", "SERVICE"]),
  title: z.string().trim().min(1).max(200),
  unitPriceTiyin: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  quantityMilli: z.number().int().min(1).max(100_000_000),
  discountBp: z.number().int().min(0).max(3000).optional(),
});
const EstimateDto = z.object({
  /** Bo'sh bo'lsa — 3D loyihadan avtomatik */
  lines: z.array(LineDto).max(500).optional(),
  extraLines: z.array(LineDto).max(100).default([]),
  orderDiscountBp: z.number().int().min(0).max(3000).default(0),
  depositBp: z.number().int().min(0).max(10000).default(5000),
});
const AssignDto = z.object({
  managerId: cuid.optional(),
  measurerId: cuid.optional(),
  measurementAt: z.coerce.date().optional(),
});

const FULL_ACCESS = new Set(["OWNER", "MANAGER", "ACCOUNTANT"]);

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationService,
    private readonly projects: ProjectsService,
  ) {}

  /** Buyurtmani ko'rish huquqi: mijoz — o'ziniki; o'lchovchi — o'ziga biriktirilgan; boshqa xodim — vazifasi bor */
  async load(id: string, user: AuthUser) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Buyurtma topilmadi");
    if (user.role === "CLIENT" && order.clientId === user.id) return order;
    if (FULL_ACCESS.has(user.role)) return order;
    if (user.role === "MEASURER" && order.measurerId === user.id) return order;
    if (user.role !== "CLIENT") {
      const hasTask = await this.prisma.task.count({ where: { orderId: id, assigneeId: user.id } });
      if (hasTask) return order;
    }
    throw new NotFoundException("Buyurtma topilmadi");
  }

  async financials(orderId: string) {
    const [approved, paid] = await Promise.all([
      this.prisma.estimate.findFirst({ where: { orderId, status: "APPROVED" }, orderBy: { version: "desc" } }),
      this.prisma.payment.aggregate({ where: { orderId, status: "PAID" }, _sum: { amountTiyin: true } }),
    ]);
    const paidT = paid._sum.amountTiyin ?? 0n;
    const total = approved?.totalTiyin ?? 0n;
    const deposit = approved?.depositTiyin ?? 0n;
    return {
      hasApprovedEstimate: !!approved,
      totalTiyin: total,
      depositTiyin: deposit,
      paidTiyin: paidT,
      balanceDueTiyin: total > paidT ? total - paidT : 0n,
      depositPaid: !!approved && paidT >= deposit,
    };
  }

  async create(user: AuthUser, dto: z.infer<typeof CreateOrderDto>) {
    const project = await this.projects.assertAccess(dto.projectId, user);
    if (user.role === "CLIENT" && project.clientId !== user.id) throw new NotFoundException();
    const active = await this.prisma.order.count({ where: { projectId: dto.projectId, status: { notIn: ["CANCELLED", "COMPLETED"] } } });
    if (active) throw new ConflictException("Bu loyiha bo'yicha faol buyurtma bor");
    const lines = await this.projects.buildEstimateLines(dto.projectId);
    if (lines.length === 0) throw new BadRequestException("Loyihada mahsulot yo'q");

    const order = await this.prisma.order.create({
      data: { projectId: dto.projectId, clientId: project.clientId, address: dto.address, region: dto.region ?? null, status: "PLACED", measurementAt: dto.measurementAt ?? null },
    });
    await this.prisma.orderStatusHistory.create({ data: { orderId: order.id, from: "LEAD", to: "PLACED", actorId: user.id } });
    await this.automation.emit({ type: "ORDER_STATUS_CHANGED", data: { orderId: order.id, clientId: order.clientId, from: "LEAD", to: "PLACED" }, occurredAt: new Date() });
    if (dto.measurementAt) await this.transition(order.id, user, "MEASUREMENT_SCHEDULED");
    return { id: order.id, number: order.number };
  }

  async list(user: AuthUser, q: z.infer<typeof ListQuery>) {
    let where: Prisma.OrderWhereInput = q.status ? { status: q.status } : {};
    if (user.role === "CLIENT") where = { ...where, clientId: user.id };
    else if (user.role === "MEASURER") where = { ...where, measurerId: user.id };
    else if (!FULL_ACCESS.has(user.role)) where = { ...where, tasks: { some: { assigneeId: user.id } } };
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true, number: true, status: true, address: true, measurementAt: true, createdAt: true, updatedAt: true,
          client: { select: { name: true, ...(user.role === "CLIENT" ? {} : { phone: true }) } },
          manager: { select: { id: true, name: true } },
          measurer: { select: { id: true, name: true } },
        },
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items: rows };
  }

  async get(id: string, user: AuthUser) {
    await this.load(id, user);
    const [order, fin] = await Promise.all([
      this.prisma.order.findUniqueOrThrow({
        where: { id },
        include: {
          client: { select: { id: true, name: true, ...(user.role === "CLIENT" ? {} : { phone: true }) } },
          manager: { select: { id: true, name: true } },
          measurer: { select: { id: true, name: true } },
          history: { orderBy: { createdAt: "asc" }, select: { from: true, to: true, note: true, createdAt: true } },
          estimates: { orderBy: { version: "desc" } },
          payments: { where: { status: "PAID" }, select: { provider: true, amountTiyin: true, performedAt: true, createdAt: true } },
        },
      }),
      this.financials(id),
    ]);
    return {
      ...order,
      estimates: order.estimates.map((e) => ({ ...e, subtotalTiyin: tiyin(e.subtotalTiyin), discountTiyin: tiyin(e.discountTiyin), totalTiyin: tiyin(e.totalTiyin), depositTiyin: tiyin(e.depositTiyin) })),
      payments: order.payments.map((p) => ({ ...p, amountTiyin: tiyin(p.amountTiyin) })),
      finance: {
        totalTiyin: tiyin(fin.totalTiyin), depositTiyin: tiyin(fin.depositTiyin), paidTiyin: tiyin(fin.paidTiyin), balanceDueTiyin: tiyin(fin.balanceDueTiyin), depositPaid: fin.depositPaid,
      },
    };
  }

  async transition(id: string, user: AuthUser, to: OrderStatus, note?: string) {
    const order = await this.load(id, user);
    const fin = await this.financials(id);
    const r = canTransition(order.status, to, user.role, {
      depositPaid: fin.depositPaid,
      balanceDueTiyin: Number(fin.balanceDueTiyin),
      hasApprovedEstimate: fin.hasApprovedEstimate,
      acceptanceSigned: !!order.acceptanceSignedAt,
    });
    if (!r.ok) throw new ForbiddenException(r.reason);
    // Optimistik qulf: holat shu orada boshqa birov tomonidan o'zgartirilgan bo'lsa — rad etiladi
    const updated = await this.prisma.order.updateMany({
      where: { id, status: order.status },
      data: { status: to, ...(to === "CANCELLED" ? { cancelledReason: note ?? null } : {}) },
    });
    if (updated.count === 0) throw new ConflictException("Buyurtma holati o'zgargan, sahifani yangilang");
    await this.prisma.orderStatusHistory.create({ data: { orderId: id, from: order.status, to, actorId: user.id, note: note ?? null } });
    if (to === "CANCELLED") await this.prisma.task.updateMany({ where: { orderId: id, status: "OPEN" }, data: { status: "CANCELLED" } });
    await this.automation.emit({ type: "ORDER_STATUS_CHANGED", data: { orderId: id, clientId: order.clientId, from: order.status, to }, occurredAt: new Date() });
    return { id, status: to };
  }

  async createEstimate(id: string, user: AuthUser, dto: z.infer<typeof EstimateDto>) {
    const order = await this.load(id, user);
    if (["CONTRACT_SIGNED", "DEPOSIT_PAID", "IN_PRODUCTION", "READY", "DELIVERY_SCHEDULED", "DELIVERED", "INSTALLED", "COMPLETED", "CANCELLED"].includes(order.status) && user.role !== "OWNER")
      throw new ForbiddenException("Shartnomadan keyin smetani faqat rahbar o'zgartiradi");
    const base: EstimateLineInput[] = dto.lines ?? (await this.projects.buildEstimateLines(order.projectId));
    const est = computeEstimate([...base, ...dto.extraLines], { orderDiscountBp: dto.orderDiscountBp, depositBp: dto.depositBp });
    for (let attempt = 0; attempt < 3; attempt++) {
      const last = await this.prisma.estimate.findFirst({ where: { orderId: id }, orderBy: { version: "desc" }, select: { version: true } });
      try {
        const row = await this.prisma.estimate.create({
          data: {
            orderId: id,
            version: (last?.version ?? 0) + 1,
            lines: est.lines as unknown as Prisma.InputJsonValue,
            subtotalTiyin: BigInt(est.subtotalTiyin),
            discountTiyin: BigInt(est.discountTiyin),
            totalTiyin: BigInt(est.totalTiyin),
            depositTiyin: BigInt(est.depositTiyin),
            createdById: user.id,
          },
        });
        return { version: row.version, ...est };
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e; // versiya poygasi — qayta urinamiz
      }
    }
    throw new ConflictException("Smeta yaratilmadi, qayta urinib ko'ring");
  }

  async approveEstimate(id: string, version: number, user: AuthUser) {
    const order = await this.load(id, user);
    if (user.role === "CLIENT" && order.clientId !== user.id) throw new NotFoundException();
    if (!["MEASURED", "PLACED", "MEASUREMENT_SCHEDULED"].includes(order.status) && user.role !== "OWNER")
      throw new ForbiddenException("Bu bosqichda smetani tasdiqlab bo'lmaydi");
    const est = await this.prisma.estimate.findUnique({ where: { orderId_version: { orderId: id, version } } });
    if (!est || est.status !== "DRAFT") throw new NotFoundException("Tasdiqlanadigan smeta topilmadi");
    await this.prisma.$transaction([
      this.prisma.estimate.updateMany({ where: { orderId: id, status: "APPROVED" }, data: { status: "SUPERSEDED" } }),
      this.prisma.estimate.update({ where: { id: est.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id } }),
    ]);
    return { approved: version };
  }

  async signAcceptance(id: string, user: AuthUser) {
    const order = await this.load(id, user);
    if (order.clientId !== user.id) throw new ForbiddenException("Aktni faqat mijoz imzolaydi");
    if (order.status !== "INSTALLED") throw new ForbiddenException("Akt faqat o'rnatishdan keyin imzolanadi");
    if (order.acceptanceSignedAt) return { signedAt: order.acceptanceSignedAt };
    const o = await this.prisma.order.update({ where: { id }, data: { acceptanceSignedAt: new Date() } });
    return { signedAt: o.acceptanceSignedAt };
  }

  async assign(id: string, dto: z.infer<typeof AssignDto>) {
    if (dto.managerId) await this.assertRole(dto.managerId, ["MANAGER", "OWNER"]);
    if (dto.measurerId) await this.assertRole(dto.measurerId, ["MEASURER"]);
    return this.prisma.order.update({ where: { id }, data: dto, select: { id: true, managerId: true, measurerId: true, measurementAt: true } });
  }

  private async assertRole(userId: string, roles: string[]) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
    if (!u || !u.isActive || !roles.includes(u.role)) throw new BadRequestException("Xodim noto'g'ri");
  }
}

@Controller("orders")
export class OrdersController {
  constructor(private readonly svc: OrdersService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(CreateOrderDto)) dto: z.infer<typeof CreateOrderDto>) {
    return this.svc.create(u, dto);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.svc.list(u, q);
  }

  @Get(":id")
  get(@Param("id", new ZodPipe(cuid)) id: string, @CurrentUser() u: AuthUser) {
    return this.svc.get(id, u);
  }

  @Post(":id/transition")
  transition(@Param("id", new ZodPipe(cuid)) id: string, @CurrentUser() u: AuthUser, @Body(new ZodPipe(TransitionDto)) dto: z.infer<typeof TransitionDto>) {
    return this.svc.transition(id, u, dto.to, dto.note);
  }

  @Roles("OWNER", "MANAGER", "DESIGNER")
  @Post(":id/estimates")
  estimate(@Param("id", new ZodPipe(cuid)) id: string, @CurrentUser() u: AuthUser, @Body(new ZodPipe(EstimateDto)) dto: z.infer<typeof EstimateDto>) {
    return this.svc.createEstimate(id, u, dto);
  }

  @Roles("CLIENT", "OWNER", "MANAGER")
  @Post(":id/estimates/:version/approve")
  approve(@Param("id", new ZodPipe(cuid)) id: string, @Param("version", new ZodPipe(z.coerce.number().int().min(1).max(10000))) v: number, @CurrentUser() u: AuthUser) {
    return this.svc.approveEstimate(id, v, u);
  }

  @Roles("CLIENT")
  @Post(":id/acceptance")
  accept(@Param("id", new ZodPipe(cuid)) id: string, @CurrentUser() u: AuthUser) {
    return this.svc.signAcceptance(id, u);
  }

  @Roles("OWNER", "MANAGER")
  @Patch(":id/assign")
  assign(@Param("id", new ZodPipe(cuid)) id: string, @Body(new ZodPipe(AssignDto)) dto: z.infer<typeof AssignDto>) {
    return this.svc.assign(id, dto);
  }
}

@Module({ imports: [ProjectsModule], controllers: [OrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}
