import Link from "next/link";
import { publicGet, type Page, type Product } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";

export default async function Home() {
  const popular = await publicGet<Page<Product>>("/catalog/products?pageSize=4");
  return (
    <>
      <section className="container" style={{ padding: "56px 24px 48px", display: "flex", flexWrap: "wrap", gap: 40, alignItems: "center" }}>
        <div style={{ flex: "1 1 420px" }}>
          <span className="badge">3D STUDIYA · REAL MEBELLAR</span>
          <h1 style={{ fontSize: 52, lineHeight: 1.05, margin: "18px 0 14px" }}>Bo&apos;sh uyingizni real mebellar bilan 3D&apos;da jihozlang</h1>
          <p className="muted" style={{ fontSize: 18, lineHeight: 1.55, maxWidth: 520 }}>
            Xona o&apos;lchamini kiriting, katalogdagi mebellarni qo&apos;ying, devor va pol rangini tanlang. Taxminiy narx darhol hisoblanadi.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
            <Link href="/studiya" className="btn btn-primary">3D Studiyani ochish</Link>
            <Link href="/katalog" className="btn btn-ghost">Katalogni ko&apos;rish</Link>
          </div>
        </div>
      </section>

      <section style={{ background: "#fff", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="container" style={{ padding: "56px 24px" }}>
          <h2 style={{ fontSize: 32, margin: "0 0 24px" }}>Qanday ishlaydi</h2>
          <ol className="grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {[
              ["Xonani yarating", "O'lchamlarni kiriting yoki uy chizmasini yuklang."],
              ["Mebellarni joylang", "Katalogdagi real mebellarni xonaga qo'ying va aylantiring."],
              ["Devor va polni tanlang", "Rang va qoplamani sinab ko'ring."],
              ["Buyurtma bering", "Menejer o'lchovga keladi va yakuniy narxni tasdiqlaydi."],
            ].map(([t, d], i) => (
              <li key={t} style={{ background: "var(--bg)", borderRadius: 22, padding: 24 }}>
                <strong style={{ display: "inline-flex", width: 40, height: 40, borderRadius: 12, background: "var(--ink)", color: "#fff", alignItems: "center", justifyContent: "center" }}>{i + 1}</strong>
                <h3 style={{ margin: "14px 0 6px" }}>{t}</h3>
                <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container" style={{ padding: "56px 24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
          <h2 style={{ fontSize: 32, margin: 0 }}>Ommabop mebellar</h2>
          <Link href="/katalog" style={{ fontWeight: 800 }}>Butun katalog →</Link>
        </div>
        {popular?.items.length ? (
          <div className="grid">{popular.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        ) : (
          <p className="muted">Katalog hozircha bo&apos;sh yoki server bilan aloqa yo&apos;q.</p>
        )}
      </section>
    </>
  );
}
