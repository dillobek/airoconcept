import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { timingSafeEqual } from "node:crypto";
import type { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ENV, type Env } from "../config/env";
import { AuthedRequest, PUBLIC_KEY, ROLES_KEY } from "./http";

export const ACCESS_COOKIE = "ip_at";
export const REFRESH_COOKIE = "ip_rt";
export const CSRF_COOKIE = "ip_csrf";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

interface AccessPayload {
  sub: string;
  role: Role;
  phone: string;
  typ: "access";
}

/**
 * Global guard: har bir so'rov uchun JWT tekshiriladi (@Public() bundan mustasno).
 * Token: Authorization: Bearer (mobil ilova) yoki httpOnly cookie (sayt/CRM).
 * Cookie bilan kelgan o'zgartiruvchi so'rovlarda CSRF double-submit tekshiriladi.
 * Foydalanuvchi bloklangan bo'lsa (isActive=false) token amal qilish muddatidan qat'i nazar rad etiladi.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (req.user) return true; // ichki servis guard'i allaqachon o'rnatgan

    let token: string | undefined;
    let viaCookie = false;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) token = header.slice(7);
    else if (req.cookies?.[ACCESS_COOKIE]) {
      token = req.cookies[ACCESS_COOKIE];
      viaCookie = true;
    }
    if (!token) throw new UnauthorizedException("Kirish talab qilinadi");

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
        algorithms: ["HS256"],
      });
    } catch {
      throw new UnauthorizedException("Sessiya muddati tugagan");
    }
    if (payload.typ !== "access") throw new UnauthorizedException("Token turi noto'g'ri");

    if (viaCookie && MUTATING.has(req.method)) {
      const c = req.cookies?.[CSRF_COOKIE];
      const h = req.headers["x-csrf-token"];
      if (typeof c !== "string" || typeof h !== "string" || !safeEqual(c, h)) throw new ForbiddenException("CSRF tekshiruvi o'tmadi");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, phone: true, isActive: true } });
    if (!user || !user.isActive) throw new UnauthorizedException("Hisob faol emas");
    // Rol tokendan emas, bazadan olinadi — rol o'zgarsa darhol kuchga kiradi
    req.user = { id: user.id, role: user.role, phone: user.phone };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user || !roles.includes(req.user.role)) throw new ForbiddenException("Bu amal uchun huquqingiz yo'q");
    return true;
  }
}

/**
 * Ichki servislar (Telegram bot) uchun: X-Internal-Token + X-Telegram-User-Id.
 * Bot faqat Telegram ID ni uzatadi; API shu ID ga bog'langan faol xodimni topadi.
 * Bu marshrutlar reverse proxy'da tashqariga OCHILMAYDI (faqat ichki tarmoq).
 */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, @Inject(ENV) private readonly env: Env) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.headers["x-internal-token"];
    if (typeof token !== "string" || !safeEqual(token, this.env.INTERNAL_SERVICE_TOKEN)) throw new UnauthorizedException();
    const tg = req.headers["x-telegram-user-id"];
    if (tg === undefined) return true; // faqat servis darajasidagi chaqiruv (masalan, kontaktni bog'lash)
    if (typeof tg !== "string" || !/^\d{1,20}$/.test(tg)) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { telegramId: BigInt(tg) }, select: { id: true, role: true, phone: true, isActive: true } });
    if (!user || !user.isActive || user.role === "CLIENT") throw new ForbiddenException("Telegram akkaunt xodimga bog'lanmagan");
    req.user = { id: user.id, role: user.role, phone: user.phone };
    return true;
  }
}
