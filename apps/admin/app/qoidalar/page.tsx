"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Rule { id: string; name: string; enabled: boolean; trigger: string; delayMinutes: number }

const TRIGGER_UZ: Record<string, string> = {
  ORDER_STATUS_CHANGED: "Buyurtma holati o'zgarganda",
  PROJECT_IDLE: "Loyiha harakatsiz qolganda",
  TASK_OVERDUE: "Vazifa muddati o'tganda",
  PAYMENT_RECEIVED: "To'lov tushganda",
  PAYMENT_DUE: "To'lov muddati kelganda",
};

/** Koordinator o'rnini bosuvchi qoidalar: rahbar yoqadi/o'chiradi va kechikishni sozlaydi */
export default function Rules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<Rule[]>("/automation/rules").then(setRules).catch((e) => setError(e instanceof ApiError ? e.message : "Xatolik"));
  }, []);
  useEffect(load, [load]);

  async function patch(id: string, body: Partial<Rule>) {
    try {
      await api(`/automation/rules/${id}`, { method: "PATCH", body });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Xatolik");
    }
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ marginTop: 0 }}>Avtomatik qoidalar</h1>
      <p className="muted">Har bir qoida: hodisa sodir bo&apos;lganda tizim o&apos;zi vazifa yaratadi, xodimni tayinlaydi yoki mijozga xabar yuboradi.</p>
      {error && <p className="error">{error}</p>}
      <table>
        <thead><tr><th>Qoida</th><th>Qachon</th><th>Kechikish, daqiqa</th><th>Holat</th></tr></thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{TRIGGER_UZ[r.trigger] ?? r.trigger}</td>
              <td>
                <input className="input" style={{ width: 110, height: 36 }} type="number" min={0} max={86400} defaultValue={r.delayMinutes}
                  onBlur={(e) => { const v = Math.max(0, Math.min(86400, Math.round(Number(e.target.value)))); if (v !== r.delayMinutes) void patch(r.id, { delayMinutes: v }); }} />
              </td>
              <td><button className={`btn ${r.enabled ? "btn-primary" : "btn-ghost"}`} style={{ minHeight: 34 }} onClick={() => patch(r.id, { enabled: !r.enabled })}>{r.enabled ? "Yoqilgan" : "O'chirilgan"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
