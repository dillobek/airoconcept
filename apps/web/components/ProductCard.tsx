import Link from "next/link";
import { formatSom } from "@ip/core/money";
import type { Product } from "@/lib/api";

export function ProductCard({ p }: { p: Product }) {
  const img = p.images[0];
  return (
    <div className="card" style={{ padding: 12, display: "flex", flexDirection: "column" }}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={p.name} style={{ width: "100%", height: 190, objectFit: "cover", borderRadius: 14 }} />
      ) : (
        <div style={{ height: 190, borderRadius: 14, background: "#efebe4" }} aria-hidden="true" />
      )}
      <div style={{ padding: "14px 6px 6px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
          {p.category.name} · {p.dimensionsCm.width}×{p.dimensionsCm.depth} sm
        </span>
        <Link href={`/katalog/${p.slug}`} style={{ fontSize: 17, fontWeight: 800, color: "var(--ink)", textDecoration: "none" }}>{p.name}</Link>
        <span className="price">{formatSom(p.priceTiyin)}</span>
      </div>
      <Link href={`/studiya?add=${encodeURIComponent(p.id)}`} className="btn btn-primary" style={{ marginTop: 8 }}>Xonaga qo&apos;yish</Link>
    </div>
  );
}
