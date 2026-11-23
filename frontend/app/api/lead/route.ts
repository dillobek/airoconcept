import { NextResponse, type NextRequest } from "next/server";

// Bu kod FAQAT serverda ishlaydi — API kalit brauzerga hech qachon chiqmaydi.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API_KEY = process.env.BACKEND_API_KEY ?? "";

// Oddiy IP bo'yicha cheklov (bitta server instansiyasi uchun yetarli)
const hits = new Map<string, number[]>();
function tooMany(ip: string, limit = 5, windowMs = 10 * 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear();
  return recent.length > limit;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (tooMany(ip)) {
    return NextResponse.json({ error: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  // Honeypot to'ldirilgan bo'lsa — bot. Jim "muvaffaqiyat" qaytaramiz.
  if (body.website) return NextResponse.json({ ok: true });

  const payload = {
    name: String(body.name ?? "").slice(0, 120),
    phone: String(body.phone ?? "").slice(0, 20),
    furniture_type: body.furniture_type ? String(body.furniture_type).slice(0, 60) : null,
    message: body.message ? String(body.message).slice(0, 1000) : null,
  };

  if (!API_KEY) {
    console.error("BACKEND_API_KEY sozlanmagan");
    return NextResponse.json({ error: "Server sozlanmagan" }, { status: 500 });
  }

  const res = await fetch(`${BACKEND_URL}/api/v1/leads/website`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
    body: JSON.stringify(payload),
    cache: "no-store",
  }).catch(() => null);

  if (!res) return NextResponse.json({ error: "Server bilan aloqa yo'q" }, { status: 502 });
  if (res.status === 422) {
    return NextResponse.json({ error: "Telefon raqamini +998 XX XXX XX XX formatida kiriting" }, { status: 422 });
  }
  if (!res.ok) return NextResponse.json({ error: "Yuborib bo'lmadi" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
