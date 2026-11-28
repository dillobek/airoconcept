import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { DEFAULT_RULES, evaluate, validateRule, type AutomationAction, type AutomationEvent, type AutomationRule } from "@ip/core";
import type { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.module";

export const AUTOMATION_QUEUE = "automation";

interface ActionJob {
  ruleId: string;
  action: AutomationAction;
  data: AutomationEvent["data"];
}

/**
 * Hodisani qabul qiladi, qoidalarni baholaydi va harakatlarni navbatga qo'yadi (kechikish bilan).
 * Navbat Redis'da — server qayta ishga tushsa ham rejalashtirilgan harakatlar yo'qolmaydi.
 */
@Injectable()
export class AutomationService implements OnModuleInit {
  private readonly log = new Logger("Automation");
  private cache: { rules: AutomationRule[]; at: number } | null = null;

  constructor(private readonly prisma: PrismaService, @InjectQueue(AUTOMATION_QUEUE) private readonly queue: Queue<ActionJob>) {}

  async onModuleInit() {
    // Standart qoidalar bazaga bir marta yoziladi; keyin CRM'dan boshqariladi
    const count = await this.prisma.automationRule.count();
    if (count === 0) {
      await this.prisma.automationRule.createMany({
        data: DEFAULT_RULES.map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, trigger: r.trigger, conditions: r.conditions as object, actions: r.actions as object, delayMinutes: r.delayMinutes })),
      });
      this.log.log(`${DEFAULT_RULES.length} ta standart qoida yaratildi`);
    }
  }

  async rules(): Promise<AutomationRule[]> {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.rules;
    const rows = await this.prisma.automationRule.findMany({ where: { enabled: true } });
    const rules = rows
      .map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, trigger: r.trigger, conditions: r.conditions, actions: r.actions, delayMinutes: r.delayMinutes }) as unknown as AutomationRule)
      .filter((r) => validateRule(r).length === 0);
    this.cache = { rules, at: Date.now() };
    return rules;
  }

  invalidate() {
    this.cache = null;
  }

  async emit(event: AutomationEvent) {
    const planned = evaluate(event, await this.rules());
    for (const p of planned) {
      const delay = Math.max(0, p.runAt.getTime() - Date.now());
      await this.queue.add(p.action.type, { ruleId: p.ruleId, action: p.action, data: event.data }, {
        delay,
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    }
    return planned.length;
  }
}

@Processor(AUTOMATION_QUEUE)
export class AutomationProcessor extends WorkerHost {
  private readonly log = new Logger("AutomationWorker");
  constructor(private readonly prisma: PrismaService, private readonly notify: NotificationsService) {
    super();
  }

  private str(v: unknown): string | null {
    return typeof v === "string" && /^[a-z0-9]{20,40}$/.test(v) ? v : null;
  }

  async process(job: Job<ActionJob>) {
    const { action, data, ruleId } = job.data;
    const orderId = this.str(data.orderId);
    const order = orderId ? await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, number: true, clientId: true, region: true, status: true } }) : null;
    // Buyurtma bekor qilingan bo'lsa, kechiktirilgan harakatlar bajarilmaydi
    if (order?.status === "CANCELLED") return;
    const clientId = order?.clientId ?? this.str(data.clientId);
    const vars = { orderNumber: order?.number ?? null, title: typeof data.title === "string" ? data.title : null };

    switch (action.type) {
      case "NOTIFY_CLIENT":
        if (clientId) await this.notify.toUser(clientId, action.template, vars, action.channels);
        break;
      case "NOTIFY_ROLE":
      case "ESCALATE":
        await this.notify.toRole(action.role as Role, action.template, vars);
        if (action.type === "ESCALATE" && this.str(data.taskId))
          await this.prisma.task.update({ where: { id: data.taskId as string }, data: { escalatedAt: new Date() } });
        break;
      case "CREATE_TASK": {
        const assigneeId = await this.pickAssignee(action.role as Role, order?.region ?? null);
        const task = await this.prisma.task.create({
          data: {
            role: action.role as Role,
            title: action.title.slice(0, 200),
            dueAt: new Date(Date.now() + action.dueInHours * 3600_000),
            orderId: order?.id ?? null,
            projectId: this.str(data.projectId),
            assigneeId,
            ruleId,
          },
        });
        if (assigneeId) await this.notify.toUser(assigneeId, "task_assigned", { title: task.title, due: task.dueAt.toISOString().slice(0, 16).replace("T", " ") }, ["TELEGRAM"]);
        break;
      }
      case "AUTO_ASSIGN": {
        if (!order) break;
        const assigneeId = await this.pickAssignee(action.role as Role, order.region);
        if (!assigneeId) {
          this.log.warn(`Buyurtma #${order.number}: ${action.role} topilmadi — menejerga vazifa`);
          await this.prisma.task.create({ data: { role: "MANAGER", title: `${action.role} ni qo'lda tayinlash kerak`, dueAt: new Date(Date.now() + 4 * 3600_000), orderId: order.id, ruleId } });
          break;
        }
        if (action.role === "MEASURER") await this.prisma.order.update({ where: { id: order.id }, data: { measurerId: assigneeId } });
        await this.prisma.task.create({ data: { role: action.role as Role, title: "O'lchovga borish", dueAt: new Date(Date.now() + 48 * 3600_000), orderId: order.id, assigneeId, ruleId } });
        await this.notify.toUser(assigneeId, "task_assigned", { title: `O'lchov, buyurtma #${order.number}`, due: "48 soat ichida" }, ["TELEGRAM"]);
        break;
      }
    }
  }

  /** Eng kam ochiq vazifasi bor xodim (hudud mos kelsa — ustun). Koordinatorning "kimga beraman" qarori. */
  private async pickAssignee(role: Role, region: string | null): Promise<string | null> {
    const staff = await this.prisma.user.findMany({
      where: { role, isActive: true },
      select: { id: true, region: true, _count: { select: { tasks: { where: { status: "OPEN" } } } } },
    });
    if (staff.length === 0) return null;
    staff.sort((a, b) => {
      const ra = region && a.region === region ? 0 : 1;
      const rb = region && b.region === region ? 0 : 1;
      return ra - rb || a._count.tasks - b._count.tasks;
    });
    return staff[0]!.id;
  }
}
