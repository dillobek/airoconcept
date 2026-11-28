/**
 * Buyurtma holat mashinasi. Holat FAQAT shu yerda ruxsat etilgan o'tishlar bilan o'zgaradi —
 * API, CRM va bot shu funksiyadan foydalanadi, shuning uchun qoida bitta joyda.
 */
export const ORDER_STATUSES = [
  "LEAD",
  "PLACED",
  "MEASUREMENT_SCHEDULED",
  "MEASURED",
  "CONTRACT_SIGNED",
  "DEPOSIT_PAID",
  "IN_PRODUCTION",
  "READY",
  "DELIVERY_SCHEDULED",
  "DELIVERED",
  "INSTALLED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL_UZ: Record<OrderStatus, string> = {
  LEAD: "Lid",
  PLACED: "Buyurtma berildi (taxminiy)",
  MEASUREMENT_SCHEDULED: "O'lchov belgilandi",
  MEASURED: "O'lchandi",
  CONTRACT_SIGNED: "Shartnoma tasdiqlandi",
  DEPOSIT_PAID: "Avans to'landi",
  IN_PRODUCTION: "Ishlab chiqarishda",
  READY: "Omborda tayyor",
  DELIVERY_SCHEDULED: "Yetkazish belgilandi",
  DELIVERED: "Yetkazildi",
  INSTALLED: "O'rnatildi",
  COMPLETED: "Topshirildi",
  CANCELLED: "Bekor qilindi",
};

export const ROLES = [
  "OWNER",
  "MANAGER",
  "DESIGNER",
  "MEASURER",
  "SUPPLY",
  "PRODUCTION",
  "WAREHOUSE",
  "DRIVER",
  "INSTALLER",
  "FOREMAN",
  "ACCOUNTANT",
  "CLIENT",
] as const;
export type Role = (typeof ROLES)[number];

export interface TransitionContext {
  /** Shartnomadagi avans summasi to'liq to'langanmi */
  depositPaid: boolean;
  /** Mijozning qolgan qarzi (tiyin) */
  balanceDueTiyin: number;
  /** Tasdiqlangan smeta bormi */
  hasApprovedEstimate: boolean;
  /** Qabul akti imzolanganmi */
  acceptanceSigned: boolean;
}

interface TransitionRule {
  to: OrderStatus;
  roles: readonly Role[];
  guard?: (ctx: TransitionContext) => string | null;
}

const STAFF_OPS: readonly Role[] = ["OWNER", "MANAGER"];

const TRANSITIONS: Record<OrderStatus, readonly TransitionRule[]> = {
  LEAD: [{ to: "PLACED", roles: ["CLIENT", ...STAFF_OPS] }],
  PLACED: [{ to: "MEASUREMENT_SCHEDULED", roles: ["CLIENT", ...STAFF_OPS] }],
  MEASUREMENT_SCHEDULED: [{ to: "MEASURED", roles: ["MEASURER", ...STAFF_OPS] }],
  MEASURED: [
    {
      to: "CONTRACT_SIGNED",
      roles: ["CLIENT", ...STAFF_OPS],
      guard: (c) => (c.hasApprovedEstimate ? null : "Avval yakuniy smeta tasdiqlanishi kerak"),
    },
  ],
  CONTRACT_SIGNED: [
    {
      to: "DEPOSIT_PAID",
      roles: ["ACCOUNTANT", ...STAFF_OPS],
      guard: (c) => (c.depositPaid ? null : "Avans to'lovi hali tushmagan"),
    },
  ],
  DEPOSIT_PAID: [{ to: "IN_PRODUCTION", roles: ["PRODUCTION", "SUPPLY", ...STAFF_OPS] }],
  IN_PRODUCTION: [{ to: "READY", roles: ["PRODUCTION", "WAREHOUSE", ...STAFF_OPS] }],
  READY: [{ to: "DELIVERY_SCHEDULED", roles: ["CLIENT", "WAREHOUSE", ...STAFF_OPS] }],
  DELIVERY_SCHEDULED: [{ to: "DELIVERED", roles: ["DRIVER", ...STAFF_OPS] }],
  DELIVERED: [{ to: "INSTALLED", roles: ["INSTALLER", "FOREMAN", ...STAFF_OPS] }],
  INSTALLED: [
    {
      to: "COMPLETED",
      roles: ["ACCOUNTANT", ...STAFF_OPS],
      guard: (c) => {
        if (!c.acceptanceSigned) return "Mijoz qabul aktini imzolamagan";
        if (c.balanceDueTiyin > 0) return "Mijozning qarzi yopilmagan";
        return null;
      },
    },
  ],
  COMPLETED: [],
  CANCELLED: [],
};

/** Ishlab chiqarish boshlanmaguncha bekor qilish mumkin (keyin — faqat rahbar). */
const CANCELLABLE_BY_CLIENT = new Set<OrderStatus>(["LEAD", "PLACED", "MEASUREMENT_SCHEDULED", "MEASURED"]);

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  role: Role,
  ctx: TransitionContext,
): TransitionResult {
  if (from === to) return { ok: false, reason: "Holat o'zgarmadi" };
  if (to === "CANCELLED") {
    if (from === "COMPLETED" || from === "CANCELLED") return { ok: false, reason: "Yakunlangan buyurtmani bekor qilib bo'lmaydi" };
    if (role === "OWNER") return { ok: true };
    if (role === "MANAGER" && !["IN_PRODUCTION", "READY", "DELIVERY_SCHEDULED", "DELIVERED", "INSTALLED"].includes(from)) return { ok: true };
    if (role === "CLIENT" && CANCELLABLE_BY_CLIENT.has(from)) return { ok: true };
    return { ok: false, reason: "Bu bosqichda bekor qilish uchun rahbar ruxsati kerak" };
  }
  const rule = TRANSITIONS[from].find((r) => r.to === to);
  if (!rule) return { ok: false, reason: `${ORDER_STATUS_LABEL_UZ[from]} → ${ORDER_STATUS_LABEL_UZ[to]} o'tishi mumkin emas` };
  if (!rule.roles.includes(role)) return { ok: false, reason: "Bu amal uchun huquqingiz yo'q" };
  const guardError = rule.guard?.(ctx) ?? null;
  return guardError ? { ok: false, reason: guardError } : { ok: true };
}

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from].map((r) => r.to);
}

export function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v);
}

/** Dizayn loyihasi bosqichlari (B yo'l — dizayner bilan) */
export const DESIGN_STAGES = ["BRIEF", "MEASURE", "CONTRACT", "CONCEPT", "LAYOUT", "RENDER", "DRAWINGS", "ESTIMATE", "DONE"] as const;
export type DesignStage = (typeof DESIGN_STAGES)[number];
