"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { CATALOG, CATEGORY_LABELS, MATERIALS, formatMoney, type CatalogItem, type Category, type PlacedItem } from "./catalog";
const starterItems: PlacedItem[] = [
  { ...CATALOG[0], placementId: "demo-base", x: -1.4, z: -1.95, rotation: 0, color: "#f7f7f2" },
  { ...CATALOG[1], placementId: "demo-wall", x: -0.35, z: -2.16, rotation: 0, color: "#f7f7f2" },
  { ...CATALOG[7], placementId: "demo-table", x: 0.65, z: 0.35, rotation: 0, color: "#af7f57" },
];

function Thumb({ item }: { item: CatalogItem }) {
  return <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-brand-soft"><Image src={item.image} alt="" fill sizes="64px" className="object-contain p-1" /></div>;
}

function PhotoRoom({ items, selectedId, onSelect }: { items: PlacedItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <div className="relative h-full w-full overflow-hidden bg-[#e5ded4]">
    <Image src="/studio/kitchen-room.png" alt="AIRO Studio real oshxona interyeri" fill priority sizes="(max-width: 1280px) 100vw, 60vw" className="object-cover" />
    <div className="absolute inset-x-[16%] bottom-[4%] top-[22%]">
      {items.map((item, index) => {
        const isTall = item.shape === "tall";
        const isSofa = item.shape === "sofa";
        const width = isTall ? 15 : isSofa ? 38 : item.shape === "table" ? 32 : 18;
        const left = Math.max(3, Math.min(78, 42 + item.x * 11 + (index % 2) * 2));
        const bottom = Math.max(0, 5 - item.z * 5);
        return <button key={item.placementId} onClick={() => onSelect(item.placementId)} aria-label={item.name} className={`absolute rounded-lg transition ${item.placementId === selectedId ? "ring-2 ring-brand ring-offset-2" : "hover:scale-[1.03]"}`} style={{ width: `${width}%`, left: `${left}%`, bottom: `${bottom}%`, transform: `rotate(${item.rotation}rad)` }}><Image src={item.image} alt={item.name} width={700} height={700} sizes="250px" className="h-auto w-full drop-shadow-xl" /></button>;
      })}
    </div>
    <div className="absolute bottom-4 left-4 rounded-full bg-white/95 px-3 py-2 text-xs font-semibold text-brand-deep shadow-sm">Real interyer ko‘rinishi</div>
  </div>;
}

function TopDownRoom({ items, selectedId, onSelect }: { items: PlacedItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <div className="relative mx-auto aspect-[1.27] w-full max-w-[620px] overflow-hidden rounded-md border-[10px] border-slate-300 bg-[#eef5f3] shadow-inner">
    <div className="absolute -top-1 left-[24%] h-2 w-[25%] bg-brand" /><div className="absolute bottom-0 right-[15%] h-2 w-[16%] bg-amber-500" />
    {items.map((item) => <button key={item.placementId} onClick={() => onSelect(item.placementId)} aria-label={item.name} className={`absolute rounded-sm border text-[9px] font-semibold text-slate-700 shadow-sm transition ${item.placementId === selectedId ? "border-brand ring-2 ring-brand/40" : "border-slate-400"}`} style={{ left: `${50 + item.x * 10}%`, top: `${51 + item.z * 12}%`, width: `${Math.max(35, item.width * 43)}px`, height: `${Math.max(26, item.depth * 52)}px`, backgroundColor: item.color, transform: `rotate(${item.rotation}rad)` }}>{item.name.split(" ")[0]}</button>)}
  </div>;
}

export default function StudioClient() {
  const [category, setCategory] = useState<Category>("oshxona");
  const [items, setItems] = useState<PlacedItem[]>(starterItems);
  const [selectedId, setSelectedId] = useState<string | null>(starterItems[0].placementId);
  const [is3D, setIs3D] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const selected = items.find((item) => item.placementId === selectedId) ?? null;
  const total = useMemo(() => items.reduce((sum, item) => sum + item.price, 0), [items]);
  const addItem = (item: CatalogItem) => {
    const newItem: PlacedItem = { ...item, placementId: `${item.id}-${Date.now()}`, x: 0.6 + (items.length % 3) * 0.55, z: -0.25 + (items.length % 2) * 0.7, rotation: 0, color: item.shape === "sofa" ? "#5d8c87" : "#f7f7f2" };
    setItems((current) => [...current, newItem]); setSelectedId(newItem.placementId); setSubmitted(false);
  };
  const changeSelected = (patch: Partial<PlacedItem>) => selected && setItems((current) => current.map((item) => item.placementId === selected.placementId ? { ...item, ...patch } : item));
  const removeSelected = () => { if (!selected) return; setItems((current) => current.filter((item) => item.placementId !== selected.placementId)); setSelectedId(null); setSubmitted(false); };
  const visibleCatalog = CATALOG.filter((item) => item.category === category);
  return <section className="studio-page bg-[#f4faf8] pb-10 pt-6 text-slate-800 sm:pt-8">
    <div className="mx-auto max-w-[1500px] px-4 sm:px-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">AIRO Studio</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-deep sm:text-3xl">Xonangizni o‘zingiz jihozlang</h1><p className="mt-1 text-sm text-slate-500">Karobka xonaga mebel qo‘shing, materialni tanlang va taxminiy hisobni oling.</p></div>
        <div className="flex rounded-xl border border-brand/15 bg-white p-1 shadow-sm"><button onClick={() => setIs3D(false)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${!is3D ? "bg-brand-soft text-brand-deep" : "text-slate-500"}`}>2D ko‘rinish</button><button onClick={() => setIs3D(true)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${is3D ? "bg-brand text-white" : "text-slate-500"}`}>3D ko‘rinish</button></div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)_300px]">
        <aside className="rounded-2xl border border-brand/15 bg-white p-4 shadow-sm xl:sticky xl:top-5 xl:h-[calc(100vh-9rem)]">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-brand-deep">Mebel katalogi</h2><span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-bold text-brand-deep">8 demo</span></div>
          <div className="mb-4 flex flex-wrap gap-1">{(Object.keys(CATEGORY_LABELS) as Category[]).map((key) => <button key={key} onClick={() => setCategory(key)} className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${category === key ? "bg-brand text-white" : "bg-brand-soft text-brand-deep hover:bg-brand/15"}`}>{CATEGORY_LABELS[key]}</button>)}</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{visibleCatalog.map((item) => <button key={item.id} onClick={() => addItem(item)} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2 text-left transition hover:border-brand hover:bg-brand-soft/45"><Thumb item={item} /><span className="min-w-0"><b className="block text-sm text-slate-800">{item.name}</b><span className="mt-0.5 block text-xs text-slate-500">{item.description}</span><span className="mt-1 block text-xs font-bold text-brand-deep">+ Qo‘shish</span></span></button>)}</div>
          <p className="mt-4 rounded-xl bg-[#fff7e8] p-3 text-xs leading-5 text-slate-600">Bu demoda fotoreal mebel renderlari ishlatilgan. Keyin AIRO katalogidagi o‘z mahsulotlaringiz — rasm, narx, o‘lcham va materiallari bilan shu yerga kiritiladi.</p>
        </aside>
        <main className="min-w-0 rounded-2xl border border-brand/15 bg-white p-3 shadow-sm sm:p-5"><div className="mb-3 flex items-center justify-between"><div><b className="text-sm text-brand-deep">Oshxona karobkasi</b><span className="ml-2 text-xs text-slate-500">4.2 × 3.6 × 2.8 m</span></div><span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-bold text-brand-deep">{items.length} element</span></div><div className="h-[430px] overflow-hidden rounded-xl border border-brand/10 bg-[#d9f1ee] sm:h-[570px]">{is3D ? <PhotoRoom items={items} selectedId={selectedId} onSelect={setSelectedId} /> : <div className="grid h-full place-items-center p-6"><TopDownRoom items={items} selectedId={selectedId} onSelect={setSelectedId} /></div>}</div><p className="mt-3 text-center text-xs text-slate-500">{is3D ? "Mebel ustiga bosing, materialini va joylashuvini o‘ng paneldan o‘zgartiring." : "Element ustiga bosing va o‘ng paneldan tahrirlang."}</p></main>
        <aside className="rounded-2xl border border-brand/15 bg-white p-5 shadow-sm xl:sticky xl:top-5 xl:h-fit"><h2 className="font-semibold text-brand-deep">{selected ? "Tanlangan modul" : "Mebel tanlanmagan"}</h2>{selected ? <div className="mt-4"><div className="rounded-xl bg-brand-soft p-4"><b className="block">{selected.name}</b><span className="mt-1 block text-sm text-slate-600">{selected.width} × {selected.depth} × {selected.height} m</span><span className="mt-2 block text-sm font-bold text-brand-deep">{formatMoney(selected.price)}</span></div><p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Material</p><div className="flex flex-wrap gap-2">{MATERIALS.map((material) => <button title={material.name} aria-label={material.name} key={material.color} onClick={() => changeSelected({ color: material.color })} className={`h-8 w-8 rounded-full border-2 ${selected.color === material.color ? "border-brand ring-2 ring-brand/25" : "border-white"}`} style={{ backgroundColor: material.color }} />)}</div><p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">Joylashuv</p><div className="grid grid-cols-3 gap-2"><span /><button onClick={() => changeSelected({ z: selected.z - 0.2 })} className="rounded-lg bg-brand-soft py-2 text-brand-deep">↑</button><span /><button onClick={() => changeSelected({ x: selected.x - 0.2 })} className="rounded-lg bg-brand-soft py-2 text-brand-deep">←</button><button onClick={() => changeSelected({ rotation: selected.rotation + Math.PI / 2 })} className="rounded-lg bg-brand-soft py-2 text-xs font-bold text-brand-deep">90°</button><button onClick={() => changeSelected({ x: selected.x + 0.2 })} className="rounded-lg bg-brand-soft py-2 text-brand-deep">→</button><span /><button onClick={() => changeSelected({ z: selected.z + 0.2 })} className="rounded-lg bg-brand-soft py-2 text-brand-deep">↓</button><span /></div><button onClick={removeSelected} className="mt-4 w-full rounded-lg border border-red-200 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Olib tashlash</button></div> : <p className="mt-3 text-sm leading-6 text-slate-500">Katalogdan modul qo‘shing yoki xona ichidagi mebelni bosing.</p>}
          <div className="mt-6 border-t border-slate-200 pt-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Taxminiy hisob</p><b className="mt-1 block text-2xl text-brand-deep">{formatMoney(total)}</b><p className="mt-1 text-xs text-slate-500">Yetkazish va montajdan oldingi dastlabki narx.</p><button onClick={() => setSubmitted(true)} className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition ${submitted ? "bg-brand-deep" : "bg-brand hover:bg-brand-deep"}`}>{submitted ? "Dizaynerga yuborildi ✓" : "Dizaynerga yuborish"}</button>{submitted && <p className="mt-2 text-center text-xs font-medium text-brand-deep">Loyiha ko‘rib chiqish uchun tayyorlandi.</p>}</div>
        </aside>
      </div>
    </div>
  </section>;
}
