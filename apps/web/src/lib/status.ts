import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import type { SetupStatus } from "@coach/shared";
import { api } from "./api";

/** Estado público de la instancia (si falta el alta inicial, si es la demo, si envía correos). */
export const statusQuery = queryOptions({
  queryKey: ["status"],
  queryFn: () => api<z.infer<typeof SetupStatus>>("/auth/setup-status"),
  staleTime: 5 * 60_000,
});
