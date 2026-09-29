import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AiDocument,
  AiStatus,
  AskAnswer,
  GenerateMealPlanInput,
  GenerateProgramInput,
  GenerateRoutineInput,
  GeneratedMealPlan,
  GeneratedProgram,
  GeneratedRoutine,
} from "@coach/shared";
import { api, RequestError } from "./api";

export const aiStatusQuery = queryOptions({ queryKey: ["ai", "status"], queryFn: () => api<AiStatus>("/ai/status"), staleTime: 0 });
export const aiDocumentsQuery = queryOptions({ queryKey: ["ai", "documents"], queryFn: () => api<AiDocument[]>("/ai/documents") });

const done = (qc: ReturnType<typeof useQueryClient>) => () => qc.invalidateQueries({ queryKey: ["ai", "status"] });
export function useGenerateRoutine() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<GenerateRoutineInput>) => api<GeneratedRoutine>("/ai/routine", { body: b }), onSettled: done(qc) });
}
export function useGenerateProgram() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<GenerateProgramInput>) => api<GeneratedProgram>("/ai/program", { body: b }), onSettled: done(qc) });
}
export function useGenerateMealPlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<GenerateMealPlanInput>) => api<GeneratedMealPlan>("/ai/meal-plan", { body: b }), onSettled: done(qc) });
}
export function useAsk() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (question: string) => api<AskAnswer>("/ai/ask", { body: { question } }), onSettled: done(qc) });
}
export function useAiDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { upload: File } | { remove: string }) => {
      if ("remove" in a) return api(`/ai/documents/${a.remove}`, { method: "DELETE" });
      const fd = new FormData();
      fd.append("file", a.upload);
      const res = await fetch("/api/v1/ai/documents", { method: "POST", body: fd, credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new RequestError(res.status, data.error ?? "http", data.message ?? "No se ha podido subir el documento");
      return data as AiDocument;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["ai"] }),
  });
}
