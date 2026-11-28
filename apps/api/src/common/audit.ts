import { CallHandler, ExecutionContext, Global, Injectable, Logger, Module, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthedRequest } from "./http";

/**
 * Har bir o'zgartiruvchi so'rov (POST/PUT/PATCH/DELETE) audit jurnaliga yoziladi:
 * kim, qachon, qaysi marshrut, qaysi IP. So'rov tanasi (parol, OTP, karta) YOZILMAYDI.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly log = new Logger("Audit");
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next.handle();
    const route = (req.route?.path as string | undefined) ?? req.path;
    return next.handle().pipe(
      tap({
        next: () => void this.write(req, route, "ok"),
        error: (e: { status?: number }) => void this.write(req, route, `error:${e?.status ?? 500}`),
      }),
    );
  }

  private async write(req: AuthedRequest, route: string, result: string) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: req.user?.id ?? null,
          action: `${req.method} ${route}`,
          entity: route.split("/")[1] ?? "unknown",
          entityId: typeof req.params?.id === "string" ? req.params.id.slice(0, 64) : null,
          ip: req.ip ?? null,
          userAgent: (req.headers["user-agent"] ?? "").slice(0, 200),
          meta: { result },
        },
      });
    } catch (e) {
      this.log.error(e, "Audit yozilmadi");
    }
  }
}

/** Xizmat ichidan aniq audit yozuvi (masalan, pul tasdiqlanganda) */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  record(actorId: string | null, action: string, entity: string, entityId: string | null, meta?: Record<string, unknown>) {
    return this.prisma.auditLog.create({ data: { actorId, action, entity, entityId, meta: (meta ?? {}) as object } });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
