import { BullModule } from "@nestjs/bullmq";
import { Body, Controller, Get, Global, Module, Param, Patch } from "@nestjs/common";
import { z } from "zod";
import { validateRule, type AutomationRule } from "@ip/core";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Roles, ZodPipe } from "../common/http";
import { AUTOMATION_QUEUE, AutomationProcessor, AutomationService } from "./automation.service";

const RulePatch = z.object({
  enabled: z.boolean().optional(),
  delayMinutes: z.number().int().min(0).max(60 * 24 * 60).optional(),
  name: z.string().trim().min(2).max(120).optional(),
});

@Controller("automation/rules")
@Roles("OWNER")
export class AutomationController {
  constructor(private readonly prisma: PrismaService, private readonly svc: AutomationService) {}

  @Get()
  list() {
    return this.prisma.automationRule.findMany({ orderBy: { id: "asc" } });
  }

  /** Rahbar qoidani yoqadi/o'chiradi va kechikishni o'zgartiradi. Shart va harakatlar kodda belgilangan. */
  @Patch(":id")
  async update(@Param("id", new ZodPipe(z.string().regex(/^[a-z0-9-]{1,64}$/))) id: string, @Body(new ZodPipe(RulePatch)) dto: z.infer<typeof RulePatch>) {
    const current = await this.prisma.automationRule.findUniqueOrThrow({ where: { id } });
    const next = { ...current, ...dto } as unknown as AutomationRule;
    const errors = validateRule(next);
    if (errors.length) throw new BadRequestException({ message: "Qoida noto'g'ri", errors });
    const row = await this.prisma.automationRule.update({ where: { id }, data: dto });
    this.svc.invalidate();
    return row;
  }
}

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: AUTOMATION_QUEUE })],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationProcessor],
  exports: [AutomationService],
})
export class AutomationModule {}
