"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export interface Me {
  id: string;
  name: string;
  role: string;
}

const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext);

const LINKS: { href: string; label: string; roles?: string[] }[] = [
  { href: "/", label: "Buyurtmalar" },
  { href: "/vazifalar", label: "Vazifalarim" },
  { href: "/katalog", label: "Katalog", roles: ["OWNER", "MANAGER", "SUPPLY"] },
  { href: "/moliya", label: "Moliya", roles: ["OWNER", "ACCOUNTANT"] },
  { href: "/xodimlar", label: "Xodimlar", roles: ["OWNER"] },
  { href: "/qoidalar", label: "Avtomatik qoidalar", roles: ["OWNER"] },
];

/** CRM faqat xodimlar uchun: kirmagan yoki mijoz bo'lsa — kirish sahifasiga */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (path === "/kirish") return setChecked(true);
    api<Me>("/auth/me")
      .then((u) => {
        if (u.role === "CLIENT") throw new ApiError(403, "Xodim emas");
        setMe(u);
      })
      .catch(() => router.replace("/kirish"))
      .finally(() => setChecked(true));
  }, [path, router]);

  if (path === "/kirish") return <>{children}</>;
  if (!checked || !me) return <div style={{ padding: 40 }}>Yuklanmoqda…</div>;

  return (
    <MeContext.Provider value={me}>
      <div className="shell">
        <nav className="side" aria-label="CRM menyusi">
          <strong style={{ padding: "8px 12px 16px", fontSize: 17 }}>[Brend] CRM</strong>
          {LINKS.filter((l) => !l.roles || l.roles.includes(me.role)).map((l) => (
            <Link key={l.href} href={l.href} style={path === l.href ? { background: "#2e5e4e" } : undefined}>{l.label}</Link>
          ))}
          <span style={{ flex: 1 }} />
          <span style={{ padding: "8px 12px", fontSize: 13, color: "#c9c5bc" }}>{me.name} · {me.role}</span>
          <button
            className="btn btn-ghost"
            style={{ margin: "0 12px", minHeight: 40 }}
            onClick={async () => {
              await api("/auth/logout", { method: "POST", body: {} }).catch(() => {});
              router.replace("/kirish");
            }}
          >
            Chiqish
          </button>
        </nav>
        <main className="content">{children}</main>
      </div>
    </MeContext.Provider>
  );
}
