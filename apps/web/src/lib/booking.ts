import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Appointment, BookingInfo, BookingSettings } from "@coach/shared";
import { api } from "./api";

export const bookingSettingsQuery = queryOptions({ queryKey: ["booking-settings"], queryFn: () => api<BookingSettings>("/studio/booking") });
export function useSaveBookingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: BookingSettings) => api<BookingSettings>("/studio/booking", { method: "PUT", body: b }),
    onSuccess: (s) => qc.setQueryData(["booking-settings"], s),
  });
}
export const myBookingQuery = (from: string, days = 14) =>
  queryOptions({ queryKey: ["booking", "me", from, days], queryFn: () => api<BookingInfo>(`/me/booking?from=${from}&days=${days}`), staleTime: 0 });
export function useBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (startsAt: string) => api<Appointment>("/me/booking", { body: { startsAt } }),
    onSettled: () => (qc.invalidateQueries({ queryKey: ["booking"] }), qc.invalidateQueries({ queryKey: ["appointments"] })),
  });
}
export function useCancelMine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/me/appointments/${id}/cancel`, { body: {} }),
    onSettled: () => (qc.invalidateQueries({ queryKey: ["booking"] }), qc.invalidateQueries({ queryKey: ["appointments"] })),
  });
}
