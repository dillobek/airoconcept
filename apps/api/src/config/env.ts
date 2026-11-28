import { Global, Module } from "@nestjs/common";
import { z } from "zod";

/**
 * Muhit o'zgaruvchilari ishga tushishda tekshiriladi. Biror maxfiy kalit yo'q yoki zaif bo'lsa —
 * server umuman ishga tushmaydi (xavfsiz bo'lmagan holatda ishlashdan ko'ra to'xtash yaxshi).
 */
const secret = z
  .string()
  .min(32, "kamida 32 belgi")
  .refine((v) => !v.startsWith("CHANGE_ME"), "standart qiymat almashtirilmagan");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_PUBLIC_URL: z.string().url(),
    CORS_ORIGINS: z
      .string()
      .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
      .refine((arr) => arr.every((o) => /^https?:\/\/[^*]+$/.test(o)), "CORS_ORIGINS da * bo'lmasligi kerak"),
    /** Sayt va API turli subdomenlarda bo'lsa: ".example.uz" (CSRF cookie saytdan o'qilishi uchun) */
    COOKIE_DOMAIN: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\.?[a-z0-9.-]+$/).optional()),
    DATABASE_URL: z.string().startsWith("postgresql://"),
    REDIS_URL: z.string().startsWith("redis://"),
    JWT_ACCESS_SECRET: secret,
    OTP_PEPPER: secret,
    INTERNAL_SERVICE_TOKEN: secret,
    SMS_PROVIDER: z.enum(["disabled", "console", "eskiz"]).default("disabled"),
    ESKIZ_EMAIL: z.string().optional(),
    ESKIZ_PASSWORD: z.string().optional(),
    ESKIZ_SENDER: z.string().default("4546"),
    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY: z.string().min(3),
    S3_SECRET_KEY: z.string().min(8),
    S3_PUBLIC_URL: z.string().url(),
    PAYME_MERCHANT_ID: z.string().optional(),
    PAYME_KEY: z.string().optional(),
    CLICK_SERVICE_ID: z.string().optional(),
    CLICK_MERCHANT_ID: z.string().optional(),
    CLICK_SECRET_KEY: z.string().optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    FINANCE_APPROVAL_THRESHOLD: z.coerce.number().int().min(0).default(5_000_000),
    PLAN_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (env.SMS_PROVIDER === "console")
        ctx.addIssue({ code: "custom", path: ["SMS_PROVIDER"], message: "productionda console SMS taqiqlangan" });
      if (!env.API_PUBLIC_URL.startsWith("https://"))
        ctx.addIssue({ code: "custom", path: ["API_PUBLIC_URL"], message: "productionda faqat https" });
      if (env.CORS_ORIGINS.some((o) => !o.startsWith("https://")))
        ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "productionda faqat https domenlar" });
    }
    const secrets = [env.JWT_ACCESS_SECRET, env.OTP_PEPPER, env.INTERNAL_SERVICE_TOKEN];
    if (new Set(secrets).size !== secrets.length)
      ctx.addIssue({ code: "custom", path: ["JWT_ACCESS_SECRET"], message: "barcha maxfiy kalitlar har xil bo'lishi kerak" });
    if (env.SMS_PROVIDER === "eskiz" && (!env.ESKIZ_EMAIL || !env.ESKIZ_PASSWORD))
      ctx.addIssue({ code: "custom", path: ["ESKIZ_EMAIL"], message: "Eskiz login/parol kerak" });
  });

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Qiymatlarning o'zini emas, faqat qaysi kalit xato ekanini chiqaramiz
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Muhit sozlamalari noto'g'ri:\n${msg}`);
  }
  cached = parsed.data;
  return cached;
}

export const ENV = Symbol("ENV");


@Global()
@Module({ providers: [{ provide: ENV, useFactory: loadEnv }], exports: [ENV] })
export class ConfigModule {}
