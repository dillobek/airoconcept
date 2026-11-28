import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { computeEstimate, validateScene, wallAreaM2, floorAreaM2, type EstimateLineInput, type RoomScene } from "@ip/core";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser, CurrentUser, ZodPipe, isStaff } from "../common/http";
import { AutomationService } from "../automation/automation.service";

const cuid = z.string().cuid();
const RoomDto = z.object({
  name: z.string().trim().min(1).max(60),
  lengthM: z.number().min(0.5).max(100),
  widthM: z.number().min(0.5).max(100),
  heightM: z.number().min(1.8).max(10),
});
const CreateProjectDto = z.object({
  homeTitle: z.string().trim().min(1).max(80),
  type: z.enum(["SELF", "DESIGNER"]).default("SELF"),
  rooms: z.array(RoomDto).min(1).max(30),
});

const STAFF_VIEW = new Set(["OWNER", "MANAGER", "DESIGNER", "MEASURER"]);

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService, private readonly automation: AutomationService) {}

  /** IDOR himoyasi: mijoz faqat o'z loyihasini, xodim faqat ruxsat etilgan rol bilan ko'radi */
  async assertAccess(projectId: string, user: AuthUser, write = false) {
    const p = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, clientId: true, designerId: true } });
    if (!p) throw new NotFoundException("Loyiha topilmadi");
    if (user.role === "CLIENT") {
      if (p.clientId !== user.id) throw new NotFoundException("Loyiha topilmadi");
      return p;
    }
    if (!STAFF_VIEW.has(user.role)) throw new ForbiddenException();
    if (write && user.role === "DESIGNER" && p.designerId !== user.id) throw new ForbiddenException("Bu loyiha sizga biriktirilmagan");
    return p;
  }

  async create(user: AuthUser, dto: z.infer<typeof CreateProjectDto>) {
    const empty = (r: z.infer<typeof RoomDto>): RoomScene => ({ version: 1, room: { lengthM: r.lengthM, widthM: r.widthM, heightM: r.heightM }, items: [] });
    const home = await this.prisma.home.create({
      data: {
        ownerId: user.id,
        title: dto.homeTitle,
        rooms: { create: dto.rooms.map((r) => ({ name: r.name, lengthM: r.lengthM, widthM: r.widthM, heightM: r.heightM, scene: empty(r) as object })) },
      },
      include: { rooms: true },
    });
    const project = await this.prisma.project.create({
      data: { clientId: user.id, homeId: home.id, type: dto.type, designStage: dto.type === "DESIGNER" ? "BRIEF" : null },
    });
    return { projectId: project.id, number: project.number, homeId: home.id, rooms: home.rooms.map((r) => ({ id: r.id, name: r.name })) };
  }

  mine(user: AuthUser) {
    return this.prisma.project.findMany({
      where: { clientId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, type: true, designStage: true, createdAt: true, home: { select: { title: true } }, orders: { select: { id: true, number: true, status: true } } },
    });
  }

  async get(id: string, user: AuthUser) {
    await this.assertAccess(id, user);
    return this.prisma.project.findUniqueOrThrow({
      where: { id },
      select: {
        id: true, number: true, type: true, designStage: true, createdAt: true,
        client: { select: { id: true, name: true, ...(isStaff(user.role) ? { phone: true } : {}) } },
        home: { select: { id: true, title: true, rooms: { select: { id: true, name: true, lengthM: true, widthM: true, heightM: true, scene: true } } } },
        orders: { select: { id: true, number: true, status: true } },
      },
    });
  }

  async saveScene(projectId: string, roomId: string, body: unknown, user: AuthUser) {
    await this.assertAccess(projectId, user, true);
    const room = await this.prisma.room.findFirst({ where: { id: roomId, home: { projects: { some: { id: projectId } } } } });
    if (!room) throw new NotFoundException("Xona topilmadi");
    const v = validateScene(body);
    if (!v.ok) throw new BadRequestException({ message: "Sahna noto'g'ri", errors: v.errors });
    // Sahnadagi har bir mahsulot katalogda mavjud va sotuvda ekanini tekshiramiz
    const productIds = [...new Set(v.scene.items.map((i) => i.productId))];
    if (productIds.length) {
      const found = await this.prisma.product.count({ where: { id: { in: productIds }, isPublished: true } });
      if (found !== productIds.length) throw new BadRequestException("Sahnada katalogda yo'q mahsulot bor");
    }
    await this.prisma.$transaction([
      this.prisma.room.update({
        where: { id: roomId },
        data: { scene: v.scene as object, lengthM: v.scene.room.lengthM, widthM: v.scene.room.widthM, heightM: v.scene.room.heightM },
      }),
      this.prisma.project.update({ where: { id: projectId }, data: { lastActivityAt: new Date(), idleNotifiedAt: null } }),
    ]);
    return { saved: true };
  }

  /** Narx faqat serverda, bazadagi narxlardan hisoblanadi */
  async buildEstimateLines(projectId: string): Promise<EstimateLineInput[]> {
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { home: { include: { rooms: true } } } });
    const scenes = project.home.rooms.map((r) => r.scene as unknown as RoomScene);
    const productIds = [...new Set(scenes.flatMap((s) => s.items.map((i) => i.productId)))];
    const materialIds = [...new Set(scenes.flatMap((s) => [s.wallColorId, s.floorMaterialId]).filter((x): x is string => !!x))];
    const [products, materials] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: productIds } }, include: { variants: true } }),
      this.prisma.material.findMany({ where: { id: { in: materialIds } } }),
    ]);
    const pMap = new Map(products.map((p) => [p.id, p]));
    const mMap = new Map(materials.map((m) => [m.id, m]));

    const grouped = new Map<string, EstimateLineInput>();
    for (const s of scenes) {
      for (const it of s.items) {
        const p = pMap.get(it.productId);
        if (!p) continue;
        const variant = it.variantId ? p.variants.find((v) => v.id === it.variantId) : undefined;
        const price = Number(p.priceTiyin + (variant?.priceDeltaTiyin ?? 0n));
        const key = `${p.id}:${variant?.id ?? ""}`;
        const prev = grouped.get(key);
        if (prev) prev.quantityMilli += 1000;
        else grouped.set(key, { kind: "PRODUCT", title: variant ? `${p.name} (${variant.name})` : p.name, unitPriceTiyin: price, quantityMilli: 1000 });
      }
      const dims = { lengthM: s.room.lengthM, widthM: s.room.widthM, heightM: s.room.heightM };
      const wall = s.wallColorId ? mMap.get(s.wallColorId) : undefined;
      if (wall) grouped.set(`w:${wall.id}:${grouped.size}`, { kind: "MATERIAL", title: `Devor bo'yog'i: ${wall.name}`, unitPriceTiyin: Number(wall.pricePerM2Tiyin), quantityMilli: Math.round(wallAreaM2(dims) * 1000) });
      const floor = s.floorMaterialId ? mMap.get(s.floorMaterialId) : undefined;
      if (floor) grouped.set(`f:${floor.id}:${grouped.size}`, { kind: "MATERIAL", title: `Pol: ${floor.name}`, unitPriceTiyin: Number(floor.pricePerM2Tiyin), quantityMilli: Math.round(floorAreaM2(dims) * 1000) });
    }
    return [...grouped.values()];
  }

  async estimatePreview(projectId: string, user: AuthUser) {
    await this.assertAccess(projectId, user);
    const lines = await this.buildEstimateLines(projectId);
    if (lines.length === 0) return { lines: [], subtotalTiyin: 0, discountTiyin: 0, totalTiyin: 0, depositTiyin: 0 };
    return computeEstimate(lines);
  }

  /** Cron uchun: faol bo'lmagan loyihalar haqida hodisa */
  async emitIdleProjects() {
    const cutoff = new Date(Date.now() - 48 * 3600_000);
    const idle = await this.prisma.project.findMany({
      where: { lastActivityAt: { lt: cutoff }, idleNotifiedAt: null, orders: { none: {} } },
      select: { id: true, clientId: true, lastActivityAt: true },
      take: 200,
    });
    for (const p of idle) {
      await this.automation.emit({
        type: "PROJECT_IDLE",
        data: { projectId: p.id, clientId: p.clientId, idleHours: Math.floor((Date.now() - p.lastActivityAt.getTime()) / 3600_000), hasOrder: false },
        occurredAt: new Date(),
      });
      await this.prisma.project.update({ where: { id: p.id }, data: { idleNotifiedAt: new Date() } });
    }
  }
}

@Controller("projects")
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateProjectDto)) dto: z.infer<typeof CreateProjectDto>) {
    return this.svc.create(user, dto);
  }

  @Get("mine")
  mine(@CurrentUser() user: AuthUser) {
    return this.svc.mine(user);
  }

  @Get(":id")
  get(@Param("id", new ZodPipe(cuid)) id: string, @CurrentUser() user: AuthUser) {
    return this.svc.get(id, user);
  }

  @Put(":id/rooms/:roomId/scene")
  saveScene(@Param("id", new ZodPipe(cuid)) id: string, @Param("roomId", new ZodPipe(cuid)) roomId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.saveScene(id, roomId, body, user);
  }

  @Get(":id/estimate-preview")
  preview(@Param("id", new ZodPipe(cuid)) id: string, @CurrentUser() user: AuthUser) {
    return this.svc.estimatePreview(id, user);
  }
}

@Module({ controllers: [ProjectsController], providers: [ProjectsService], exports: [ProjectsService] })
export class ProjectsModule {}
