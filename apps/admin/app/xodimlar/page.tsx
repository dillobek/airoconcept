"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/components/Shell";

interface Staff { id: string; name: string; username: string | null; phone: string | null; role: string; region: string | null; isActive: boolean }

const ROLE_UZ: Record<string, string> = {
  OWNER: "Rahbar", MANAGER: "Menejer", DESIGNER: "Dizayner", MEASURER: "O'lchovchi", SUPPLY: "Ta'minotchi", PRODUCTION: "Sex",
  WAREHOUSE: "Omborchi", DRIVER: "Haydovchi", INSTALLER: "Montajchi", FOREMAN: "Prorab", ACCOUNTANT: "Buxgalter",
};

export default function StaffPage() {
  const me = useMe();
  const [rows, setRows] = useState<Staff[]>([]);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "MANAGER", region: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Staff[]>("/staff").then(setRows).catch((e) => setError(e instanceof ApiError ? e.message : "Xatolik"));
  }, []);
  useEffect(load, [load]);

  if (me?.role !== "OWNER") return <p>Bu bo&apos;lim faqat rahbar uchun.</p>;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/staff", { method: "POST", body: { ...form, region: form.region || undefined } });
      setForm({ name: "", username: "", password: "", role: "MANAGER", region: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Xatolik");
    }
  }

  async function toggle(s: Staff) {
    if (!window.confirm(s.isActive ? `${s.name} bloklansinmi? Barcha sessiyalari yopiladi.` : `${s.name} faollashtirilsinmi?`)) return;
    try {
      await api(`/staff/${s.id}`, { method: "PATCH", body: { isActive: !s.isActive } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Xatolik");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1000 }}>
      <h1 style={{ margin: 0 }}>Xodimlar</h1>
      {error && <p className="error">{error}</p>}
      <form className="card" onSubmit={add} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
        <div className="field"><label htmlFor="n">Ism</label><input id="n" className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="u">Username</label><input id="u" className="input" required minLength={3} maxLength={40} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} /></div>
        <div className="field"><label htmlFor="p">Vaqtinchalik parol</label><input id="p" className="input" type="password" required minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        <div className="field"><label htmlFor="r">Rol</label>
          <select id="r" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {Object.entries(ROLE_UZ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="h">Hudud</label><input id="h" className="input" maxLength={60} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>
        <button className="btn btn-primary">Qo&apos;shish</button>
      </form>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>Xodim CRM&apos;ga username va parol bilan kiradi. Parol ochiq saqlanmaydi; uni yangilash xodim kartasidan qilinadi.</p>
      <table>
        <thead><tr><th>Ism</th><th>Username</th><th>Rol</th><th>Hudud</th><th>Holat</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td><td>{s.username ?? "—"}</td><td>{ROLE_UZ[s.role] ?? s.role}</td><td>{s.region ?? "—"}</td>
              <td>{s.id === me.id ? "Siz" : <button className="btn btn-ghost" style={{ minHeight: 34 }} onClick={() => toggle(s)}>{s.isActive ? "Faol — bloklash" : "Bloklangan — faollashtirish"}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
