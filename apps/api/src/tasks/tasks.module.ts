import { Body, Controller, ForbiddenException, Get, Injectable, Logger, Module, NotFoundException, Param, Patch, Query } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser, CurrentUser, ZodPipe, STAFF_ROLES, Roles } from "../common/http";
import { AutomationService } from "../automation/automation.service";
import { ProjectsModule, ProjectsService } from "../projects/projects.module";

const cuid = z.string().cuid();
const ListQuery = z.object({ status: z.enum(["OPEN", "DONE", "CANCELLED"]).default("OPEN"), all: z.coerce.boolean().default(false) });
const PatchDto = z.object({ status: z.enum(["DONE", "CANCELLED"]), assigneeId: cuid.optional() });

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser, q: z.infer<typeof ListQuery>) {
    const seeAll = q.all && (user.role === "OWNER" || user.role === "MANAGER");
    return this.prisma.task.findMany({
      where: { status: q.status, ...(seeAll ? {} : { assigneeId: user.id }) },
      orderBy: { dueAt: "asc" },
      take: 200,
      select: { id: true, title: true, role: true, dueAt: true, status: true, escalatedAt: true, order: { select: { id: true, number: true, address: true } }, assignee: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, user: AuthUser, dto: z.infer<typeof PatchDto>) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException();
    const manager = user.role === "OWNER" || user.role === "MANAGER";
    if (!manager && task.assigneeId !== user.id) throw new ForbiddenException();
    if (dto.assigneeId && !manager) throw new ForbiddenException("Vazifani faqat menejer qayta biriktiradi");
    return this.prisma.task.update({
      where: { id },
      data: { status: dto.status, completedAt: dto.status === "DONE" ? new Date() : null, ...(dto.assigneeId ? { assigneeId: dto.assigneeId } : {}) },
    });
  }
}

@Controller("tasks")
@Roles(...STAFF_ROLES)
export class TasksController {
  constructor(private readonly svc: TasksService) {}
  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.svc.list(u, q);
  }
  @Patch(":id")
  update(@Param("id", new ZodPipe(cuid)) id: string, @CurrentUser() u: AuthUser, @Body(new ZodPipe(PatchDto)) dto: z.infer<typeof PatchDto>) {
    return this.svc.update(id, u, dto);
  }
}

/** Koordinatorning "nazorat" ishi: har 15 daqiqada muddati o'tgan vazifalar va harakatsiz loyihalar tekshiriladi */
@Injectable()
export class SupervisorJobs {
  private readonly log = new Logger("Supervisor");
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly automation: AutomationService, private readonly projects: ProjectsService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async tick() {
    if (this.running) return; // bir vaqtda ikki marta ishlamasin
    this.running = true;
    try {
      const overdue = await this.prisma.task.findMany({
        where: { status: "OPEN", dueAt: { lt: new Date() }, escalatedAt: null },
        select: { id: true, title: true, orderId: true },
        take: 200,
      });
      for (const t of overdue) {
        await this.prisma.task.update({ where: { id: t.id }, data: { escalatedAt: new Date() } });
        await this.automation.emit({ type: "TASK_OVERDUE", data: { taskId: t.id, orderId: t.orderId, title: t.title }, occurredAt: new Date() });
      }
      await this.projects.emitIdleProjects();
      // Muddati o'tgan OTP va bekor qilingan refresh tokenlarni tozalash
      await this.prisma.otpChallenge.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 3600_000) } } });
      await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running = false;
    }
  }
}

@Module({ imports: [ProjectsModule], controllers: [TasksController], providers: [TasksService, SupervisorJobs] })
export class TasksModule {}
