/**
 * Koordinator o'rnini bosuvchi qoidalar dvigateli.
 * Qoida = "AGAR hodisa + shartlar, UNDA harakatlar (kechikish bilan)".
 * Dvigatel toza funksiya: hodisa va qoidalarni oladi, bajariladigan harakatlar ro'yxatini qaytaradi.
 * Haqiqiy bajarish (SMS, vazifa yaratish) API'dagi navbat ishchisida.
 * Hech qanday eval/new Function ishlatilmaydi — shartlar faqat oldindan belgilangan operatorlar.
 */
import type { OrderStatus, Role } from "./order-state.js";

export type AutomationEventType =
  | "ORDER_STATUS_CHANGED"
  | "PROJECT_IDLE"
  | "TASK_OVERDUE"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_DUE";

export interface AutomationEvent {
  type: AutomationEventType;
  /** Hodisa ma'lumotlari: faqat oddiy qiymatlar */
  data: Record<string, string | number | boolean | null>;
  occurredAt: Date;
}

export type ConditionOp = "eq" | "neq" | "in" | "gte" | "lte";
export interface Condition {
  field: string;
  op: ConditionOp;
  value: string | number | boolean | (string | number)[];
}

export type AutomationAction =
  | { type: "NOTIFY_CLIENT"; template: string; channels: ("SMS" | "PUSH" | "TELEGRAM")[] }
  | { type: "NOTIFY_ROLE"; role: Role; template: string }
  | { type: "CREATE_TASK"; role: Role; title: string; dueInHours: number }
  | { type: "AUTO_ASSIGN"; role: Role }
  | { type: "ESCALATE"; role: Role; template: string };

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationEventType;
  conditions: Condition[];
  actions: AutomationAction[];
  delayMinutes: number;
}

export interface PlannedAction {
  ruleId: string;
  action: AutomationAction;
  runAt: Date;
}

const FIELD_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

export function validateRule(rule: AutomationRule): string[] {
  const errors: string[] = [];
  if (!rule.id || rule.id.length > 64) errors.push("id noto'g'ri");
  if (!Number.isInteger(rule.delayMinutes) || rule.delayMinutes < 0 || rule.delayMinutes > 60 * 24 * 60)
    errors.push("kechikish 0..60 kun oralig'ida bo'lishi kerak");
  if (rule.conditions.length > 10) errors.push("10 tadan ortiq shart bo'lmaydi");
  if (rule.actions.length === 0 || rule.actions.length > 10) errors.push("1..10 ta harakat bo'lishi kerak");
  for (const c of rule.conditions) {
    if (!FIELD_RE.test(c.field)) errors.push(`maydon nomi noto'g'ri: ${c.field}`);
    if (c.op === "in" && !Array.isArray(c.value)) errors.push(`'in' uchun ro'yxat kerak: ${c.field}`);
  }
  for (const a of rule.actions) {
    if (a.type === "CREATE_TASK" && (a.dueInHours <= 0 || a.dueInHours > 24 * 60)) errors.push("vazifa muddati noto'g'ri");
  }
  return errors;
}

function matches(cond: Condition, data: AutomationEvent["data"]): boolean {
  if (!Object.prototype.hasOwnProperty.call(data, cond.field)) return false;
  const v = data[cond.field];
  switch (cond.op) {
    case "eq":
      return v === cond.value;
    case "neq":
      return v !== cond.value;
    case "in":
      return Array.isArray(cond.value) && (cond.value as (string | number)[]).includes(v as string | number);
    case "gte":
      return typeof v === "number" && typeof cond.value === "number" && v >= cond.value;
    case "lte":
      return typeof v === "number" && typeof cond.value === "number" && v <= cond.value;
  }
}

export function evaluate(event: AutomationEvent, rules: AutomationRule[]): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.trigger !== event.type) continue;
    if (validateRule(rule).length) continue;
    if (!rule.conditions.every((c) => matches(c, event.data))) continue;
    const runAt = new Date(event.occurredAt.getTime() + rule.delayMinutes * 60_000);
    for (const action of rule.actions) out.push({ ruleId: rule.id, action, runAt });
  }
  return out;
}

const status = (s: OrderStatus) => s;

