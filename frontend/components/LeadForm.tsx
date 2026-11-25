"use client";

import { useState, type FormEvent } from "react";

const TYPES = ["oshxona", "shkaf-kupe", "garderob", "yotoqxona", "ofis", "boshqa"];

export function LeadForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    if (res.ok) return setState("done");
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Yuborib bo'lmadi, qayta urinib ko'ring.");
    setState("error");
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl bg-sand p-8">
        <div className="text-xl font-semibold text-moss">Rahmat! ✅</div>
        <p className="mt-2 text-stone-600">Menejerimiz tez orada siz bilan bog'lanadi.</p>
      </div>
    );
  }

  const input = "w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-wood";
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-sand p-6">
      <input name="name" required maxLength={120} placeholder="Ismingiz" className={input} />
      <input name="phone" required inputMode="tel" placeholder="+998 90 123 45 67" className={input} />
      <select name="furniture_type" className={input} defaultValue="">
        <option value="" disabled>Qanday mebel kerak?</option>
        {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <textarea name="message" maxLength={1000} rows={3} placeholder="Izoh (ixtiyoriy)" className={input} />
      {/* Botlar uchun tuzoq: odam bu maydonni ko'rmaydi va to'ldirmaydi */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {state === "error" && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={state === "sending"} className="w-full rounded-xl bg-walnut py-3.5 text-white hover:bg-brand-ink disabled:opacity-60">
        {state === "sending" ? "Yuborilmoqda…" : "Zamerga yozilish"}
      </button>
      <p className="text-xs text-stone-500">Yuborish orqali <a href="/privacy" className="underline">maxfiylik siyosati</a>ga rozilik bildirasiz.</p>
    </form>
  );
}
