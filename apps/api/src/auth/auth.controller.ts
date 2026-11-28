import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { ENV, type Env } from "../config/env";
import { AuthedRequest, AuthUser, CurrentUser, Public, ZodPipe } from "../common/http";
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from "../common/guards";
import { ACCESS_TTL_SECONDS, AuthService, IssuedTokens, REFRESH_TTL_SECONDS } from "./auth.service";

const RequestOtpDto = z.object({ phone: z.string().min(9).max(32) });
const VerifyOtpDto = z.object({
  phone: z.string().min(9).max(32),
  code: z.string().regex(/^\d{6}$/, "6 xonali kod"),
  name: z.string().trim().min(2).max(80).optional(),
});
const StaffLoginDto = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{3,40}$/, "Username noto'g'ri"),
  password: z.string().min(12).max(128),
});
const RefreshDto = z.object({ refreshToken: z.string().min(40).max(200).optional() });

/** Mobil ilova tokenlarni javob tanasida oladi (X-Client: mobile); sayt va CRM — faqat httpOnly cookie'da. */
function isMobile(req: AuthedRequest) {
  return req.headers["x-client"] === "mobile";
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("otp/request")
  @HttpCode(200)
  request(@Body(new ZodPipe(RequestOtpDto)) dto: z.infer<typeof RequestOtpDto>, @Req() req: AuthedRequest) {
    return this.auth.requestOtp(dto.phone, req.ip ?? "unknown");
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("otp/verify")
  @HttpCode(200)
  async verify(
    @Body(new ZodPipe(VerifyOtpDto)) dto: z.infer<typeof VerifyOtpDto>,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.verifyOtp(dto.phone, dto.code, dto.name, this.meta(req));
    return this.respond(tokens, req, res);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("staff/login")
  @HttpCode(200)
  async staffLogin(
    @Body(new ZodPipe(StaffLoginDto)) dto: z.infer<typeof StaffLoginDto>,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.loginStaff(dto.username, dto.password, this.meta(req));
    return this.respond(tokens, req, res);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Body(new ZodPipe(RefreshDto)) dto: z.infer<typeof RefreshDto>, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    const tokens = await this.auth.refresh(token, this.meta(req));
    return this.respond(tokens, req, res);
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Body(new ZodPipe(RefreshDto)) dto: z.infer<typeof RefreshDto>, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE]);
    for (const c of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) res.clearCookie(c, { path: c === REFRESH_COOKIE ? "/auth" : "/", domain: this.env.COOKIE_DOMAIN });
  }

  @Post("logout-all")
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: AuthUser) {
    await this.auth.logoutAll(user.id);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, name: true, phone: true, role: true, region: true } });
  }

  private meta(req: AuthedRequest) {
    return { ip: req.ip ?? "unknown", userAgent: String(req.headers["user-agent"] ?? "") };
  }

  private respond(tokens: IssuedTokens, req: AuthedRequest, res: Response) {
    if (isMobile(req)) return tokens;
    const secure = this.env.NODE_ENV === "production";
    const domain = this.env.COOKIE_DOMAIN;
    res.cookie(ACCESS_COOKIE, tokens.accessToken, { httpOnly: true, secure, sameSite: "strict", path: "/", domain, maxAge: ACCESS_TTL_SECONDS * 1000 });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, secure, sameSite: "strict", path: "/auth", domain, maxAge: REFRESH_TTL_SECONDS * 1000 });
    // CSRF: JS o'qiy oladigan cookie; sayt uni X-CSRF-Token sarlavhasida qaytaradi
    res.cookie(CSRF_COOKIE, randomBytes(24).toString("base64url"), { httpOnly: false, secure, sameSite: "strict", path: "/", domain, maxAge: REFRESH_TTL_SECONDS * 1000 });
    return { user: tokens.user, accessExpiresIn: tokens.accessExpiresIn };
  }
}
