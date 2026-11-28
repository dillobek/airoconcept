import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Module, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { normalizeUzPhone, ROLES } from "@ip/core";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser, CurrentUser, Public, Roles, ZodPipe } from "../common/http";
import { InternalServiceGuard } from "../common/guards";
import { SkipThrottle } from "@nestjs/throttler";
import { AuditService } from "../common/audit";

const StaffDto = z.object({
  phone: z.string().min(9).max(32),
  name: z.string().trim().min(2).max(80),
  role: z.enum(ROLES).refine((r) => r !== "CLIENT", "xodim roli kerak"),
  region: z.string().trim().max(60).optional(),
});
const StaffPatch = z.object({
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  region: z.string().trim().max(60).nullable().optional(),
  name: z.string().trim().min(2).max(80).optional(),
});
const LinkDto = z.object({ phone: z.string().min(9).max(32), telegramUserId: z.string().regex(/^\d{1,20}$/) });

@Controller("staff")
@Roles("OWNER")
export class StaffController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  list(@Query("role") role?: string) {
    const r = role && (ROLES as readonly string[]).includes(role) ? (role as (typeof ROLES)[number]) : undefined;
    return this.prisma.user.findMany({
      where: { role: r ?? { not: "CLIENT" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, role: true, region: true, isActive: true, telegramId: false },
    });
  }

  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(StaffDto)) dto: z.infer<typeof StaffDto>) {
    const phone = normalizeUzPhone(dto.phone);
    if (!phone) throw new BadRequestException("Telefon noto'g'ri");
    const user = await this.prisma.user.upsert({
      where: { phone },
      create: { phone, name: dto.name, role: dto.role, region: dto.region ?? null },
      update: { name: dto.name, role: dto.role, region: dto.region ?? null, isActive: true },
      select: { id: true, name: true, phone: true, role: true },
    });
    await this.audit.record(actor.id, "staff.upsert", "user", user.id, { role: dto.role });
    return user;
  }

  @Patch(":id")
  async update(@CurrentUser() actor: AuthUser, @Param("id", new ZodPipe(z.string().cuid())) id: string, @Body(new ZodPipe(StaffPatch)) dto: z.infer<typeof StaffPatch>) {
    if (id === actor.id && (dto.role || dto.isActive === false)) throw new ForbiddenException("O'z rolingizni o'zgartira olmaysiz");
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: { id: true, name: true, role: true, isActive: true, region: true } });
    if (dto.isActive === false || dto.role) {
      // Huquq o'zgarsa yoki bloklansa — barcha sessiyalar bekor
      await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.record(actor.id, "staff.update", "user", id, dto);
    return user;
  }
}

/**
 * Bot uchun ichki marshrut: xodim botga O'Z kontaktini yuboradi (bot buni tekshiradi:
 * contact.user_id === from.id), API telefon bo'yicha xodimni topib Telegram ID ni bog'laydi.
 */
@Controller("internal/telegram")
@Public()
@SkipThrottle()
@UseGuards(InternalServiceGuard)
export class TelegramLinkController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Post("link")
  @HttpCode(200)
  async link(@Body(new ZodPipe(LinkDto)) dto: z.infer<typeof LinkDto>) {
    const phone = normalizeUzPhone(dto.phone);
    if (!phone) return { linked: false };
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || !user.isActive || user.role === "CLIENT") return { linked: false };
    const tg = BigInt(dto.telegramUserId);
    await this.prisma.$transaction([
      this.prisma.user.updateMany({ where: { telegramId: tg, NOT: { id: user.id } }, data: { telegramId: null } }),
      this.prisma.user.update({ where: { id: user.id }, data: { telegramId: tg } }),
    ]);
    await this.audit.record(user.id, "telegram.link", "user", user.id);
    return { linked: true, name: user.name, role: user.role };
  }

  @Get("me")
  me(@CurrentUser() u: AuthUser) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { id: true, name: true, role: true } });
  }
}

@Module({ controllers: [StaffController, TelegramLinkController] })
export class UsersModule {}
