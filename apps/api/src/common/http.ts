import {
  ArgumentMetadata,
  ArgumentsHost,
  BadRequestException,
  Catch,
  createParamDecorator,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  PipeTransform,
  SetMetadata,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { ZodSchema } from "zod";
import type { Role } from "@prisma/client";

/** JWT dan olingan joriy foydalanuvchi */
export interface AuthUser {
  id: string;
  role: Role;
  phone: string | null;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new HttpException("Kirish talab qilinadi", HttpStatus.UNAUTHORIZED);
  return req.user;
});

export const ROLES_KEY = "roles";
/** Endpointga faqat shu rollar kira oladi */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const PUBLIC_KEY = "isPublic";
/** JWT talab qilinmaydi (masalan, katalog, OTP, to'lov webhooklari) */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const STAFF_ROLES: Role[] = [
  "OWNER", "MANAGER", "DESIGNER", "MEASURER", "SUPPLY", "PRODUCTION", "WAREHOUSE", "DRIVER", "INSTALLER", "FOREMAN", "ACCOUNTANT",
];
export const isStaff = (role: Role) => role !== "CLIENT";

/** Zod bilan kirish ma'lumotlarini tekshirish. Ortiqcha maydonlar tashlanadi (strip). */
export class ZodPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}
  transform(value: unknown, _meta: ArgumentMetadata) {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        message: "Ma'lumot noto'g'ri",
        errors: r.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return r.data;
  }
}

/** BigInt (tiyin) ni JSON ga xavfsiz chiqarish: number (MAX_SAFE_INTEGER dan katta bo'lmaydi) */
export function tiyin(v: bigint): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error("Summa xavfsiz chegaradan katta");
  return n;
}

/**
 * Barcha xatolar bir xil ko'rinishda. 500 xatolarda ichki tafsilot (stack, SQL) mijozga ketmaydi —
 * faqat logga yoziladi, javobda esa so'rov ID si.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger("Error");
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(typeof body === "string" ? { message: body } : body);
      return;
    }
    // Prisma unique xatosi -> 409
    const code = (exception as { code?: string })?.code;
    if (code === "P2002") {
      res.status(HttpStatus.CONFLICT).json({ message: "Bunday yozuv allaqachon mavjud" });
      return;
    }
    if (code === "P2025") {
      res.status(HttpStatus.NOT_FOUND).json({ message: "Topilmadi" });
      return;
    }
    this.log.error({ err: exception, reqId: req.id, path: req.path }, "Kutilmagan xato");
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Ichki xato", requestId: req.id ?? null });
  }
}
