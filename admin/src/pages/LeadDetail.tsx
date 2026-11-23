import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api, LEAD_STATUSES, TEMPERATURES } from "../api/client";
import { Badge, Button, Card } from "../components/ui";

const CONV_STATUS: Record<string, string> = {
  active: "Agent javob bermoqda",
  handoff: "Menejer qo'lida",
  closed: "Yopilgan (keraksiz suhbat)",
};

export function LeadDetail() {
  const id = Number(useParams().id);
  const qc = useQueryClient();

  const lead = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => (await api.GET("/api/v1/leads/{lead_id}", { params: { path: { lead_id: id } } })).data,
  });
  const conv = useQuery({
    queryKey: ["lead-conv", id],
    queryFn: async () =>
      (await api.GET("/api/v1/leads/{lead_id}/conversation", { params: { path: { lead_id: id } } })).data ?? null,
    refetchInterval: 10_000,
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) =>
      api.PATCH("/api/v1/leads/{lead_id}", { params: { path: { lead_id: id } }, body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead", id] }),
  });

  const setConvStatus = useMutation({
    mutationFn: async (status: "active" | "handoff" | "closed") =>
      api.PATCH("/api/v1/conversations/{conversation_id}/status", {
        params: { path: { conversation_id: conv.data!.id } },
        body: { status },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-conv", id] }),
  });

  const l = lead.data;
  if (lead.isLoading) return <div className="text-stone-500">Yuklanmoqda…</div>;
  if (!l) return <div>Lead topilmadi. <Link to="/leads" className="underline">Orqaga</Link></div>;

  const rows: [string, string | null | undefined][] = [
    ["Mijoz", l.client.name],
    ["Telefon", l.client.phone],
    ["Tuman", l.client.district],
    ["Mebel turi", l.furniture_type],
    ["O'lcham", l.dimensions],
    ["Byudjet", l.budget],
    ["Muddat", l.deadline],
    ["Og'riq nuqtasi", l.pain_points],
    ["Zamer vaqti", l.measurement_at],
    ["Zamer manzili", l.measurement_address],
  ];

  return (
    <div className="space-y-5">
      <Link to="/leads" className="text-sm text-stone-500 underline">← Leadlar</Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Lead #{l.id}</h1>
        <Badge value={l.temperature} label={TEMPERATURES[l.temperature]} />
        <span className="text-sm text-stone-500">{l.channel}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card className="space-y-4">
          <dl className="space-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-stone-500">{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
          <label className="block text-sm">
            <span className="mb-1 block text-stone-500">Bosqich</span>
            <select
              className="w-full rounded-lg border border-stone-300 px-3 py-2"
              value={l.status}
              onChange={(e) => setStatus.mutate(e.target.value)}
            >
              {Object.entries(LEAD_STATUSES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
        </Card>

        <Card className="flex flex-col">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Suhbat</h2>
              {conv.data && <p className="text-xs text-stone-500">{CONV_STATUS[conv.data.status]}</p>}
            </div>
            {conv.data && (
              <div className="flex gap-2">
                {conv.data.status !== "handoff" && (
                  <Button variant="ghost" onClick={() => setConvStatus.mutate("handoff")}>Men javob beraman</Button>
                )}
                {conv.data.status !== "active" && (
                  <Button onClick={() => setConvStatus.mutate("active")}>Agentga qaytarish</Button>
                )}
              </div>
            )}
          </div>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-lg bg-stone-50 p-3">
            {!conv.data && <p className="text-sm text-stone-500">Suhbat yo'q</p>}
            {conv.data?.messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-white shadow-sm" : "bg-walnut text-white"
                  }`}
                >
                  {m.text}
                  <div className={`mt-1 text-[10px] ${m.role === "user" ? "text-stone-400" : "text-stone-300"}`}>
                    {m.role === "user" ? "Mijoz" : m.role === "manager" ? "Menejer" : "Agent"} ·{" "}
                    {new Date(m.created_at).toLocaleString("uz-UZ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
