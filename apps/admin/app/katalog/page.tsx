"use client";

import { useCallback, useEffect, useState } from "react";
import { formatSom, parseSom } from "@ip/core/money";
import { api, ApiError, type Page, type Product } from "@/lib/api";

interface Category { id: string; slug: string; name: string }
type AdminProduct = Product & { isPublished: boolean };

const empty = { name: "", slug: "", categoryId: "", price: "", widthCm: 100, depthCm: 60, heightCm: 80, description: "", isPublished: false };

/** Faylni serverdan olingan imzolangan havola orqali to'g'ridan-to'g'ri saqlashga yuklaydi */
async function upload(file: File, purpose: "product_image" | "product_model_glb"): Promise<string> {
  const mime = purpose === "product_model_glb" ? "model/gltf-binary" : file.type;
  const u = await api<{ key: string; uploadUrl: string; headers: Record<string, string> }>("/files/uploads", { method: "POST", body: { purpose, mime, sizeBytes: file.size } });
  const res = await fetch(u.uploadUrl, { method: "PUT", headers: u.headers, body: file });
  if (!res.ok) throw new ApiError(res.status, "Fayl yuklanmadi");
  return u.key;
}

export default function Catalog() {
  const [items, setItems] = useState<AdminProduct[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState(empty);
  const [image, setImage] = useState<File | null>(null);
  const [model, setModel] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([api<Page<AdminProduct>>("/catalog/admin/products?pageSize=60"), api<Category[]>("/catalog/categories")])
      .then(([p, c]) => { setItems(p.items); setCats(c); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Xatolik"));
  }, []);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const priceTiyin = parseSom(form.price);
    if (priceTiyin === null) return setError("Narx noto'g'ri (masalan: 12 900 000)");
    setBusy(true);
    setError(null);
    try {
      const imageKeys = image ? [await upload(image, "product_image")] : [];
      const modelGlbKey = model ? await upload(model, "product_model_glb") : null;
      await api("/catalog/admin/products", {
        method: "POST",
        body: { name: form.name, slug: form.slug, categoryId: form.categoryId, priceTiyin, widthCm: form.widthCm, depthCm: form.depthCm, heightCm: form.heightCm, description: form.description, isPublished: form.isPublished, imageKeys, modelGlbKey },
      });
      setForm(empty);
      setImage(null);
      setModel(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(p: AdminProduct) {
    try {
      await api(`/catalog/admin/products/${p.id}`, { method: "PATCH", body: { isPublished: !p.isPublished } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Xatolik");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
      <h1 style={{ margin: 0 }}>Katalog</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="card" onSubmit={create} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div className="field"><label htmlFor="n">Nomi</label><input id="n" className="input" required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="s">Slug (lotin, -)</label><input id="s" className="input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} /></div>
        <div className="field"><label htmlFor="c">Toifa</label>
          <select id="c" className="input" required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Tanlang</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="p">Narx, so&apos;m</label><input id="p" className="input" required placeholder="12 900 000" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        {(["widthCm", "depthCm", "heightCm"] as const).map((k) => (
          <div className="field" key={k}><label htmlFor={k}>{k === "widthCm" ? "Eni, sm" : k === "depthCm" ? "Chuqurligi, sm" : "Balandligi, sm"}</label>
            <input id={k} className="input" type="number" min={1} max={2000} required value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} /></div>
        ))}
        <div className="field"><label htmlFor="img">Rasm (JPG/PNG/WebP, 10 MB)</label><input id="img" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImage(e.target.files?.[0] ?? null)} /></div>
        <div className="field"><label htmlFor="glb">3D model (GLB, 30 MB)</label><input id="glb" type="file" accept=".glb" onChange={(e) => setModel(e.target.files?.[0] ?? null)} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="d">Tavsif</label><textarea id="d" className="input" style={{ height: 90, paddingTop: 10 }} maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <label><input type="checkbox" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} /> Darhol sotuvga chiqarish</label>
        <button className="btn btn-primary" disabled={busy}>Mahsulot qo&apos;shish</button>
      </form>
      <table>
        <thead><tr><th>Nomi</th><th>Toifa</th><th>Narx</th><th>3D model</th><th>Holat</th></tr></thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.category.name}</td><td>{formatSom(p.priceTiyin)}</td>
              <td>{p.modelGlbUrl ? "bor" : <span style={{ color: "var(--warn)" }}>yo&apos;q</span>}</td>
              <td><button className="btn btn-ghost" style={{ minHeight: 34 }} onClick={() => togglePublish(p)}>{p.isPublished ? "Sotuvda — yashirish" : "Yashirin — chiqarish"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
