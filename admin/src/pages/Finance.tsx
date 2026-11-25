import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useMe } from "../auth";
import {
  apiJson,
  formatMoney,
  type Debt,
  type FinanceDashboard,
  type FinanceEntry,
  type FinanceOrder,
  type FinanceReport,
} from "../api/client";
import { Badge, Button, Card, ErrorBox, Input } from "../components/ui";

const selectClass = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm";
const emptyEntry = { kind: "income", amount: "", category: "", description: "", order_id: "", debt_id: "", payment_method: "cash" };
const emptyOrder = { customer_name: "", title: "", total_amount: "", due_date: "", lead_id: "" };
const emptyDebt = { direction: "receivable", counterparty: "", amount: "", due_date: "", order_id: "", description: "" };

type Action = { url: string; method?: "POST" | "PATCH"; body?: unknown };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm"><span className="text-stone-600">{label}</span>{children}</label>;
}

function MetricCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-stone-900";
  return <Card><div className="text-xs uppercase tracking-wide text-stone-500">{label}</div><div className={`mt-2 text-xl font-semibold ${color}`}>{value}</div></Card>;
}

function entryStatus(status: FinanceEntry["status"]) {
  return status === "approved" ? "Tasdiqlangan" : status === "rejected" ? "Rad etilgan" : "Kutilmoqda";
}

