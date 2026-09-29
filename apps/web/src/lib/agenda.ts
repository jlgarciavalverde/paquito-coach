import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Appointment, AppointmentBody } from "@coach/shared";
import { api } from "./api";
import { fromIso } from "./dates";

/** Rango [from, to) de fechas locales → ISO con zona. */
export const rangeIso = (fromDate: string, toDateExclusive: string) => ({ from: fromIso(fromDate).toISOString(), to: fromIso(toDateExclusive).toISOString() });

export const appointmentsQuery = (fromDate: string, toDateExclusive: string, clientId?: string) => {
  const r = rangeIso(fromDate, toDateExclusive);
  const qs = new URLSearchParams({ from: r.from, to: r.to, ...(clientId ? { clientId } : {}) });
  return queryOptions({ queryKey: ["appointments", fromDate, toDateExclusive, clientId ?? null], queryFn: () => api<Appointment[]>(`/appointments?${qs}`), staleTime: 0 });
};
export const myAppointmentsQuery = (fromDate: string, toDateExclusive: string) => {
  const r = rangeIso(fromDate, toDateExclusive);
  return queryOptions({ queryKey: ["appointments", "me", fromDate, toDateExclusive], queryFn: () => api<Appointment[]>(`/me/appointments?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`) });
};

export function useAppointmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id?: string; body?: Partial<AppointmentBody>; remove?: boolean }) =>
      p.remove ? api(`/appointments/${p.id}`, { method: "DELETE" }) : p.id ? api<Appointment>(`/appointments/${p.id}`, { method: "PATCH", body: p.body }) : api<Appointment>("/appointments", { body: p.body }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

/** «08:30» en hora local. */
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
/** Minutos desde medianoche (hora local). */
export const minutesOf = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
/** Fecha local `YYYY-MM-DD` de un instante. */
export const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Instante ISO a partir de fecha local + minutos. */
export const atLocal = (date: string, minutes: number) => {
  const d = fromIso(date);
  d.setHours(0, minutes, 0, 0);
  return d.toISOString();
};