/** Standart qoidalar — CRM'da yoqish/o'chirish va tahrirlash mumkin */
export const DEFAULT_RULES: AutomationRule[] = [
  {
    id: "idle-project-followup",
    name: "Loyiha tuzib, 2 kun buyurtma bermagan mijoz",
    enabled: true,
    trigger: "PROJECT_IDLE",
    conditions: [{ field: "idleHours", op: "gte", value: 48 }, { field: "hasOrder", op: "eq", value: false }],
    actions: [
      { type: "NOTIFY_CLIENT", template: "project_idle_reminder", channels: ["PUSH"] },
      { type: "CREATE_TASK", role: "MANAGER", title: "Issiq lid: mijozga qo'ng'iroq qilish", dueInHours: 24 },
    ],
    delayMinutes: 0,
  },
  {
    id: "order-placed-assign-measurer",
    name: "Buyurtma berilganda o'lchovchini avtomatik tayinlash",
    enabled: true,
    trigger: "ORDER_STATUS_CHANGED",
    conditions: [{ field: "to", op: "eq", value: status("MEASUREMENT_SCHEDULED") }],
    actions: [
      { type: "AUTO_ASSIGN", role: "MEASURER" },
      { type: "NOTIFY_CLIENT", template: "measurement_scheduled", channels: ["SMS", "PUSH"] },
    ],
    delayMinutes: 0,
  },
  {
    id: "measured-estimate-24h",
    name: "O'lchovdan keyin smeta 24 soatda tayyor bo'lsin",
    enabled: true,
    trigger: "ORDER_STATUS_CHANGED",
    conditions: [{ field: "to", op: "eq", value: status("MEASURED") }],
    actions: [{ type: "CREATE_TASK", role: "MANAGER", title: "Yakuniy smetani tayyorlash", dueInHours: 24 }],
    delayMinutes: 0,
  },
  {
    id: "deposit-start-production",
    name: "Avans tushganda sexga topshiriq",
    enabled: true,
    trigger: "ORDER_STATUS_CHANGED",
    conditions: [{ field: "to", op: "eq", value: status("DEPOSIT_PAID") }],
    actions: [
      { type: "CREATE_TASK", role: "PRODUCTION", title: "Buyurtmani ishlab chiqarishga olish", dueInHours: 24 },
      { type: "CREATE_TASK", role: "SUPPLY", title: "Tayyor mahsulotlarni band qilish / buyurtma berish", dueInHours: 24 },
      { type: "NOTIFY_CLIENT", template: "deposit_received", channels: ["SMS", "PUSH"] },
    ],
    delayMinutes: 0,
  },
  {
    id: "ready-offer-delivery",
    name: "Hammasi omborda — yetkazish kunini taklif qilish",
    enabled: true,
    trigger: "ORDER_STATUS_CHANGED",
    conditions: [{ field: "to", op: "eq", value: status("READY") }],
    actions: [{ type: "NOTIFY_CLIENT", template: "choose_delivery_date", channels: ["SMS", "PUSH"] }],
    delayMinutes: 0,
  },
  {
    id: "installed-final-payment",
    name: "O'rnatildi — qolgan to'lov havolasi",
    enabled: true,
    trigger: "ORDER_STATUS_CHANGED",
    conditions: [{ field: "to", op: "eq", value: status("INSTALLED") }],
    actions: [{ type: "NOTIFY_CLIENT", template: "final_payment_link", channels: ["SMS", "PUSH"] }],
    delayMinutes: 0,
  },
  {
    id: "completed-ask-review",
    name: "Topshirilgandan 7 kun keyin baho so'rash",
    enabled: true,
    trigger: "ORDER_STATUS_CHANGED",
    conditions: [{ field: "to", op: "eq", value: status("COMPLETED") }],
    actions: [{ type: "NOTIFY_CLIENT", template: "ask_review", channels: ["PUSH"] }],
    delayMinutes: 7 * 24 * 60,
  },
  {
    id: "task-overdue-escalate",
    name: "Vazifa muddati o'tdi — rahbarga signal",
    enabled: true,
    trigger: "TASK_OVERDUE",
    conditions: [],
    actions: [{ type: "ESCALATE", role: "OWNER", template: "task_overdue" }],
    delayMinutes: 0,
  },
  {
    id: "payment-due-reminder",
    name: "To'lov muddati keldi — eslatma",
    enabled: true,
    trigger: "PAYMENT_DUE",
    conditions: [],
    actions: [
      { type: "NOTIFY_CLIENT", template: "payment_due", channels: ["SMS"] },
      { type: "NOTIFY_ROLE", role: "ACCOUNTANT", template: "payment_due_staff" },
    ],
    delayMinutes: 0,
  },
];
