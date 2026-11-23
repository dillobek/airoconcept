import { NavLink, Outlet } from "react-router";
import { useLogout, useMe } from "../auth";

const link = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white/10 text-white" : "text-stone-300 hover:text-white"}`;

export function Layout() {
  const { data: me } = useMe();
  const logout = useLogout();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col bg-walnut p-4">
        <div className="mb-6 px-3 text-lg font-semibold text-white">AiroConcept</div>
        <nav className="space-y-1">
          <NavLink to="/leads" className={link}>Leadlar</NavLink>
          {me?.role === "owner" && <NavLink to="/api-keys" className={link}>API kalitlar</NavLink>}
          <NavLink to="/security" className={link}>Xavfsizlik (2FA)</NavLink>
        </nav>
        <div className="mt-auto px-3 text-xs text-stone-400">
          <div className="text-stone-200">{me?.full_name}</div>
          <div>{me?.role}</div>
          <button onClick={logout} className="mt-3 text-stone-300 underline hover:text-white">Chiqish</button>
        </div>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
