import { Global, Inject, Injectable, Logger, Module } from "@nestjs/common";
import type { NotificationChannel, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SmsService } from "../auth/sms.service";
import { ENV, type Env } from "../config/env";

/** Xabar shablonlari. O'zgaruvchilar faqat {nom} ko'rinishida, qiymatlar oddiy matn sifatida qo'yiladi. */
const TEMPLATES: Record<string, string> = {
  project_idle_reminder: "Loyihangiz saqlangan. Taxminiy narxni ko'rib, buyurtma berishingiz mumkin — ilovani oching.",
  measurement_scheduled: "Buyurtma #{orderNumber}: o'lchovchi tashrifi belgilandi. Vaqtini ilovada ko'ring.",
  deposit_received: "Buyurtma #{orderNumber}: avans qabul qilindi. Ishlab chiqarish boshlandi.",
  choose_delivery_date: "Buyurtma #{orderNumber}: hammasi tayyor! Ilovada yetkazish kunini tanlang.",
  final_payment_link: "Buyurtma #{orderNumber}: o'rnatish yakunlandi. Qolgan to'lovni ilovada amalga oshiring.",
  ask_review: "Buyurtma #{orderNumber}: xizmatimizni baholang — fikringiz biz uchun muhim.",
  payment_due: "Buyurtma #{orderNumber}: to'lov muddati keldi.",
  payment_due_staff: "Buyurtma #{orderNumber}: mijoz to'lov muddati keldi.",
  task_overdue: "Muddati o'tgan vazifa: {title} (buyurtma #{orderNumber})",
  task_assigned: "Yangi vazifa: {title}. Muddat: {due}",
  finance_approval: "Tasdiq kutilmoqda: {note} — {amount}. Bot: /tasdiq",
  daily_report: "{text}",
};

function render(template: string, vars: Record<string, string | number | null | undefined>): string {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`Noma'lum shablon: ${template}`);
  return t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "—").slice(0, k === "text" ? 3500 : 120));
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger("Notify");
  constructor(private readonly prisma: PrismaService, private readonly sms: SmsService, @Inject(ENV) private readonly env: Env) {}

  async toUser(userId: string, template: string, vars: Record<string, string | number | null>, channels: NotificationChannel[]) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, phone: true, telegramId: true, isActive: true } });
    if (!user || !user.isActive) return;
    const text = render(template, vars);
    for (const channel of channels) {
      const row = await this.prisma.notification.create({ data: { userId, phone: user.phone, channel, template, payload: vars } });
      try {
        if (channel === "SMS") {
          if (!user.phone) throw new Error("Telefon raqam bog'lanmagan");
          await this.sms.send(user.phone, text);
        }
        else if (channel === "TELEGRAM") {
          if (!user.telegramId) throw new Error("Telegram bog'lanmagan");
          await this.telegram(user.telegramId, text);
        } else {
          // PUSH: mobil ilova (FCM) ulanganda yuboriladi; hozircha navbatda qoladi
          continue;
        }
        await this.prisma.notification.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date() } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "xato";
        this.log.warn(`Xabar yuborilmadi (${channel}, ${template}): ${msg}`);
        await this.prisma.notification.update({ where: { id: row.id }, data: { status: "FAILED", error: msg.slice(0, 300) } });
      }
    }
  }

  async toRole(role: Role, template: string, vars: Record<string, string | number | null>) {
    const users = await this.prisma.user.findMany({ where: { role, isActive: true, telegramId: { not: null } }, select: { id: true } });
    for (const u of users) await this.toUser(u.id, template, vars, ["TELEGRAM"]);
  }

  private async telegram(chatId: bigint, text: string) {
    if (!this.env.TELEGRAM_BOT_TOKEN) throw new Error("Bot token yo'q");
    const res = await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId.toString(), text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Telegram ${res.status}`);
  }
}

@Global()
@Module({ providers: [NotificationsService, SmsService], exports: [NotificationsService, SmsService] })
export class NotificationsModule {}
