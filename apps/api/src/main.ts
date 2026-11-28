import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { json, urlencoded } from "express";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";

async function bootstrap() {
  const env = loadEnv(); // sozlama xato bo'lsa — shu yerda to'xtaydi
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Reverse proxy (nginx/caddy) ortida: haqiqiy IP X-Forwarded-For dan (faqat 1 bosqich ishoniladi)
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
      hsts: env.NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    }),
  );
  app.use(cookieParser());
  // So'rov hajmi cheklangan (3D sahna uchun 1 MB yetarli). Fayllar S3 ga to'g'ridan-to'g'ri yuklanadi.
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: false, limit: "100kb" }));

  app.enableCors({
    origin: (origin, cb) => {
      // Brauzerdan tashqari so'rovlar (mobil ilova, to'lov tizimlari) Origin yubormaydi
      if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS ruxsat etilmagan"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Client", "X-Request-Id"],
    maxAge: 600,
  });

  app.enableShutdownHooks();
  await app.listen(env.API_PORT, "0.0.0.0");
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
