import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule, loadEnv } from "./config/env";
import { PrismaModule } from "./prisma/prisma.service";
import { AllExceptionsFilter } from "./common/http";
import { JwtAuthGuard, RolesGuard } from "./common/guards";
import { AuditInterceptor, AuditModule } from "./common/audit";
import { NotificationsModule } from "./notifications/notifications.module";
import { AutomationModule } from "./automation/automation.module";
import { AuthModule } from "./auth/auth.module";
import { CatalogModule } from "./catalog/catalog.module";
import { ProjectsModule } from "./projects/projects.module";
import { OrdersModule } from "./orders/orders.module";
import { TasksModule } from "./tasks/tasks.module";
import { UsersModule } from "./users/users.module";
import { FinanceModule } from "./finance/finance.module";
import { PaymentsModule } from "./payments/payments.module";
import { FilesModule } from "./files/files.module";

const env = loadEnv();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.NODE_ENV === "production" ? "info" : "debug",
        // Maxfiy sarlavha va maydonlar logga tushmaydi
        redact: {
          paths: ["req.headers.authorization", "req.headers.cookie", "req.headers['x-internal-token']", "res.headers['set-cookie']", "req.body.code", "req.body.refreshToken"],
          censor: "[yashirildi]",
        },
        genReqId: (req) => (req.headers["x-request-id"] as string | undefined)?.slice(0, 64) ?? crypto.randomUUID(),
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    JwtModule.register({}),
    BullModule.forRoot({ connection: { url: env.REDIS_URL, maxRetriesPerRequest: null } }),
    ConfigModule,
    PrismaModule,
    AuditModule,
    NotificationsModule,
    AutomationModule,
    AuthModule,
    CatalogModule,
    ProjectsModule,
    OrdersModule,
    TasksModule,
    UsersModule,
    FinanceModule,
    PaymentsModule,
    FilesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
