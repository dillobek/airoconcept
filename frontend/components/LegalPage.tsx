export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-semibold text-walnut">{title}</h1>
      <div className="mt-8 space-y-4 leading-relaxed text-stone-700">{children}</div>
    </main>
  );
}
