import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { Me } from "@coach/shared";
import { api, RequestError } from "./api";
import { forgetDevice } from "./push";

/** Sesión actual; `null` si no hay sesión (401). */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    try {
      return await api<Me>("/me");
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) return null;
      throw e;
    }
  },
  staleTime: 60_000,
});

export function useMe() {
  return useSuspenseQuery(meQuery).data;
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await forgetDevice();
    await api("/auth/logout", { method: "POST", body: {} }).catch(() => {});
    qc.clear();
    window.location.assign("/acceso");
  };
}

/** Ruta de inicio según el rol. */
export const homeFor = (me: Me) => (me.role === "coach" ? "/coach" : "/app");
