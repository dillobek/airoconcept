"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

/** Faqat sayt ichidagi yo'lga qaytarish (open redirect himoyasi) */
function safeNext(v: string | null): string {
  return v && /^\/[a-zA-Z0-9/_?=&%-]*$/.test(v) && !v.startsWith("//") ? v : "/";
}

function KirishForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/staff/login", { method: "POST", body: { username, password } });
      router.replace(safeNext(sp.get("next")));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 460, padding: "56px 24px" }}>
      <h1 style={{ fontSize: 32 }}>CRM — xodimlar uchun kirish</h1>
      {error && <p className="error" role="alert">{error}</p>}
        <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required />
          </div>
          <div className="field">
            <label htmlFor="password">Parol</label>
            <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn btn-primary" disabled={busy || username.length < 3 || password.length < 12}>Kirish</button>
        </form>
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
