"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/components/Shell";

interface Task {
  id: string;
  title: string;
  role: string;
  dueAt: string;
  status: string;
  escalatedAt: string | null;
  order: { id: string; number: number; address: string } | null;
  assignee: { name: string } | null;
}

export default function Tasks() {
  const me = useMe();
  const [all, setAll] = useState(false);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Task[]>(`/tasks?status=OPEN&all=${all}`).then(setTasks).catch((e) => setError(e instanceof ApiError ? e.message : "Xatolik"));
  }, [all]);
  useEffect(load, [load]);

  async function done(id: string) {
    try {
      await api(`/tasks/${id}`, { method: "PATCH", body: { status: "DONE" } });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Xatolik");
    }
  }

  const manager = me && ["OWNER", "MANAGER"].includes(me.role);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ marginTop: 0, flex: 1 }}>{all ? "Barcha ochiq vazifalar" : "Vazifalarim"}</h1>
        {manager && <label><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Hammasini ko&apos;rsatish</label>}
      </div>
      {error && <p className="error">{error}</p>}
      {!tasks ? <p className="muted">Yuklanmoqda…</p> : tasks.length === 0 ? <p>Ochiq vazifa yo&apos;q 👍</p> : (
        <table>
          <thead><tr><th>Vazifa</th><th>Buyurtma</th><th>Muddat</th>{all && <th>Mas&apos;ul</th>}<th /></tr></thead>
          <tbody>
            {tasks.map((t) => {
              const overdue = new Date(t.dueAt) < new Date();
              return (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td>{t.order ? <Link href={`/buyurtmalar/${t.order.id}`}>#{t.order.number}</Link> : "—"}</td>
                  <td style={{ color: overdue ? "#8a3f1e" : undefined, fontWeight: overdue ? 800 : 400 }}>{new Date(t.dueAt).toLocaleString("uz-UZ")}</td>
                  {all && <td>{t.assignee?.name ?? <span style={{ color: "var(--warn)" }}>tayinlanmagan</span>}</td>}
                  <td><button className="btn btn-primary" style={{ minHeight: 34 }} onClick={() => done(t.id)}>Bajarildi</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
