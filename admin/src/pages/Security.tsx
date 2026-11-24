import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, errorText } from "../api/client";
import type { User } from "../api/client";
import { useMe } from "../auth";
import { Button, Card, ErrorBox, Input } from "../components/ui";

export function Security() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [credentialsSuccess, setCredentialsSuccess] = useState<string | null>(null);
  const [credentialsBusy, setCredentialsBusy] = useState(false);

  async function saveCredentials() {
    const username = usernameDraft ?? me?.username ?? "";
    setCredentialsError(null);
    setCredentialsSuccess(null);
    if (newPassword && newPassword !== confirmPassword) {
      setCredentialsError("Yangi parollar mos emas");
      return;
    }
    setCredentialsBusy(true);
    const response = await fetch("/api/v1/auth/credentials", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: currentPassword, username, new_password: newPassword || null }),
    });
    const result = (await response.json()) as User | { detail?: unknown };
    setCredentialsBusy(false);
    if (!response.ok) {
      setCredentialsError(errorText(result));
      return;
    }
    qc.setQueryData(["me"], result as User);
    setUsernameDraft((result as User).username);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCredentialsSuccess("Username va parol sozlamalari saqlandi");
  }

  async function start() {
    setError(null);
    const { data, error } = await api.POST("/api/v1/auth/2fa/setup");
    if (error) return setError(errorText(error));
    setSetup(data!);
  }

  async function enable() {
    setError(null);
    const { data, error } = await api.POST("/api/v1/auth/2fa/enable", { body: { code } });
    if (error) return setError(errorText(error));
    qc.setQueryData(["me"], data);
    setSetup(null);
  }

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-semibold">Xavfsizlik</h1>
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Username va parol</h2>
          <p className="mt-1 text-sm text-stone-600">Kirish ma'lumotlarini shu yerdan almashtiring.</p>
        </div>
        <Input
          placeholder="Username"
          autoComplete="username"
          value={usernameDraft ?? me?.username ?? ""}
          onChange={(event) => setUsernameDraft(event.target.value)}
        />
        <Input
          type="password"
          placeholder="Joriy parol"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
        <Input
          type="password"
          placeholder="Yangi parol (kamida 12 belgi, ixtiyoriy)"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <Input
          type="password"
          placeholder="Yangi parolni takrorlang"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        <ErrorBox text={credentialsError} />
        {credentialsSuccess ? <p className="text-sm text-emerald-700">{credentialsSuccess}</p> : null}
        <Button onClick={saveCredentials} disabled={credentialsBusy || !currentPassword || !(usernameDraft ?? me?.username)}>
          {credentialsBusy ? "Saqlanmoqda…" : "Kirish ma'lumotlarini saqlash"}
        </Button>
      </Card>
      <h2 className="text-xl font-semibold">Ikki bosqichli himoya (2FA)</h2>
      <Card className="space-y-4">
        {me?.totp_enabled ? (
          <p className="text-sm text-emerald-700">✅ 2FA yoqilgan. Har kirishda Google Authenticator kodi so'raladi.</p>
        ) : !setup ? (
          <>
            <p className="text-sm text-stone-600">
              Parol o'g'irlansa ham akkauntga kirib bo'lmasligi uchun 2FA'ni yoqing. Google Authenticator yoki
              shunga o'xshash ilova kerak.
            </p>
            <Button onClick={start}>2FA'ni sozlash</Button>
          </>
        ) : (
          <>
            <p className="text-sm">1. Authenticator ilovasida "kalitni qo'lda kiritish"ni tanlang va quyidagi kalitni kiriting:</p>
            <code className="block break-all rounded bg-stone-100 p-3 text-sm">{setup.secret}</code>
            <p className="text-sm">2. Ilova ko'rsatgan 6 xonali kodni kiriting:</p>
            <Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
            <Button onClick={enable} disabled={code.length < 6}>Tasdiqlash</Button>
          </>
        )}
        <ErrorBox text={error} />
      </Card>
    </div>
  );
}
