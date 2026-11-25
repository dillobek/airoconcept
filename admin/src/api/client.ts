import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

// Tiplar backend OpenAPI sxemasidan avtomatik generatsiya qilinadi:
//   cd ../backend && uv run python -m app.cli export-openapi > ../admin/src/api/openapi.json
//   cd ../admin && pnpm gen:api
// Backendda maydon o'zgarsa, admin build vaqtida xato beradi.
export const api = createClient<paths>({ baseUrl: "", credentials: "include" });

export type Lead = components["schemas"]["LeadOut"];
export type LeadPage = components["schemas"]["LeadPage"];
export type Conversation = components["schemas"]["ConversationOut"];
export type User = components["schemas"]["UserOut"] & { username: string };
export type ApiKey = components["schemas"]["ApiKeyOut"];

export type Money = string | number;
export type FinanceDashboard = {
  period: string;
  period_start: string;
  period_end: string;
  income: Money;
  expense: Money;
  profit: Money;
  receivable: Money;
  payable: Money;
  pending_approvals: number;
  active_orders: number;
};
export type FinanceEntry = {
  id: number;
  kind: "income" | "expense";
  amount: Money;
  category: string;
  description: string | null;
  occurred_on: string;
  payment_method: string;
  order_id: number | null;
  debt_id: number | null;
  status: "pending" | "approved" | "rejected";
  source: string;
  created_by_id: number;
  approved_by_id: number | null;
  rejection_reason: string | null;
  created_at: string;
};
export type FinanceOrder = {
  id: number;
  lead_id: number | null;
  customer_name: string;
  title: string;
  status: string;
  total_amount: Money;
  due_date: string | null;
  income_total: Money;
  expense_total: Money;
  outstanding: Money;
  profit: Money;
};
export type Debt = {
  id: number;
  order_id: number | null;
  direction: "receivable" | "payable";
  counterparty: string;
  amount: Money;
  paid_amount: Money;
  remaining_amount: Money;
  due_date: string | null;
  status: string;
  description: string | null;
};
export type FinanceReport = {
  period: string;
  period_start: string;
  period_end: string;
  income: Money;
  expense: Money;
  profit: Money;
  points: { label: string; income: Money; expense: Money; profit: Money }[];
};
export type AdminUser = User & {
  is_active: boolean;
  telegram_chat_id: string | null;
  created_at: string;
};

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new Error(errorText(payload));
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function formatMoney(value: Money): string {
  return `${new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 2 }).format(Number(value || 0))} so'm`;
}

export function errorText(error: unknown): string {
  const detail = (error as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return "Ma'lumotlar noto'g'ri to'ldirilgan";
  return "Xatolik yuz berdi";
}

export const LEAD_STATUSES: Record<string, string> = {
  new: "Yangi",
  qualified: "Aniqlangan",
  measurement_booked: "Zamer belgilandi",
  measured: "Zamer qilindi",
  quoted: "Smeta berildi",
  contract: "Shartnoma",
  production: "Ishlab chiqarish",
  installation: "O'rnatish",
  done: "Yopildi",
  lost: "Yo'qotildi",
};

export const TEMPERATURES: Record<string, string> = { hot: "🔥 Issiq", warm: "Iliq", cold: "Sovuq" };

export const SCOPES = [
  "agent:chat",
  "leads:read",
  "leads:write",
  "clients:read",
  "clients:write",
  "conversations:read",
  "finance:read",
  "finance:write",
  "orders:read",
  "orders:write",
  "tasks:read",
  "tasks:write",
];
