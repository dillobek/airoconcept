import Link from "next/link";
import { notFound } from "next/navigation";
import { formatSom } from "@ip/core/money";
import { publicGet, type Product } from "@/lib/api";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const p = await publicGet<Product>(`/catalog/products/${slug}`);
  if (!p) notFound();
  const img = p.images[0];
  return (
    <div className="container" style={{ padding: "40px 24px", display: "flex", flexWrap: "wrap", gap: 32 }}>
      <div style={{ flex: "1 1 480px" }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={p.name} style={{ width: "100%", maxHeight: 520, objectFit: "cover", borderRadius: 24 }} />
        ) : (
          <div style={{ height: 420, borderRadius: 24, background: "#e9e5dd" }} aria-hidden="true" />
        )}
      </div>
      <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 14 }}>
        <span className="muted" style={{ fontWeight: 700 }}>{p.category.name}</span>
        <h1 style={{ fontSize: 36, margin: 0 }}>{p.name}</h1>
        <span className="price" style={{ fontSize: 24 }}>{formatSom(p.priceTiyin)}</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {[["Eni", p.dimensionsCm.width], ["Chuqurligi", p.dimensionsCm.depth], ["Balandligi", p.dimensionsCm.height]].map(([k, v]) => (
            <div key={k} className="card" style={{ padding: 12 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{k}</div>
              <div style={{ fontWeight: 800 }}>{v} sm</div>
            </div>
          ))}
        </div>
        {p.variants.length > 0 && (
          <div>
            <strong>Variantlar:</strong>
            <ul>{p.variants.map((v) => <li key={v.id}>{v.name} — {formatSom(v.priceTiyin)}</li>)}</ul>
          </div>
        )}
        {/* Tavsif oddiy matn sifatida chiqadi (HTML talqin qilinmaydi) */}
        <p style={{ lineHeight: 1.6, whiteSpace: "pre-line" }}>{p.description}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/studiya?add=${encodeURIComponent(p.id)}`} className="btn btn-primary">Xonaga qo&apos;yish</Link>
          <Link href="/katalog" className="btn btn-ghost">Katalogga qaytish</Link>
        </div>
      </div>
    </div>
  );
}
