import Link from "next/link";
import { publicGet, type Page, type Product } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";

const SLUG = /^[a-z0-9-]{1,80}$/;

export default async function Katalog({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const params = new URLSearchParams({ pageSize: "24" });
  if (sp.category && SLUG.test(sp.category)) params.set("category", sp.category);
  if (sp.q) params.set("q", sp.q.slice(0, 80));
  const page = Math.max(1, Math.min(1000, Number(sp.page) || 1));
  params.set("page", String(page));

  const [cats, data] = await Promise.all([
    publicGet<{ slug: string; name: string }[]>("/catalog/categories"),
    publicGet<Page<Product>>(`/catalog/products?${params.toString()}`),
  ]);

  return (
    <div className="container" style={{ padding: "40px 24px" }}>
      <h1 style={{ fontSize: 40, margin: "0 0 6px" }}>Katalog</h1>
      <p className="muted" style={{ margin: "0 0 20px" }}>Har bir mahsulotning real 3D modeli bor — xonangizga qo&apos;yib ko&apos;ring.</p>
      <form method="get" style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input className="input" name="q" defaultValue={sp.q ?? ""} placeholder="Mebel nomi" aria-label="Qidirish" maxLength={80} style={{ flex: "1 1 260px" }} />
        {sp.category && SLUG.test(sp.category) ? <input type="hidden" name="category" value={sp.category} /> : null}
        <button className="btn btn-dark" type="submit">Qidirish</button>
      </form>
      <nav aria-label="Toifalar" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        <Link href="/katalog" className="badge" style={{ background: !sp.category ? "var(--ink)" : undefined, color: !sp.category ? "#fff" : undefined }}>Barchasi</Link>
        {cats?.map((c) => (
          <Link key={c.slug} href={`/katalog?category=${c.slug}`} className="badge" style={{ background: sp.category === c.slug ? "var(--ink)" : undefined, color: sp.category === c.slug ? "#fff" : undefined }}>
            {c.name}
          </Link>
        ))}
      </nav>
      {data?.items.length ? (
        <>
          <div className="grid">{data.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            {page > 1 && <Link className="btn btn-ghost" href={`/katalog?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page - 1) })}`}>← Oldingi</Link>}
            {data.total > page * data.pageSize && <Link className="btn btn-ghost" href={`/katalog?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page + 1) })}`}>Keyingi →</Link>}
          </div>
        </>
      ) : (
        <p className="muted">Mahsulot topilmadi.</p>
      )}
    </div>
  );
}
