import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { api, type User } from "./api/client";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<User | null> => {
      const { data, response } = await api.GET("/api/v1/auth/me");
      if (response.status === 401) return null;
      return data ?? null;
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await api.POST("/api/v1/auth/logout");
    qc.clear();
    window.location.href = "/login";
  };
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <div className="p-8 text-stone-500">Yuklanmoqda…</div>;
  if (!me) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}
