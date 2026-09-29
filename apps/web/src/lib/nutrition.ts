import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MealCheck, MealPlan, MealPlanBody } from "@coach/shared";
import { api } from "./api";

export const templatesQuery = queryOptions({ queryKey: ["meal-plans", "templates"], queryFn: () => api<MealPlan[]>("/meal-plans") });
export const planQuery = (id: string) => queryOptions({ queryKey: ["meal-plan", id], queryFn: () => api<MealPlan>(`/meal-plans/${id}`) });
export const clientPlanQuery = (clientId: string) => queryOptions({ queryKey: ["meal-plan", "client", clientId], queryFn: () => api<MealPlan | null>(`/clients/${clientId}/meal-plan`) });
export const clientChecksQuery = (clientId: string, from: string, to: string) =>
  queryOptions({ queryKey: ["meal-checks", clientId, from, to], queryFn: () => api<MealCheck[]>(`/clients/${clientId}/meal-checks?from=${from}&to=${to}`), staleTime: 0 });
export const myPlanQuery = queryOptions({ queryKey: ["meal-plan", "me"], queryFn: () => api<MealPlan | null>("/me/meal-plan") });
export const myChecksQuery = (from: string, to: string) => queryOptions({ queryKey: ["meal-checks", "me", from, to], queryFn: () => api<MealCheck[]>(`/me/meal-checks?from=${from}&to=${to}`) });

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["meal-plans"] });
    void qc.invalidateQueries({ queryKey: ["meal-plan"] });
  };
}

export function useCreatePlan() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (b: { clientId: string | null; fromPlanId?: string; body?: MealPlanBody }) => api<MealPlan>("/meal-plans", { body: b }),
    onSuccess: inv,
  });
}
export function useSavePlan(id: string) {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (body: MealPlanBody) => api<MealPlan>(`/meal-plans/${id}`, { method: "PUT", body }), onSuccess: inv });
}
export function useDeletePlan() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api(`/meal-plans/${id}`, { method: "DELETE" }), onSuccess: inv });
}
export function useApplyPlan(id: string) {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (clientIds: string[]) => api<{ applied: number }>(`/meal-plans/${id}/apply`, { body: { clientIds } }), onSuccess: inv });
}
export function useCheckMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { date: string; mealId: string; done: boolean; note: string | null }) => api<MealCheck>("/me/meal-checks", { method: "PUT", body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meal-checks", "me"] }),
  });
}

export const WEEKDAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
