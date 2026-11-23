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
export type User = components["schemas"]["UserOut"];
export type ApiKey = components["schemas"]["ApiKeyOut"];

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
  "tasks:read",
  "tasks:write",
];
