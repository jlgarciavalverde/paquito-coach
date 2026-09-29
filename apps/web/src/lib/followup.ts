import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CheckinAnswers,
  CheckinAssignInput,
  CheckinAssignment,
  CheckinForm,
  CheckinFormInput,
  CheckinResponse,
  CustomMetrics,
  MetricDef,
  MetricDefInput,
  MetricValueInput,
  PendingCheckin,
  ProgressPhoto,
  ProgressPhotoInput,
} from "@coach/shared";
import { api } from "./api";
import type { Who } from "./progress";

const base = (w: Who) => (w === "me" ? "/me" : `/clients/${w}`);

// ── Fotos ──
export const photosQuery = (w: Who) => queryOptions({ queryKey: ["photos", w], queryFn: () => api<ProgressPhoto[]>(`${base(w)}/photos`), staleTime: 0 });
export function usePhotoMutation(w: Who) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { add: ProgressPhotoInput } | { remove: string }) =>
      "add" in a ? api(`${base(w)}/photos`, { body: a.add }) : api(`${base(w)}/photos/${a.remove}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos", w] }),
  });
}

// ── Métricas propias ──
export const metricDefsQuery = queryOptions({ queryKey: ["metric-defs"], queryFn: () => api<MetricDef[]>("/metric-defs") });
export function useMetricDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id?: string; body: MetricDefInput & { archived?: boolean } }) =>
      a.id ? api<MetricDef>(`/metric-defs/${a.id}`, { method: "PUT", body: a.body }) : api<MetricDef>("/metric-defs", { body: a.body }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["metric-defs"] }), qc.invalidateQueries({ queryKey: ["custom-metrics"] })),
  });
}
export const customMetricsQuery = (w: Who) => queryOptions({ queryKey: ["custom-metrics", w], queryFn: () => api<CustomMetrics>(`${base(w)}/custom-metrics`), staleTime: 0 });
export function useCustomValue(w: Who) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { save: MetricValueInput } | { remove: { metricId: string; date: string } }) =>
      "save" in a
        ? api(`${base(w)}/custom-metrics`, { method: "PUT", body: a.save })
        : api(`${base(w)}/custom-metrics/${a.remove.metricId}/${a.remove.date}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-metrics", w] }),
  });
}

// ── Check-ins ──
export const checkinFormsQuery = queryOptions({ queryKey: ["checkin-forms"], queryFn: () => api<CheckinForm[]>("/checkin-forms") });
export function useSaveCheckinForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id?: string; body: CheckinFormInput }) =>
      a.id ? api(`/checkin-forms/${a.id}`, { method: "PUT", body: a.body }).then(() => ({ id: a.id! })) : api<CheckinForm>("/checkin-forms", { body: a.body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkin-forms"] }),
  });
}
export function useArchiveCheckinForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/checkin-forms/${id}`, { method: "DELETE" }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["checkin-forms"] }), qc.invalidateQueries({ queryKey: ["checkins"] })),
  });
}
export function useAssignCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { formId: string; body: CheckinAssignInput }) => api<{ assigned: number }>(`/checkin-forms/${a.formId}/assign`, { body: a.body }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["checkin-forms"] }), qc.invalidateQueries({ queryKey: ["checkins"] })),
  });
}
export const clientCheckinsQuery = (clientId: string) =>
  queryOptions({
    queryKey: ["checkins", clientId],
    queryFn: () => api<{ assignments: CheckinAssignment[]; responses: CheckinResponse[] }>(`/clients/${clientId}/checkins`),
    staleTime: 0,
  });
export function useCheckinAdmin(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { unassign: string } | { seen: true }) =>
      "unassign" in a ? api(`/checkin-assignments/${a.unassign}`, { method: "DELETE" }) : api(`/clients/${clientId}/checkins/seen`, { body: {} }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["checkins", clientId] }), qc.invalidateQueries({ queryKey: ["attention"] })),
  });
}
export const myCheckinsQuery = queryOptions({ queryKey: ["checkins", "me"], queryFn: () => api<PendingCheckin[]>("/me/checkins"), staleTime: 0 });
export function useSubmitCheckin(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: CheckinAnswers) => api<CheckinResponse>(`/me/checkins/${assignmentId}`, { body: { answers } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkins", "me"] }),
  });
}
