import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, errorText } from "../api/client";
import { useMe } from "../auth";
import { Button, Card, ErrorBox, Input } from "../components/ui";

export function Security() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      <h1 className="text-2xl font-semibold">Ikki bosqichli himoya (2FA)</h1>
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
