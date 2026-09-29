import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Payment, PaymentLinkInput, PaymentsInfo, Price, PriceInput, Subscription } from "@coach/shared";
import { api } from "./api";

export const paymentsInfoQuery = queryOptions({ queryKey: ["payments", "info"], queryFn: () => api<PaymentsInfo>("/payments/info"), staleTime: 5 * 60_000 });
export const pricesQuery = queryOptions({ queryKey: ["prices"], queryFn: () => api<Price[]>("/prices") });
export const myPricesQuery = queryOptions({ queryKey: ["prices", "me"], queryFn: () => api<Price[]>("/me/prices") });
export const clientPaymentsQuery = (clientId: string) => queryOptions({ queryKey: ["payments", "client", clientId], queryFn: () => api<Payment[]>(`/clients/${clientId}/payments`), staleTime: 0 });
export const myPaymentsQuery = queryOptions({ queryKey: ["payments", "me"], queryFn: () => api<Payment[]>("/me/payments"), staleTime: 0 });

export function usePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id?: string; body: PriceInput }) => (a.id ? api<Price>(`/prices/${a.id}`, { method: "PUT", body: a.body }) : api<Price>("/prices", { body: a.body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prices"] }),
  });
}
export function usePaymentLink(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Partial<PaymentLinkInput>) => api<Payment>(`/clients/${clientId}/payment-links`, { body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}
export function useRenewPayment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api<Payment>(`/payments/${id}/renew`, { body: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }) });
}
export function useCheckout() {
  return useMutation({ mutationFn: (priceId: string) => api<Payment>("/me/checkout", { body: { priceId } }) });
}

export const mySubscriptionsQuery = queryOptions({ queryKey: ["subscriptions", "me"], queryFn: () => api<Subscription[]>("/me/subscriptions"), staleTime: 0 });
export const clientSubscriptionsQuery = (clientId: string) => queryOptions({ queryKey: ["subscriptions", clientId], queryFn: () => api<Subscription[]>(`/clients/${clientId}/subscriptions`), staleTime: 0 });
export function useSubscribe() {
  return useMutation({ mutationFn: (priceId: string) => api<{ url: string }>("/me/subscribe", { body: { priceId } }) });
}
export function usePortal() {
  return useMutation({ mutationFn: () => api<{ url: string }>("/me/billing-portal", { body: {} }) });
}
