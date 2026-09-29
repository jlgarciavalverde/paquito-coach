import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Program, ProgramAssignInput, ProgramBody, ProgramRun } from "@coach/shared";
import { api } from "./api";

export const programsQuery = queryOptions({ queryKey: ["programs"], queryFn: () => api<Program[]>("/programs") });
export const programQuery = (id: string) => queryOptions({ queryKey: ["program", id], queryFn: () => api<Program>(`/programs/${id}`) });
export const programRunsQuery = (clientId: string) =>
  queryOptions({ queryKey: ["program-runs", clientId], queryFn: () => api<ProgramRun[]>(`/clients/${clientId}/program-runs`), staleTime: 0 });

export function useSaveProgram(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: ProgramBody) => (id ? api<Program>(`/programs/${id}`, { method: "PUT", body: b }) : api<Program>("/programs", { body: b })),
    onSuccess: (p) => (qc.invalidateQueries({ queryKey: ["programs"] }), qc.setQueryData(["program", p.id], p)),
  });
}
export function useDeleteProgram() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api(`/programs/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["programs"] }) });
}
export function useAssignProgram(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: ProgramAssignInput) => api<{ created: number }>(`/programs/${id}/assign`, { body: b }),
    onSuccess: () => ["programs", "program-runs", "workouts", "attention"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}
export function useEndRun(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api<{ removed: number }>(`/program-runs/${runId}/end`, { body: {} }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["program-runs", clientId] }), qc.invalidateQueries({ queryKey: ["workouts"] }), qc.invalidateQueries({ queryKey: ["programs"] })),
  });
}
