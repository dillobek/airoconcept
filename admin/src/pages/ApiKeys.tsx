import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, errorText, SCOPES } from "../api/client";
import { Badge, Button, Card, ErrorBox, Input } from "../components/ui";

export function ApiKeys() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [ips, setIps] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => (await api.GET("/api/v1/api-keys")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/api-keys", {
        body: { name, scopes, allowed_ips: ips.split(",").map((s) => s.trim()).filter(Boolean) },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setCreated(data!.key);
      setName("");
      setScopes([]);
      setIps("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => setError(errorText(e)),
  });

  const revoke = useMutation({
    mutationFn: async (key_id: number) => api.POST("/api/v1/api-keys/{key_id}/revoke", { params: { path: { key_id } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">API kalitlar</h1>
      <p className="max-w-2xl text-sm text-stone-600">
        Tashqi dasturlar (Telegram bot, sayt, buxgalteriya) shu kalitlar orqali ulanadi. Har bir dasturga faqat
        kerakli ruxsatlarni bering. To'liq API hujjatlari: <a className="underline" href="/docs" target="_blank" rel="noreferrer">/docs</a>
        {" "}(serverda backend/.env da DOCS_ENABLED=true bo'lganda ochiladi)
      </p>

      {created && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="mb-2 text-sm font-medium">Kalit yaratildi. U faqat hozir ko'rsatiladi — darhol saqlang:</p>
          <code className="block break-all rounded bg-white p-3 text-sm">{created}</code>
          <Button variant="ghost" className="mt-3" onClick={() => { navigator.clipboard.writeText(created); }}>Nusxalash</Button>
          <Button variant="ghost" className="ml-2 mt-3" onClick={() => setCreated(null)}>Saqladim</Button>
        </Card>
      )}

      <Card>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Nomi (masalan: Telegram bot)" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder="Ruxsat etilgan IP'lar (vergul bilan, ixtiyoriy)" value={ips} onChange={(e) => setIps(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(s)}
                  onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))}
                />
                {s}
              </label>
            ))}
          </div>
          <ErrorBox text={error} />
          <Button type="submit" disabled={!name || scopes.length === 0 || create.isPending}>Kalit yaratish</Button>
        </form>
      </Card>

      <Card className="p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-3">Nomi</th>
              <th className="px-4 py-3">Prefiks</th>
              <th className="px-4 py-3">Scope'lar</th>
              <th className="px-4 py-3">Oxirgi foydalanish</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {keys.data?.map((k) => (
              <tr key={k.id} className="border-b border-stone-100">
                <td className="px-4 py-3">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{k.prefix}…</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s} value={s} />)}</div>
                </td>
                <td className="px-4 py-3 text-stone-500">{k.last_used_at ? new Date(k.last_used_at).toLocaleString("uz-UZ") : "—"}</td>
                <td className="px-4 py-3 text-right">
                  {k.revoked ? (
                    <Badge value="lost" label="Bekor qilingan" />
                  ) : (
                    <Button
                      variant="danger"
                      onClick={() => { if (confirm(`"${k.name}" kalitini bekor qilasizmi?`)) revoke.mutate(k.id); }}
                    >
                      Bekor qilish
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
