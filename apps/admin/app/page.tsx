"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ORDER_STATUSES, ORDER_STATUS_LABEL_UZ, type OrderStatus } from "@ip/core/order-state";
import { api, ApiError, type Page } from "@/lib/api";

interface Row {
  id: string;
  number: number;
  status: OrderStatus;
  address: string;
  updatedAt: string;
  client: { name: string; phone?: string };
  manager: { name: string } | null;
  measurer: { name: string } | null;
}

/** Buyurtmalar kanbani: har bir holat — alohida ustun */
export default function Orders() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Page<Row>>("/orders?pageSize=100")
      .then((p) => setRows(p.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Yuklab bo'lmadi"));
  }, []);

  const cols = ORDER_STATUSES.filter((s) => s !== "LEAD");
  return (
    <>
      <h1 style={{ marginTop: 0 }}>Buyurtmalar</h1>
      {error && <p className="error">{error}</p>}
      {!rows ? <p className="muted">Yuklanmoqda…</p> : (
        <div className="kanban">
          {cols.map((s) => {
            const items = rows.filter((r) => r.status === s);
            return (
              <section key={s} className="col" aria-label={ORDER_STATUS_LABEL_UZ[s]}>
                <strong style={{ fontSize: 13 }}>{ORDER_STATUS_LABEL_UZ[s]} <span className="muted">({items.length})</span></strong>
                {items.map((r) => (
                  <Link key={r.id} href={`/buyurtmalar/${r.id}`} className="card" style={{ textDecoration: "none", color: "var(--ink)", padding: 12 }}>
                    <strong>#{r.number} · {r.client.name}</strong>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{r.address}</div>
                    <div style={{ fontSize: 12, marginTop: 6 }}>
                      {r.manager ? `Menejer: ${r.manager.name}` : <span style={{ color: "var(--warn)" }}>Menejer tayinlanmagan</span>}
                    </div>
                  </Link>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
