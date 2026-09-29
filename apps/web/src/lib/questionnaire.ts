import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Questionnaire, QuestionnaireInput, QuestionnaireState } from "@coach/shared";
import { api } from "./api";

export const myQuestionnaireQuery = queryOptions({ queryKey: ["questionnaire", "me"], queryFn: () => api<QuestionnaireState>("/me/questionnaire") });
export const clientQuestionnaireQuery = (id: string) =>
  queryOptions({ queryKey: ["questionnaire", id], queryFn: () => api<QuestionnaireState>(`/clients/${id}/questionnaire`), staleTime: 0 });
export const unreviewedQuery = queryOptions({
  queryKey: ["questionnaire", "unreviewed"],
  queryFn: () => api<{ clientId: string; clientName: string; alerts: number; submittedAt: string }[]>("/questionnaires/unreviewed"),
  staleTime: 0,
});

export function useSubmitQuestionnaire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: QuestionnaireInput) => api<Questionnaire>("/me/questionnaire", { body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questionnaire"] }),
  });
}
export function useQuestionnaireAction(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: "review" | "request") => api(`/clients/${clientId}/questionnaire/${a}`, { body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questionnaire"] }),
  });
}
