import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiJson, type AdminUser } from "../api/client";
import { Badge, Button, Card, ErrorBox, Input } from "../components/ui";

const ROLES = ["owner", "manager", "accountant", "worker"] as const;
const roleLabels: Record<string, string> = {
  owner: "Admin",
  manager: "Menejer",
  accountant: "Hisobchi",
  worker: "Xodim",
};

const blank = {
  username: "",
  email: "",
  full_name: "",
  role: "worker",
  password: "",
  telegram_chat_id: "",
};

export function Users() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [telegramId, setTelegramId] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiJson<AdminUser[]>("/api/v1/users"),
  });
  const createUser = useMutation({
    mutationFn: () =>
      apiJson<AdminUser>("/api/v1/users", {
        method: "POST",
        body: JSON.stringify({ ...form, telegram_chat_id: form.telegram_chat_id || null }),
      }),
    onSuccess: () => {
      setForm(blank);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiJson<AdminUser>(`/api/v1/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      setNewPassword("");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await createUser.mutateAsync();
    } catch {
      // Xato mutation holati orqali ko'rsatiladi.
    }
  }

  function startEdit(user: AdminUser) {
    setEditing(user);
    setTelegramId(user.telegram_chat_id ?? "");
    setNewPassword("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Foydalanuvchilar va rollar</h1>
        <p className="mt-1 text-sm text-stone-500">Xodim huquqlari va Telegram hisobini shu yerda boshqaring.</p>
      </div>

      <Card>
        <h2 className="mb-4 font-semibold">Yangi foydalanuvchi</h2>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input required placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <Input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input required placeholder="To'liq ism" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <select className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
          </select>
          <Input required minLength={12} type="password" placeholder="Parol (kamida 12 belgi)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Input placeholder="Telegram chat ID (ixtiyoriy)" value={form.telegram_chat_id} onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })} />
          <div className="md:col-span-2 xl:col-span-3">
            <Button disabled={createUser.isPending}>Qo'shish</Button>
          </div>
        </form>
        <div className="mt-3"><ErrorBox text={createUser.error?.message ?? null} /></div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-stone-200 px-5 py-4 font-semibold">Jamoa</div>
        {users.isLoading && <div className="p-5 text-sm text-stone-500">Yuklanmoqda…</div>}
        <ErrorBox text={users.error?.message ?? null} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase text-stone-500">
              <tr><th className="px-5 py-3">Xodim</th><th>Rol</th><th>Telegram</th><th>Holat</th><th className="px-5 text-right">Amal</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.data?.map((user) => (
                <tr key={user.id}>
                  <td className="px-5 py-3"><div className="font-medium">{user.full_name}</div><div className="text-xs text-stone-500">@{user.username} · {user.email}</div></td>
                  <td><Badge value={user.role} label={roleLabels[user.role]} /></td>
                  <td>{user.telegram_chat_id || "—"}</td>
                  <td><Badge value={user.is_active ? "active" : "inactive"} label={user.is_active ? "Faol" : "O'chirilgan"} /></td>
                  <td className="px-5 text-right"><Button variant="ghost" onClick={() => startEdit(user)}>Tahrirlash</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setEditing(null)}>
          <Card className="w-full max-w-lg" >
            <div onMouseDown={(e) => e.stopPropagation()} className="space-y-4">
              <div><h2 className="font-semibold">{editing.full_name}</h2><p className="text-sm text-stone-500">Rol, Telegram bog'lanishi va kirishni yangilash</p></div>
              <label className="block text-sm">Rol
                <select className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as AdminUser["role"] })}>
                  {ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                </select>
              </label>
              <label className="block text-sm">Telegram chat ID<Input value={telegramId} onChange={(e) => setTelegramId(e.target.value)} /></label>
              <label className="block text-sm">Yangi parol (ixtiyoriy)<Input minLength={12} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Faol</label>
              <ErrorBox text={updateUser.error?.message ?? null} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>Bekor qilish</Button>
                <Button disabled={updateUser.isPending} onClick={() => updateUser.mutate({ id: editing.id, body: { role: editing.role, is_active: editing.is_active, telegram_chat_id: telegramId || null, ...(newPassword ? { new_password: newPassword } : {}) } })}>Saqlash</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
