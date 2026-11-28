"use client";

import { use, useCallback, useEffect, useState } from "react";
import { formatSom } from "@ip/core/money";
import { nextStatuses, ORDER_STATUS_LABEL_UZ, type OrderStatus } from "@ip/core/order-state";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/components/Shell";

interface Estimate { id: string; version: number; status: string; totalTiyin: number; depositTiyin: number; lines: { title: string; totalTiyin: number; quantityMilli: number }[]; createdAt: string }
interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  address: string;
  client: { name: string; phone?: string };
  manager: { id: string; name: string } | null;
  measurer: { id: string; name: string } | null;
  measurementAt: string | null;
  history: { from: string; to: string; note: string | null; createdAt: string }[];
  estimates: Estimate[];
  finance: { totalTiyin: number; depositTiyin: number; paidTiyin: number; balanceDueTiyin: number; depositPaid: boolean };
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const [o, setO] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discount, setDiscount] = useState(0);

  const load = useCallback(() => {
    if (!/^c[a-z0-9]{20,30}$/.test(id)) return setError("Noto'g'ri havola");
    api<Order>(`/orders/${id}`).then(setO).catch((e) => setError(e instanceof ApiError ? e.message : "Yuklab bo'lmadi"));
  }, [id]);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  if (!o) return error ? <p className="error">{error}</p> : <p className="muted">Yuklanmoqda…</p>;
  const canEstimate = me && ["OWNER", "MANAGER", "DESIGNER"].includes(me.role);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <h1 style={{ margin: 0, flex: 1 }}>Buyurtma #{o.number}</h1>
        <span className="badge" style={{ fontSize: 14 }}>{ORDER_STATUS_LABEL_UZ[o.status]}</span>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <div className="card">
          <strong>Mijoz</strong>
          <div>{o.client.name}</div>
          {o.client.phone && <a href={`tel:${o.client.phone}`}>{o.client.phone}</a>}
          <div className="muted" style={{ marginTop: 6 }}>{o.address}</div>
        </div>
        <div className="card">
          <strong>Mas&apos;ullar</strong>
          <div>Menejer: {o.manager?.name ?? "—"}</div>
          <div>O&apos;lchovchi: {o.measurer?.name ?? "—"}</div>
          <div>O&apos;lchov: {o.measurementAt ? new Date(o.measurementAt).toLocaleString("uz-UZ") : "—"}</div>
        </div>
        <div className="card">
          <strong>Hisob</strong>
          <div>Smeta: {formatSom(o.finance.totalTiyin)}</div>
          <div>Avans: {formatSom(o.finance.depositTiyin)} {o.finance.depositPaid ? "✓" : ""}</div>
          <div>To&apos;landi: {formatSom(o.finance.paidTiyin)}</div>
          <div><b>Qarz: {formatSom(o.finance.balanceDueTiyin)}</b></div>
        </div>
      </div>

      <div className="card">
        <strong>Keyingi bosqich</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {nextStatuses(o.status).map((s) => (
            <button key={s} className="btn btn-primary" disabled={busy} onClick={() => run(() => api(`/orders/${o.id}/transition`, { method: "POST", body: { to: s } }))}>
              → {ORDER_STATUS_LABEL_UZ[s]}
            </button>
          ))}
          {o.status !== "COMPLETED" && o.status !== "CANCELLED" && (
            <button
              className="btn"
              style={{ background: "#f8e6dc", color: "#8a3f1e" }}
              disabled={busy}
              onClick={() => {
                const note = window.prompt("Bekor qilish sababi:");
                if (note && note.trim().length >= 3) void run(() => api(`/orders/${o.id}/transition`, { method: "POST", body: { to: "CANCELLED", note: note.slice(0, 500) } }));
              }}
            >
              Bekor qilish
            </button>
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Holat faqat ruxsat etilgan tartibda o&apos;zgaradi; shart bajarilmagan bo&apos;lsa server sababini ko&apos;rsatadi.</p>
      </div>

      <div className="card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <strong style={{ flex: 1 }}>Smetalar</strong>
          {canEstimate && (
            <>
              <label className="muted" style={{ fontSize: 13 }}>
                Chegirma, %{" "}
                <input className="input" style={{ width: 80, height: 38 }} type="number" min={0} max={30} value={discount} onChange={(e) => setDiscount(Math.max(0, Math.min(30, Number(e.target.value))))} />
              </label>
              <button className="btn btn-dark" disabled={busy} onClick={() => run(() => api(`/orders/${o.id}/estimates`, { method: "POST", body: { orderDiscountBp: Math.round(discount * 100) } }))}>
                3D loyihadan yangi smeta
              </button>
            </>
          )}
        </div>
        {o.estimates.length === 0 ? <p className="muted">Smeta hali yo&apos;q.</p> : (
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Versiya</th><th>Holat</th><th>Jami</th><th>Avans</th><th /></tr></thead>
            <tbody>
              {o.estimates.map((e) => (
                <tr key={e.id}>
                  <td>v{e.version}</td>
                  <td>{e.status === "APPROVED" ? "Tasdiqlangan" : e.status === "DRAFT" ? "Qoralama" : "Eskirgan"}</td>
                  <td>{formatSom(e.totalTiyin)}</td>
                  <td>{formatSom(e.depositTiyin)}</td>
                  <td>
                    {e.status === "DRAFT" && me && ["OWNER", "MANAGER"].includes(me.role) && (
                      <button className="btn btn-ghost" style={{ minHeight: 34 }} disabled={busy} onClick={() => run(() => api(`/orders/${o.id}/estimates/${e.version}/approve`, { method: "POST" }))}>Tasdiqlash</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <strong>Tarix</strong>
        <ul>
          {o.history.map((h, i) => (
            <li key={i}>
              {new Date(h.createdAt).toLocaleString("uz-UZ")}: {ORDER_STATUS_LABEL_UZ[h.from as OrderStatus]} → <b>{ORDER_STATUS_LABEL_UZ[h.to as OrderStatus]}</b>
              {h.note ? ` — ${h.note}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
