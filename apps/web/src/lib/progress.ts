import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { BodyMetric, BodyMetricInput, ProgressExercise, ProgressPoint } from "@coach/shared";
import { api } from "./api";

/** «me» = el propio cliente; si no, el id del cliente (lado del entrenador). */
export type Who = "me" | string;
const base = (w: Who) => (w === "me" ? "/me" : `/clients/${w}`);

export const metricsQuery = (w: Who) => queryOptions({ queryKey: ["metrics", w], queryFn: () => api<BodyMetric[]>(`${base(w)}/metrics`), staleTime: 0 });
export const progressExercisesQuery = (w: Who) =>
  queryOptions({ queryKey: ["progress", w, "exercises"], queryFn: () => api<ProgressExercise[]>(`${base(w)}/progress/exercises`), staleTime: 0 });
export const progressQuery = (w: Who, exerciseId: string) =>
  queryOptions({ queryKey: ["progress", w, exerciseId], queryFn: () => api<ProgressPoint[]>(`${base(w)}/progress?exerciseId=${exerciseId}`), staleTime: 0 });

export function useSaveMetric(w: Who) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: BodyMetricInput) => api<BodyMetric>(`${base(w)}/metrics`, { method: "PUT", body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["metrics", w] }),
  });
}
export function useDeleteMetric(w: Who) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => api(`${base(w)}/metrics/${date}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["metrics", w] }),
  });
}
