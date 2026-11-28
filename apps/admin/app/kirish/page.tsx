"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

type Step = "phone" | "code";

/** Faqat sayt ichidagi yo'lga qaytarish (open redirect himoyasi) */
function safeNext(v: string | null): string {
  return v && /^\/[a-zA-Z0-9/_?=&%-]*$/.test(v) && !v.startsWith("//") ? v : "/";
}

function KirishForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [needsName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/otp/request", { method: "POST", body: { phone: `+998${phone.replace(/\D/g, "")}` } });
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/otp/verify", { method: "POST", body: { phone: `+998${phone.replace(/\D/g, "")}`, code, ...(needsName ? { name } : {}) } });
      router.replace(safeNext(sp.get("next")));
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError("Bu raqam xodimlar ro'yxatida yo'q. Rahbarga murojaat qiling.");
      } else setError(err instanceof ApiError ? err.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 460, padding: "56px 24px" }}>
      <h1 style={{ fontSize: 32 }}>{step === "phone" ? "CRM — xodimlar uchun kirish" : "Tasdiqlash kodi"}</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {step === "phone" ? (
        <form onSubmit={requestCode} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field">
            <label htmlFor="phone">Telefon raqam</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <strong>+998</strong>
              <input id="phone" className="input" style={{ flex: 1 }} inputMode="numeric" autoComplete="tel-national" placeholder="90 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 14))} required />
            </div>
          </div>
          <button className="btn btn-dark" disabled={busy || phone.replace(/\D/g, "").length !== 9}>Kod olish</button>
        </form>
      ) : (
        <form onSubmit={verify} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p className="muted">+998 {phone} raqamiga yuborilgan 6 xonali kodni kiriting.</p>
          <div className="field">
            <label htmlFor="code">Kod</label>
            <input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
          </div>
          {needsName && (
            <div className="field">
              <label htmlFor="name">Ism</label>
              <input id="name" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <button className="btn btn-primary" disabled={busy || code.length !== 6}>Tasdiqlash</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setStep("phone"); setCode(""); }}>Raqamni o&apos;zgartirish</button>
        </form>
      )}
    </div>
  );
}

export default function Kirish() {
  return (
    <Suspense fallback={null}>
      <KirishForm />
    </Suspense>
  );
}