export function Finance() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("month");
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [debtForm, setDebtForm] = useState(emptyDebt);

  const overview = useQuery({
    queryKey: ["finance-overview", period],
    queryFn: async () => {
      const query = `?period=${period}`;
      const [dashboard, entries, orders, debts, report] = await Promise.all([
        apiJson<FinanceDashboard>(`/api/v1/finance/dashboard${query}`),
        apiJson<FinanceEntry[]>("/api/v1/finance/entries?limit=100"),
        apiJson<FinanceOrder[]>("/api/v1/finance/orders"),
        apiJson<Debt[]>("/api/v1/finance/debts"),
        apiJson<FinanceReport>(`/api/v1/finance/report${query}`),
      ]);
      return { dashboard, entries, orders, debts, report };
    },
  });

  const action = useMutation({
    mutationFn: ({ url, method = "POST", body }: Action) => apiJson(url, { method, body: body ? JSON.stringify(body) : undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-overview"] }),
  });

  const canWriteFinance = me?.role === "owner" || me?.role === "accountant";
  const canWriteOrders = me?.role === "owner" || me?.role === "manager";
  const isOwner = me?.role === "owner";
  const data = overview.data;

  async function submitEntry(event: FormEvent) {
    event.preventDefault();
    try {
      await action.mutateAsync({
        url: "/api/v1/finance/entries",
        body: {
          ...entryForm,
          amount: entryForm.amount,
          order_id: entryForm.order_id ? Number(entryForm.order_id) : null,
          debt_id: entryForm.debt_id ? Number(entryForm.debt_id) : null,
        },
      });
      setEntryForm(emptyEntry);
    } catch {
      // Xato mutation holati orqali ko'rsatiladi.
    }
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault();
    try {
      await action.mutateAsync({
      url: "/api/v1/finance/orders",
      body: {
        ...orderForm,
        lead_id: orderForm.lead_id ? Number(orderForm.lead_id) : null,
        due_date: orderForm.due_date || null,
      },
      });
      setOrderForm(emptyOrder);
    } catch {
      // Xato mutation holati orqali ko'rsatiladi.
    }
  }

  async function submitDebt(event: FormEvent) {
    event.preventDefault();
    try {
      await action.mutateAsync({
      url: "/api/v1/finance/debts",
      body: {
        ...debtForm,
        order_id: debtForm.order_id ? Number(debtForm.order_id) : null,
        due_date: debtForm.due_date || null,
      },
      });
      setDebtForm(emptyDebt);
    } catch {
      // Xato mutation holati orqali ko'rsatiladi.
    }
  }

  if (overview.isLoading) return <div className="text-stone-500">Moliya yuklanmoqda…</div>;
  if (overview.error) return <ErrorBox text={(overview.error as Error).message} />;
  if (!data) return null;

  const pendingEntries = data.entries.filter((entry) => entry.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Moliya</h1><p className="mt-1 text-sm text-stone-500">Kirim-chiqim, qarz, buyurtma va hisobotlar</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Hisobot davri">
            <select className={selectClass} value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="day">Kunlik</option><option value="week">Haftalik</option><option value="month">Oylik</option>
            </select>
          </Field>
          <a className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium" href={`/api/v1/finance/export.xlsx?period=${period}`}>Excel</a>
          <a className="rounded-lg bg-walnut px-4 py-2 text-sm font-medium text-white" href={`/api/v1/finance/export.pdf?period=${period}`}>PDF</a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Kirim" value={formatMoney(data.dashboard.income)} tone="good" />
        <MetricCard label="Chiqim" value={formatMoney(data.dashboard.expense)} tone="bad" />
        <MetricCard label="Foyda" value={formatMoney(data.dashboard.profit)} tone={Number(data.dashboard.profit) >= 0 ? "good" : "bad"} />
        <MetricCard label="Tasdiq kutilmoqda" value={String(data.dashboard.pending_approvals)} />
        <MetricCard label="Olinadigan qarz" value={formatMoney(data.dashboard.receivable)} />
        <MetricCard label="Beriladigan qarz" value={formatMoney(data.dashboard.payable)} />
        <MetricCard label="Faol buyurtmalar" value={String(data.dashboard.active_orders)} />
        <MetricCard label="Davr" value={`${data.dashboard.period_start} — ${data.dashboard.period_end}`} />
      </div>

      <ErrorBox text={action.error ? (action.error as Error).message : null} />

      {canWriteFinance && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Kirim yoki chiqim kiritish</h2>
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={submitEntry}>
            <Field label="Turi"><select className={selectClass} value={entryForm.kind} onChange={(e) => setEntryForm({ ...entryForm, kind: e.target.value })}><option value="income">Kirim</option><option value="expense">Chiqim</option></select></Field>
            <Field label="Summa"><Input type="number" min="0.01" step="0.01" required value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} /></Field>
            <Field label="Kategoriya"><Input required value={entryForm.category} onChange={(e) => setEntryForm({ ...entryForm, category: e.target.value })} placeholder="Avans, material…" /></Field>
            <Field label="To'lov usuli"><select className={selectClass} value={entryForm.payment_method} onChange={(e) => setEntryForm({ ...entryForm, payment_method: e.target.value })}><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O'tkazma</option><option value="other">Boshqa</option></select></Field>
            <Field label="Buyurtma ID"><Input type="number" min="1" value={entryForm.order_id} onChange={(e) => setEntryForm({ ...entryForm, order_id: e.target.value })} /></Field>
            <Field label="Qarz ID"><Input type="number" min="1" value={entryForm.debt_id} onChange={(e) => setEntryForm({ ...entryForm, debt_id: e.target.value })} /></Field>
            <Field label="Izoh"><Input value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} /></Field>
            <div className="flex items-end"><Button disabled={action.isPending}>Tasdiqqa yuborish</Button></div>
          </form>
        </Card>
      )}

      {isOwner && (
        <Card className="overflow-x-auto p-0">
          <div className="p-5"><h2 className="text-lg font-semibold">Tasdiqlash</h2><p className="text-sm text-stone-500">Owner tasdig'idan keyin summa hisobotga tushadi.</p></div>
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="border-y border-stone-200 bg-stone-50 text-xs uppercase text-stone-500"><tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Sana</th><th className="px-4 py-3">Turi</th><th className="px-4 py-3">Kategoriya</th><th className="px-4 py-3">Summa</th><th className="px-4 py-3">Manba</th><th className="px-4 py-3">Amal</th></tr></thead>
            <tbody>{pendingEntries.length === 0 ? <tr><td colSpan={7} className="px-4 py-5 text-stone-500">Tasdiq kutilayotgan yozuv yo'q</td></tr> : pendingEntries.map((entry) => <tr key={entry.id} className="border-b border-stone-100"><td className="px-4 py-3">#{entry.id}</td><td className="px-4 py-3">{entry.occurred_on}</td><td className="px-4 py-3">{entry.kind === "income" ? "Kirim" : "Chiqim"}</td><td className="px-4 py-3">{entry.category}</td><td className="px-4 py-3 font-medium">{formatMoney(entry.amount)}</td><td className="px-4 py-3">{entry.source}</td><td className="flex gap-2 px-4 py-3"><Button onClick={() => action.mutate({ url: `/api/v1/finance/entries/${entry.id}/approve` })}>Tasdiqlash</Button><Button variant="danger" onClick={() => action.mutate({ url: `/api/v1/finance/entries/${entry.id}/reject`, body: { reason: "Admin paneldan rad etildi" } })}>Rad etish</Button></td></tr>)}</tbody>
          </table>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Buyurtmalar</h2>
          {canWriteOrders && <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitOrder}>
            <Field label="Mijoz"><Input required value={orderForm.customer_name} onChange={(e) => setOrderForm({ ...orderForm, customer_name: e.target.value })} /></Field>
            <Field label="Buyurtma"><Input required value={orderForm.title} onChange={(e) => setOrderForm({ ...orderForm, title: e.target.value })} placeholder="Oshxona mebeli" /></Field>
            <Field label="Shartnoma summasi"><Input type="number" min="0" step="0.01" required value={orderForm.total_amount} onChange={(e) => setOrderForm({ ...orderForm, total_amount: e.target.value })} /></Field>
            <Field label="Muddat"><Input type="date" value={orderForm.due_date} onChange={(e) => setOrderForm({ ...orderForm, due_date: e.target.value })} /></Field>
            <Field label="Lead ID"><Input type="number" min="1" value={orderForm.lead_id} onChange={(e) => setOrderForm({ ...orderForm, lead_id: e.target.value })} /></Field>
            <div className="flex items-end"><Button disabled={action.isPending}>Buyurtma yaratish</Button></div>
          </form>}
          <div className="space-y-2">{data.orders.length === 0 ? <p className="text-sm text-stone-500">Buyurtmalar yo'q</p> : data.orders.map((order) => <div key={order.id} className="rounded-lg border border-stone-200 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-semibold">#{order.id} {order.title}</span><span className="ml-2 text-stone-500">{order.customer_name}</span></div><Badge value={order.status} /></div><div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><span>Jami: {formatMoney(order.total_amount)}</span><span>To'langan: {formatMoney(order.income_total)}</span><span>Xarajat: {formatMoney(order.expense_total)}</span><span>Qoldiq: {formatMoney(order.outstanding)}</span></div></div>)}</div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Qarzdorlik</h2>
          {canWriteFinance && <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitDebt}>
            <Field label="Yo'nalish"><select className={selectClass} value={debtForm.direction} onChange={(e) => setDebtForm({ ...debtForm, direction: e.target.value })}><option value="receivable">Biz olamiz</option><option value="payable">Biz beramiz</option></select></Field>
            <Field label="Kontragent"><Input required value={debtForm.counterparty} onChange={(e) => setDebtForm({ ...debtForm, counterparty: e.target.value })} /></Field>
            <Field label="Summa"><Input type="number" min="0.01" step="0.01" required value={debtForm.amount} onChange={(e) => setDebtForm({ ...debtForm, amount: e.target.value })} /></Field>
            <Field label="Muddat"><Input type="date" value={debtForm.due_date} onChange={(e) => setDebtForm({ ...debtForm, due_date: e.target.value })} /></Field>
            <Field label="Buyurtma ID"><Input type="number" min="1" value={debtForm.order_id} onChange={(e) => setDebtForm({ ...debtForm, order_id: e.target.value })} /></Field>
            <Field label="Izoh"><Input value={debtForm.description} onChange={(e) => setDebtForm({ ...debtForm, description: e.target.value })} /></Field>
            <Button disabled={action.isPending}>Qarz yaratish</Button>
          </form>}
          <div className="space-y-2">{data.debts.length === 0 ? <p className="text-sm text-stone-500">Qarzlar yo'q</p> : data.debts.map((debt) => <div key={debt.id} className="rounded-lg border border-stone-200 p-3 text-sm"><div className="flex items-center justify-between"><span className="font-semibold">#{debt.id} {debt.counterparty}</span><Badge value={debt.status} /></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600"><span>{debt.direction === "receivable" ? "Olinadi" : "Beriladi"}</span><span>Jami: {formatMoney(debt.amount)}</span><span>Qoldiq: {formatMoney(debt.remaining_amount)}</span><span>Muddat: {debt.due_date ?? "—"}</span></div></div>)}</div>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="p-5"><h2 className="text-lg font-semibold">So'nggi pul harakatlari</h2></div>
        <table className="min-w-[820px] w-full text-left text-sm"><thead className="border-y border-stone-200 bg-stone-50 text-xs uppercase text-stone-500"><tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Sana</th><th className="px-4 py-3">Turi</th><th className="px-4 py-3">Kategoriya</th><th className="px-4 py-3">Summa</th><th className="px-4 py-3">Buyurtma</th><th className="px-4 py-3">Holat</th></tr></thead><tbody>{data.entries.map((entry) => <tr key={entry.id} className="border-b border-stone-100"><td className="px-4 py-3">#{entry.id}</td><td className="px-4 py-3">{entry.occurred_on}</td><td className={`px-4 py-3 ${entry.kind === "income" ? "text-emerald-700" : "text-red-700"}`}>{entry.kind === "income" ? "Kirim" : "Chiqim"}</td><td className="px-4 py-3">{entry.category}</td><td className="px-4 py-3 font-medium">{formatMoney(entry.amount)}</td><td className="px-4 py-3">{entry.order_id ? `#${entry.order_id}` : "—"}</td><td className="px-4 py-3">{entryStatus(entry.status)}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}
