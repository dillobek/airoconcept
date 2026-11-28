/**
 * Brauzerdagi API mijozi. Kirish httpOnly cookie orqali (JS tokenni ko'rmaydi — XSS da o'g'irlab bo'lmaydi).
 * O'zgartiruvchi so'rovlarga CSRF tokeni qo'shiladi. Access token muddati tugasa — bir marta yangilanadi.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

function csrf(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ip_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" })
    .then((r) => r.ok)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["x-csrf-token"] = csrf();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refresh()) return api<T>(path, init, false);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = (json as { message?: unknown } | null)?.message;
    throw new ApiError(res.status, typeof msg === "string" ? msg : "Xatolik yuz berdi", json);
  }
  return json as T;
}

/** Server komponentlar uchun ochiq (public) so'rov — kesh 60 soniya */
export async function publicGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 60 } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: { slug: string; name: string };
  priceTiyin: number;
  dimensionsCm: { width: number; depth: number; height: number };
  modelGlbUrl: string | null;
  images: (string | null)[];
  variants: { id: string; name: string; colorHex: string | null; priceTiyin: number }[];
}

export interface Page<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}
