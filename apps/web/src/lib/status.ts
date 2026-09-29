import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

/** Estado público de la instancia (si falta el alta inicial, si es la demo). */
export const statusQuery = queryOptions({
  queryKey: ["status"],
  queryFn: () => api<{ needsSetup: boolean; demo: boolean }>("/auth/setup-status"),
  staleTime: 5 * 60_000,
});
