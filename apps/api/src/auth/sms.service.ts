import { Inject, Injectable, Logger } from "@nestjs/common";
import { maskPhone } from "@ip/core";
import { ENV, type Env } from "../config/env";

/**
 * SMS yuborish. "console" rejimi faqat development uchun (env.ts productionda taqiqlaydi).
 * Eskiz.uz: token keshlanadi, 401 bo'lsa bir marta yangilanadi.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger("SMS");
  private eskizToken: { value: string; expiresAt: number } | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(phone: string, text: string): Promise<void> {
    if (this.env.SMS_PROVIDER === "console") {
      // Faqat development: kod konsolga chiqadi
      this.log.warn(`[DEV SMS] ${maskPhone(phone)}: ${text}`);
      return;
    }
    await this.sendEskiz(phone, text, true);
  }

  private async getEskizToken(force = false): Promise<string> {
    if (!force && this.eskizToken && this.eskizToken.expiresAt > Date.now()) return this.eskizToken.value;
    const body = new URLSearchParams({ email: this.env.ESKIZ_EMAIL ?? "", password: this.env.ESKIZ_PASSWORD ?? "" });
    const res = await fetch("https://notify.eskiz.uz/api/auth/login", { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Eskiz login xatosi: ${res.status}`);
    const json = (await res.json()) as { data?: { token?: string } };
    const token = json.data?.token;
    if (!token) throw new Error("Eskiz token qaytarmadi");
    this.eskizToken = { value: token, expiresAt: Date.now() + 25 * 24 * 3600 * 1000 };
    return token;
  }

  private async sendEskiz(phone: string, text: string, retry: boolean): Promise<void> {
    const token = await this.getEskizToken();
    const body = new URLSearchParams({ mobile_phone: phone.replace("+", ""), message: text, from: this.env.ESKIZ_SENDER });
    const res = await fetch("https://notify.eskiz.uz/api/message/sms/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 && retry) {
      await this.getEskizToken(true);
      return this.sendEskiz(phone, text, false);
    }
    if (!res.ok) throw new Error(`SMS yuborilmadi (${maskPhone(phone)}): ${res.status}`);
  }
}
