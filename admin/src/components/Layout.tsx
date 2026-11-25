import { NavLink, Outlet } from "react-router";
import { useLogout, useMe } from "../auth";
import { BrandLogo } from "./BrandLogo";

const link = ({ isActive }: { isActive: boolean }) =>
  `block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white/10 text-white" : "text-stone-300 hover:text-white"}`;

export function Layout() {
  const { data: me } = useMe();
  const logout = useLogout();
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex bg-walnut p-4 shadow-[inset_-1px_0_0_rgba(255,255,255,0.12)] lg:min-h-screen lg:w-60 lg:flex-col">
        <BrandLogo className="mr-4 shrink-0 px-1 py-1 lg:mb-6 lg:mr-0" />
        <nav className="flex flex-1 gap-1 overflow-x-auto lg:block lg:space-y-1 lg:overflow-visible">
          <NavLink to="/leads" className={link}>Leadlar</NavLink>
          {me?.role !== "worker" && <NavLink to="/finance" className={link}>Moliya</NavLink>}
          {me?.role === "owner" && <NavLink to="/users" className={link}>Foydalanuvchilar</NavLink>}
          {me?.role === "owner" && <NavLink to="/api-keys" className={link}>API kalitlar</NavLink>}
          <NavLink to="/security" className={link}>Xavfsizlik (2FA)</NavLink>
        </nav>
        <button onClick={logout} className="ml-2 shrink-0 px-2 text-xs text-stone-300 underline lg:hidden">Chiqish</button>
        <div className="hidden px-3 text-xs text-stone-400 lg:mt-auto lg:block">
          <div className="text-stone-200">{me?.full_name}</div>
          <div>{me?.role}</div>
          <button onClick={logout} className="mt-3 text-stone-300 underline hover:text-white">Chiqish</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
