"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ORDER_STATUS_LABEL_UZ, type OrderStatus } from "@ip/core/order-state";
import { api, ApiError } from "@/lib/api";

interface Proj {
  id: string;
  number: number;
  type: string;
  createdAt: string;
  home: { title: string };
  orders: { id: string; number: number; status: OrderStatus }[];
}

export default function Loyihalarim() {
  const router = useRouter();
  const [items, setItems] = useState<Proj[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Proj[]>("/projects/mine")
      .then(setItems)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/kirish?next=/loyihalarim");
        else setError("Yuklab bo'lmadi");
      });
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.replace("/");
  }

  return (
    <div className="container" style={{ padding: "40px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Loyihalarim</h1>
        <button className="btn btn-ghost" onClick={logout}>Chiqish</button>
      </div>
      {error && <p className="error">{error}</p>}
      {!items ? <p className="muted">Yuklanmoqda…</p> : items.length === 0 ? (
        <p>Hali loyiha yo&apos;q. <Link href="/studiya">3D Studiyada boshlang →</Link></p>
      ) : (
        <div className="grid">
          {items.map((p) => (
            <div key={p.id} className="card">
              <strong>{p.home.title}</strong> <span className="muted">· loyiha #{p.number}</span>
              <ul style={{ paddingLeft: 18 }}>
                {p.orders.length === 0 ? <li className="muted">Buyurtma berilmagan</li> : p.orders.map((o) => (
                  <li key={o.id}>Buyurtma #{o.number}: <span className="badge">{ORDER_STATUS_LABEL_UZ[o.status]}</span></li>
                ))}
              </ul>
              <Link href="/studiya">3D&apos;da ochish →</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
