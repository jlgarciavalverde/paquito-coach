import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Client, ClientStatus, CreateClientInput, InviteLink, JoinCode, UpdateClientInput } from "@coach/shared";
import { api } from "./api";

export const clientsQuery = (status?: ClientStatus) =>
  queryOptions({
    queryKey: ["clients", status ?? "current"],
    queryFn: () => api<Client[]>(`/clients${status ? `?status=${status}` : ""}`),
  });

export const clientQuery = (id: string) =>
  queryOptions({
    queryKey: ["client", id],
    queryFn: () => api<Client>(`/clients/${id}`),
  });

export const joinCodeQuery = queryOptions({
  queryKey: ["join-code"],
  queryFn: () => api<JoinCode>("/studio/join-code"),
});

function useInvalidateClients() {
  const qc = useQueryClient();
  return (c?: Client) => {
    void qc.invalidateQueries({ queryKey: ["clients"] });
    if (c) qc.setQueryData(["client", c.id], c);
  };
}

export function useCreateClient() {
  const inv = useInvalidateClients();
  return useMutation({
    mutationFn: (body: CreateClientInput) => api<{ client: Client; invite: InviteLink | null }>("/clients", { body }),
    onSuccess: (r) => inv(r.client),
  });
}

export function useUpdateClient(id: string) {
  const inv = useInvalidateClients();
  return useMutation({
    mutationFn: (body: UpdateClientInput) => api<Client>(`/clients/${id}`, { method: "PATCH", body }),
    onSuccess: (c) => inv(c),
  });
}

export function useClientAction(id: string) {
  const inv = useInvalidateClients();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: "accept" | "reject" | "archive" | "unarchive") => api<Client | { ok: true }>(`/clients/${id}/${action}`, { body: {} }),
    onSuccess: (r) => {
      if ("id" in r) inv(r);
      else {
        qc.removeQueries({ queryKey: ["client", id] });
        inv();
      }
    },
  });
}

export function useResetLink(id: string) {
  return useMutation({ mutationFn: () => api<InviteLink>(`/clients/${id}/reset-link`, { body: {} }) });
}

export function useInvite(id: string) {
  const inv = useInvalidateClients();
  return useMutation({
    mutationFn: () => api<InviteLink>(`/clients/${id}/invite`, { body: {} }),
    onSuccess: () => {
      inv();
    },
  });
}
