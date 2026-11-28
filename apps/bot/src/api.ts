/**
 * API bilan aloqa. Har bir so'rov ichki token va foydalanuvchining Telegram ID si bilan ketadi;
 * kim nima qila olishini API hal qiladi (bot o'zi hech qanday huquq bermaydi).
 */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class Api {
  constructor(private readonly baseUrl: string, private readonly token: string) {
    if (!/^https?:\/\//.test(baseUrl)) throw new Error("BOT_API_URL noto'g'ri");
    if (!token || token.length < 32) throw new Error("INTERNAL_SERVICE_TOKEN kamida 32 belgi");
  }

  async call<T>(method: "GET" | "POST", path: string, telegramUserId: number | null, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "x-internal-token": this.token, "content-type": "application/json" };
    if (telegramUserId !== null) headers["x-telegram-user-id"] = String(telegramUserId);
    const res = await fetch(this.baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* matn JSON emas */
    }
    if (!res.ok) {
      const msg = (json as { message?: unknown })?.message;
      throw new ApiError(res.status, typeof msg === "string" ? msg : res.status === 403 ? "Huquqingiz yo'q" : "Xatolik yuz berdi");
    }
    return json as T;
  }
}
