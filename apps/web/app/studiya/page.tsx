"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatSom } from "@ip/core/money";
import type { RoomScene, SceneItem } from "@ip/core/scene";
import { api, ApiError, type Page, type Product } from "@/lib/api";
import type { ItemProduct } from "@/components/Room3D";

const Room3D = dynamic(() => import("@/components/Room3D"), { ssr: false, loading: () => <div style={{ height: 480, borderRadius: 24, background: "#e9e5dd" }} /> });

interface ProjectSummary { id: string; number: number; home: { title: string } }
interface ProjectFull {
  id: string;
  number: number;
  home: { rooms: { id: string; name: string; scene: RoomScene }[] };
  orders: { id: string; number: number; status: string }[];
}
interface Material { id: string; kind: string; name: string; colorHex: string | null; pricePerM2Tiyin: number }
interface EstimatePreview { totalTiyin: number; lines: { title: string; totalTiyin: number }[] }

const uid = () => Math.random().toString(36).slice(2, 12);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function Studio() {
  const router = useRouter();
  const sp = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectFull | null>(null);
  const [roomIdx, setRoomIdx] = useState(0);
  const [scene, setScene] = useState<RoomScene | null>(null);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<EstimatePreview | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsProject, setNeedsProject] = useState(false);
  const [newRoom, setNewRoom] = useState({ title: "Mening uyim", name: "Mehmonxona", lengthM: 5, widthM: 4.2, heightM: 2.8 });
  const [address, setAddress] = useState("");
  const [ordered, setOrdered] = useState<number | null>(null);

  const productsMap = useMemo(() => new Map<string, ItemProduct>(catalog.map((p) => [p.id, p])), [catalog]);

  const loadProject = useCallback(async (id: string) => {
    const p = await api<ProjectFull>(`/projects/${id}`);
    setProject(p);
    setScene(p.home.rooms[0]?.scene ?? null);
    setRoomIdx(0);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await api("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return router.replace("/kirish?next=/studiya");
      }
      try {
        const [mine, cat, mats] = await Promise.all([
          api<ProjectSummary[]>("/projects/mine"),
          api<Page<Product>>("/catalog/products?pageSize=60"),
          api<Material[]>("/catalog/materials"),
        ]);
        setCatalog(cat.items);
        setMaterials(mats);
        if (mine.length === 0) setNeedsProject(true);
        else await loadProject(mine[0]!.id);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Yuklab bo'lmadi");
      }
    })();
  }, [router, loadProject]);

  // Katalogdan "Xonaga qo'yish" bilan kelgan mahsulot
  useEffect(() => {
    const add = sp.get("add");
    if (add && scene && productsMap.has(add) && !scene.items.some((i) => i.productId === add)) addItem(add);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene !== null, productsMap.size]);

  function update(next: RoomScene) {
    setScene(next);
    setDirty(true);
    setEstimate(null);
  }

  function addItem(productId: string) {
    if (!scene) return;
    const item: SceneItem = { id: uid(), productId, x: scene.room.lengthM / 2, z: scene.room.widthM / 2, rotationDeg: 0 };
    update({ ...scene, items: [...scene.items, item] });
    setSelected(item.id);
  }

  function patchSelected(p: Partial<SceneItem>) {
    if (!scene || !selected) return;
    update({ ...scene, items: scene.items.map((i) => (i.id === selected ? { ...i, ...p } : i)) });
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ projectId: string }>("/projects", {
        method: "POST",
        body: { homeTitle: newRoom.title, rooms: [{ name: newRoom.name, lengthM: newRoom.lengthM, widthM: newRoom.widthM, heightM: newRoom.heightM }] },
      });
      setNeedsProject(false);
      await loadProject(r.projectId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!project || !scene) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/projects/${project.id}/rooms/${project.home.rooms[roomIdx]!.id}/scene`, { method: "PUT", body: scene });
      setDirty(false);
      setEstimate(await api<EstimatePreview>(`/projects/${project.id}/estimate-preview`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Saqlanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function order(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      if (dirty) await save();
      const r = await api<{ number: number }>("/orders", { method: "POST", body: { projectId: project.id, address } });
      setOrdered(r.number);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Buyurtma berilmadi");
    } finally {
      setBusy(false);
    }
  }

  const walls = materials.filter((m) => m.kind === "WALL_PAINT");
  const floors = materials.filter((m) => m.kind === "FLOOR");
  const wallColor = walls.find((m) => m.id === scene?.wallColorId)?.colorHex ?? "#ece8e1";
  const floorColor = floors.find((m) => m.id === scene?.floorMaterialId)?.colorHex ?? "#cfcac1";
  const sel = scene?.items.find((i) => i.id === selected) ?? null;

  if (needsProject)
    return (
      <div className="container" style={{ maxWidth: 560, padding: "48px 24px" }}>
        <h1>Bo&apos;sh xona yaratish</h1>
        {error && <p className="error">{error}</p>}
        <form onSubmit={createProject} className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field"><label htmlFor="t">Uy nomi</label><input id="t" className="input" maxLength={80} value={newRoom.title} onChange={(e) => setNewRoom({ ...newRoom, title: e.target.value })} /></div>
          <div className="field"><label htmlFor="n">Xona</label><input id="n" className="input" maxLength={60} value={newRoom.name} onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
            {(["lengthM", "widthM", "heightM"] as const).map((k) => (
              <div className="field" key={k}>
                <label htmlFor={k}>{k === "lengthM" ? "Uzunlik, m" : k === "widthM" ? "Kenglik, m" : "Shift, m"}</label>
                <input id={k} className="input" type="number" step="0.1" min={k === "heightM" ? 1.8 : 0.5} max={k === "heightM" ? 10 : 100} value={newRoom[k]} onChange={(e) => setNewRoom({ ...newRoom, [k]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
          <button className="btn btn-primary" disabled={busy}>3D&apos;da ochish</button>
        </form>
      </div>
    );

  if (!project || !scene) return <div className="container" style={{ padding: 48 }}>{error ? <p className="error">{error}</p> : "Yuklanmoqda…"}</div>;

  return (
    <div className="container" style={{ padding: "20px 24px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <aside className="card" style={{ flex: "1 1 260px", maxWidth: 300, display: "flex", flexDirection: "column", gap: 8, maxHeight: 640, overflow: "auto" }}>
        <strong>Mebel katalogi</strong>
        {catalog.map((p) => (
          <button key={p.id} onClick={() => addItem(p.id)} className="card" style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", cursor: "pointer", padding: 8 }}>
            {p.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.images[0]} alt="" style={{ width: 56, height: 44, objectFit: "cover", borderRadius: 8 }} />
            ) : <span style={{ width: 56, height: 44, borderRadius: 8, background: "#efebe4" }} />}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 800, fontSize: 13 }}>{p.name}</span>
              <span className="price" style={{ fontSize: 12 }}>{formatSom(p.priceTiyin)}</span>
            </span>
            <span aria-hidden="true">+</span>
          </button>
        ))}
      </aside>

      <section style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong style={{ fontSize: 20, flex: 1 }}>Loyiha #{project.number}</strong>
          {project.home.rooms.map((r, i) => (
            <button key={r.id} className={`btn ${i === roomIdx ? "btn-dark" : "btn-ghost"}`} style={{ minHeight: 38 }} onClick={() => { setRoomIdx(i); setScene(r.scene); setSelected(null); }}>{r.name}</button>
          ))}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div style={{ height: 480 }}>
          <Room3D scene={scene} products={productsMap} wallColor={wallColor} floorColor={floorColor} selectedId={selected} onSelect={setSelected} />
        </div>
        {sel && (
          <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <strong style={{ flex: "1 1 160px" }}>{productsMap.get(sel.productId)?.name}</strong>
            <label>X <input type="range" min={0} max={scene.room.lengthM} step={0.05} value={sel.x} onChange={(e) => patchSelected({ x: clamp(Number(e.target.value), 0, scene.room.lengthM) })} /></label>
            <label>Z <input type="range" min={0} max={scene.room.widthM} step={0.05} value={sel.z} onChange={(e) => patchSelected({ z: clamp(Number(e.target.value), 0, scene.room.widthM) })} /></label>
            <button className="btn btn-ghost" style={{ minHeight: 38 }} onClick={() => patchSelected({ rotationDeg: ((sel.rotationDeg + 90 + 180) % 360) - 180 })}>Aylantirish 90°</button>
            <button className="btn" style={{ minHeight: 38, background: "#f8e6dc", color: "#8a3f1e" }} onClick={() => { update({ ...scene, items: scene.items.filter((i) => i.id !== sel.id) }); setSelected(null); }}>O&apos;chirish</button>
          </div>
        )}
      </section>

      <aside style={{ flex: "1 1 280px", maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="card">
          <strong>Devor rangi</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {walls.map((m) => (
              <button key={m.id} aria-label={m.name} title={m.name} onClick={() => update({ ...scene, wallColorId: m.id })} style={{ width: 40, height: 40, borderRadius: 10, border: scene.wallColorId === m.id ? "3px solid var(--accent)" : "1px solid #ccc", background: m.colorHex ?? "#eee", cursor: "pointer" }} />
            ))}
          </div>
          <strong style={{ display: "block", marginTop: 12 }}>Pol</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {floors.map((m) => (
              <button key={m.id} aria-label={m.name} title={m.name} onClick={() => update({ ...scene, floorMaterialId: m.id })} style={{ width: 40, height: 40, borderRadius: 10, border: scene.floorMaterialId === m.id ? "3px solid var(--accent)" : "1px solid #ccc", background: m.colorHex ?? "#eee", cursor: "pointer" }} />
            ))}
          </div>
        </div>
        <div className="card" style={{ background: "var(--ink)", color: "#fff" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#c9c5bc" }}>TAXMINIY NARX</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{estimate ? formatSom(estimate.totalTiyin) : "—"}</div>
          <button className="btn" style={{ width: "100%", marginTop: 10, background: "#fff", color: "var(--ink)" }} onClick={save} disabled={busy}>{dirty ? "Saqlash va hisoblash" : "Narxni yangilash"}</button>
        </div>
        {ordered ? (
          <div className="card"><strong>Buyurtma #{ordered} qabul qilindi.</strong> <Link href="/loyihalarim">Holatini kuzatish →</Link></div>
        ) : project.orders.some((o) => o.status !== "CANCELLED" && o.status !== "COMPLETED") ? (
          <div className="card">Bu loyiha bo&apos;yicha buyurtma berilgan. <Link href="/loyihalarim">Holati →</Link></div>
        ) : (
          <form className="card" onSubmit={order} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="field"><label htmlFor="addr">Manzil</label><input id="addr" className="input" minLength={5} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} required /></div>
            <button className="btn btn-primary" disabled={busy || scene.items.length === 0}>Buyurtma berish</button>
            <span className="muted" style={{ fontSize: 12 }}>Yakuniy narx o&apos;lchovdan keyin menejer tomonidan tasdiqlanadi.</span>
          </form>
        )}
      </aside>
    </div>
  );
}

export default function StudiyaPage() {
  return (
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  );
}
