import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, randomUUID } from "node:crypto";
import { OTP_POLICY, generateOtp, hashOtp, normalizeUzPhone, sha256Hex, verifyOtpHash } from "@ip/core";
import type { User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ENV, type Env } from "../config/env";
import { SmsService } from "./sms.service";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  user: Pick<User, "id" | "name" | "phone" | "role">;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sms: SmsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * OTP yuborish. Javob har doim bir xil — raqam bazada bormi-yo'qmi oshkor qilinmaydi.
   * Cheklovlar: raqamga 60 soniyada 1 ta, soatiga 5 ta; IP dan soatiga 20 ta.
   */
  async requestOtp(rawPhone: string, ip: string): Promise<{ sent: true; resendAfterSeconds: number }> {
    const phone = normalizeUzPhone(rawPhone);
    if (!phone) throw new BadRequestException("Telefon raqam noto'g'ri");
    const hourAgo = new Date(Date.now() - 3600_000);

    const [byPhone, byIp, last] = await Promise.all([
      this.prisma.otpChallenge.count({ where: { phone, createdAt: { gte: hourAgo } } }),
      this.prisma.otpChallenge.count({ where: { ip, createdAt: { gte: hourAgo } } }),
      this.prisma.otpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    if (last && Date.now() - last.createdAt.getTime() < OTP_POLICY.resendCooldownSeconds * 1000) {
      throw new HttpException("Kodni qayta so'rashdan oldin biroz kuting", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (byPhone >= OTP_POLICY.maxSendsPerPhonePerHour || byIp >= OTP_POLICY.maxSendsPerIpPerHour) {
      throw new HttpException("Juda ko'p urinish. Keyinroq qayta urinib ko'ring", HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = generateOtp();
    await this.prisma.$transaction([
      // Oldingi kodlar bekor qilinadi — bir vaqtda faqat bitta kod amal qiladi
      this.prisma.otpChallenge.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } }),
      this.prisma.otpChallenge.create({
        data: {
          phone,
          ip,
          codeHash: hashOtp(phone, code, this.env.OTP_PEPPER),
          expiresAt: new Date(Date.now() + OTP_POLICY.ttlSeconds * 1000),
        },
      }),
    ]);
    await this.sms.send(phone, `Tasdiqlash kodi: ${code}. Kodni hech kimga bermang.`);
    return { sent: true, resendAfterSeconds: OTP_POLICY.resendCooldownSeconds };
  }

  /**
   * Kodni tekshirish. To'g'ri kod = raqam egasi tasdiqlandi.
   * Yangi foydalanuvchi bo'lsa va ism berilmagan bo'lsa — kod sarflanmaydi, 422 needsName qaytadi.
   */
  async verifyOtp(rawPhone: string, code: string, name: string | undefined, meta: { ip: string; userAgent: string }): Promise<IssuedTokens> {
    const phone = normalizeUzPhone(rawPhone);
    if (!phone) throw new BadRequestException("Telefon raqam noto'g'ri");

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) throw new UnauthorizedException("Kod noto'g'ri yoki muddati o'tgan");

    // Urinishlar sonini atomik oshiramiz (parallel so'rovlar bilan cheklovni aylanib o'tib bo'lmaydi)
    const updated = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, attempts: { lt: OTP_POLICY.maxVerifyAttempts }, consumedAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (updated.count === 0) {
      await this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      throw new HttpException("Urinishlar soni tugadi. Yangi kod so'rang", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!verifyOtpHash(phone, code, challenge.codeHash, this.env.OTP_PEPPER)) {
      throw new UnauthorizedException("Kod noto'g'ri yoki muddati o'tgan");
    }

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      const cleanName = name?.trim();
      if (!cleanName) throw new UnprocessableEntityException({ message: "Ismingizni kiriting", needsName: true });
      user = await this.prisma.user.create({ data: { phone, name: cleanName, role: "CLIENT" } });
    }
    if (!user.isActive) throw new UnauthorizedException("Hisob bloklangan");

    const consumed = await this.prisma.otpChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count === 0) throw new UnauthorizedException("Kod allaqachon ishlatilgan");

    return this.issueTokens(user, randomUUID(), meta);
  }

  /** Refresh token rotatsiyasi. Eski token qayta ishlatilsa — butun "oila" bekor qilinadi (o'g'irlik belgisi). */
  async refresh(refreshToken: string, meta: { ip: string; userAgent: string }): Promise<IssuedTokens> {
    if (typeof refreshToken !== "string" || refreshToken.length < 40 || refreshToken.length > 200) throw new UnauthorizedException();
    const hash = sha256Hex(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: true } });
    if (!row) throw new UnauthorizedException("Sessiya topilmadi");
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException("Sessiya bekor qilingan. Qayta kiring");
    }
    if (row.expiresAt < new Date() || !row.user.isActive) throw new UnauthorizedException("Sessiya muddati tugagan");

    const revoked = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (revoked.count === 0) throw new UnauthorizedException();
    const tokens = await this.issueTokens(row.user, row.familyId, meta);
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { replacedBy: sha256Hex(tokens.refreshToken) } });
    return tokens;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256Hex(refreshToken) } });
    if (row) await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async issueTokens(user: User, familyId: string, meta: { ip: string; userAgent: string }): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, phone: user.phone, typ: "access" },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: ACCESS_TTL_SECONDS, algorithm: "HS256" },
    );
    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
        ip: meta.ip,
        userAgent: meta.userAgent.slice(0, 200),
      },
    });
    return {
      accessToken,
      refreshToken,
      accessExpiresIn: ACCESS_TTL_SECONDS,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
    };
  }
}
