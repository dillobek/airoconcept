"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatSom } from "@ip/core/money";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/components/Shell";

interface Summary { incomeTiyin: number; expenseTiyin: number; netTiyin: number; byCategory: { kind: string; category: string; amountTiyin: number }[]; balancesTiyin: Record<string, number> }
interface Debt { orderId: string; number: number; client: { name: string; phone: string }; totalTiyin: number; paidTiyin: number; dueTiyin: number }
interface Pending { id: string; amountTiyin: number; note: string; category: string; createdBy: string }

export default function Finance() {
  const me = useMe();
  const [s, setS] = useState<Summary | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const jobs: Promise<unknown>[] = [api<Summary>("/finance/summary").then(setS), api<Debt[]>("/finance/debts").then(setDebts)];
    if (me?.role === "OWNER") jobs.push(api<Pending[]>("/finance/pending").then(setPending));
    Promise.all(jobs).catch((e) => setError(e instanceof ApiError ? e.message : "Xatolik"));
  }, [me?.role]);
  useEffect(load, [load]);

  async function decide(id: string, ok: boolean) {
    try {
      await api(`/finance/entries/${id}/${ok ? "approve" : "reject"}`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Xatolik");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
      <h1 style={{ margin: 0 }}>Moliya (oxirgi 30 kun)</h1>
      {error && <p className="error">{error}</p>}
      {s && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {[["Kirim", s.incomeTiyin], ["Chiqim", s.expenseTiyin], ["Sof", s.netTiyin]].map(([k, v]) => (
            <div key={k as string} className="card"><div className="muted">{k}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{formatSom(v as number)}</div></div>
          ))}
          {Object.entries(s.balancesTiyin).map(([m, v]) => (
            <div key={m} className="card"><div className="muted">Qoldiq: {m}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{formatSom(v)}</div></div>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="card">
          <strong>Tasdiq kutayotgan xarajatlar</strong>
          <table style={{ marginTop: 8 }}>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id}>
                  <td>{p.createdBy}</td><td>{p.note || p.category}</td><td>{formatSom(p.amountTiyin)}</td>
                  <td>
                    <button className="btn btn-primary" style={{ minHeight: 34 }} onClick={() => decide(p.id, true)}>Tasdiqlash</button>{" "}
                    <button className="btn btn-ghost" style={{ minHeight: 34 }} onClick={() => decide(p.id, false)}>Rad etish</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card">
        <strong>Mijozlar qarzi</strong>
        {debts.length === 0 ? <p className="muted">Qarzdor yo&apos;q.</p> : (
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Buyurtma</th><th>Mijoz</th><th>Smeta</th><th>To&apos;landi</th><th>Qarz</th></tr></thead>
            <tbody>
              {debts.map((d) => (
                <tr key={d.orderId}>
                  <td><Link href={`/buyurtmalar/${d.orderId}`}>#{d.number}</Link></td>
                  <td>{d.client.name}</td><td>{formatSom(d.totalTiyin)}</td><td>{formatSom(d.paidTiyin)}</td><td><b>{formatSom(d.dueTiyin)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Kirim-chiqim kiritish uchun Telegram hisob-kitob botidan foydalaning.</p>
    </div>
  );
}
