import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({ className = "", variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const styles = {
    primary: "bg-walnut text-white hover:bg-stone-800",
    ghost: "bg-white border border-stone-300 hover:bg-stone-100",
    danger: "bg-red-700 text-white hover:bg-red-800",
  }[variant];
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-wood focus:ring-2 focus:ring-wood/20"
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

const BADGE: Record<string, string> = {
  hot: "bg-red-100 text-red-800",
  warm: "bg-amber-100 text-amber-800",
  cold: "bg-sky-100 text-sky-800",
  measurement_booked: "bg-emerald-100 text-emerald-800",
  contract: "bg-moss/15 text-moss",
  lost: "bg-stone-200 text-stone-600",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  open: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-stone-200 text-stone-600",
  owner: "bg-violet-100 text-violet-800",
  manager: "bg-sky-100 text-sky-800",
  accountant: "bg-emerald-100 text-emerald-800",
  worker: "bg-stone-100 text-stone-700",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[value] ?? "bg-stone-100 text-stone-700"}`}>
      {label ?? value}
    </span>
  );
}

export function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{text}</div>;
}
