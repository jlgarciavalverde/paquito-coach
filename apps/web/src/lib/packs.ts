import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Appointment, AttendanceStatus, SessionPack, SessionPackInput } from "@coach/shared";
import { api } from "./api";

export const packsQuery = (clientId: string) => queryOptions({ queryKey: ["packs", clientId], queryFn: () => api<SessionPack[]>(`/clients/${clientId}/packs`), staleTime: 0 });
export const myPacksQuery = queryOptions({ queryKey: ["packs", "me"], queryFn: () => api<SessionPack[]>("/me/packs") });

export function usePackMutation(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { create: SessionPackInput } | { id: string; body: SessionPackInput & { archived?: boolean } } | { remove: string }) =>
      "create" in a ? api(`/clients/${clientId}/packs`, { body: a.create }) : "remove" in a ? api(`/packs/${a.remove}`, { method: "DELETE" }) : api(`/packs/${a.id}`, { method: "PUT", body: a.body }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["packs", clientId] }), qc.invalidateQueries({ queryKey: ["attention"] })),
  });
}

/** Marca la asistencia; descuenta o devuelve la sesión del bono. */
export function useAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; status: AttendanceStatus }) => api<Appointment>(`/appointments/${a.id}/attendance`, { body: { status: a.status } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      if (r.clientId) void qc.invalidateQueries({ queryKey: ["packs", r.clientId] });
      void qc.invalidateQueries({ queryKey: ["attention"] });
    },
  });
}
