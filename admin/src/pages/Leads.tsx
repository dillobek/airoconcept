import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api, LEAD_STATUSES, TEMPERATURES } from "../api/client";
import { Badge, Card, Input } from "../components/ui";

const PAGE = 50;

export function Leads() {
  const [status, setStatus] = useState("");
  const [temperature, setTemperature] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["leads", status, temperature, q, offset],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/leads", {
        params: {
          query: { status: status || undefined, temperature: temperature || undefined, q: q || undefined, limit: PAGE, offset },
        },
      });
      return data;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000, // yangi leadlar avtomatik ko'rinadi
  });

  const select = "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Leadlar</h1>
        <span className="text-sm text-stone-500">Jami: {data?.total ?? "…"}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-64">
          <Input placeholder="Ism yoki telefon…" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
        </div>
        <select className={select} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
          <option value="">Barcha bosqichlar</option>
          {Object.entries(LEAD_STATUSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className={select} value={temperature} onChange={(e) => { setTemperature(e.target.value); setOffset(0); }}>
          <option value="">Barcha haroratlar</option>
          {Object.entries(TEMPERATURES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Mijoz</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3">Mebel</th>
              <th className="px-4 py-3">Bosqich</th>
              <th className="px-4 py-3">Harorat</th>
              <th className="px-4 py-3">Kanal</th>
              <th className="px-4 py-3">Yangilangan</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="px-4 py-6 text-stone-500">Yuklanmoqda…</td></tr>}
            {data?.items.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-stone-500">Hozircha leadlar yo'q</td></tr>}
            {data?.items.map((l) => (
              <tr key={l.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="px-4 py-3"><Link className="text-wood underline" to={`/leads/${l.id}`}>{l.id}</Link></td>
                <td className="px-4 py-3">{l.client.name ?? "—"}</td>
                <td className="px-4 py-3 font-mono">{l.client.phone ?? "—"}</td>
                <td className="px-4 py-3">{l.furniture_type ?? "—"}</td>
                <td className="px-4 py-3"><Badge value={l.status} label={LEAD_STATUSES[l.status]} /></td>
                <td className="px-4 py-3"><Badge value={l.temperature} label={TEMPERATURES[l.temperature]} /></td>
                <td className="px-4 py-3">{l.channel}</td>
                <td className="px-4 py-3 text-stone-500">{new Date(l.updated_at).toLocaleString("uz-UZ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data && data.total > PAGE && (
        <div className="flex gap-2">
          <button className="text-sm underline disabled:opacity-40" disabled={offset === 0} onClick={() => setOffset(offset - PAGE)}>← Oldingi</button>
          <button className="text-sm underline disabled:opacity-40" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Keyingi →</button>
        </div>
      )}
    </div>
  );
}
