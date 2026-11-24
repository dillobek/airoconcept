import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { errorText, type User } from "../api/client";
import { Button, Card, ErrorBox, Input } from "../components/ui";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, totp_code: totp || null }),
    });
    const result = (await response.json()) as User | { detail?: unknown };
    setBusy(false);
    if (!response.ok) {
      const msg = errorText(result);
      if (msg.includes("2FA")) setNeedTotp(true);
      setError(msg);
      return;
    }
    qc.setQueryData(["me"], result as User);
    navigate((location.state as { from?: string } | null)?.from ?? "/leads", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-walnut p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">AiroConcept</h1>
        <p className="mb-6 text-sm text-stone-500">Boshqaruv paneliga kirish</p>
        <form onSubmit={submit} className="space-y-3">
          <Input placeholder="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <Input type="password" placeholder="Parol" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {needTotp && (
            <Input inputMode="numeric" placeholder="2FA kod (6 raqam)" autoComplete="one-time-code" value={totp} onChange={(e) => setTotp(e.target.value)} />
          )}
          <ErrorBox text={error} />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Tekshirilmoqda…" : "Kirish"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
