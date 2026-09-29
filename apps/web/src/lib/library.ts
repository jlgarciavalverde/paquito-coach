import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Achievements, Resource, ResourceInput, StudioReport } from "@coach/shared";
import { api, RequestError } from "./api";

export const resourcesQuery = queryOptions({ queryKey: ["resources"], queryFn: () => api<Resource[]>("/resources") });
export const myResourcesQuery = queryOptions({ queryKey: ["resources", "me"], queryFn: () => api<Resource[]>("/me/resources") });
export const achievementsQuery = queryOptions({ queryKey: ["achievements"], queryFn: () => api<Achievements>("/me/achievements") });
export const reportQuery = queryOptions({ queryKey: ["report"], queryFn: () => api<StudioReport>("/reports"), staleTime: 0 });

export function useResourceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id?: string; body: ResourceInput } | { remove: string }) =>
      "remove" in a ? api(`/resources/${a.remove}`, { method: "DELETE" }) : a.id ? api(`/resources/${a.id}`, { method: "PUT", body: a.body }) : api("/resources", { body: a.body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

export async function uploadPdf(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/v1/resources/upload", { method: "POST", body: fd, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new RequestError(res.status, data.error ?? "http", data.message ?? "No se ha podido subir el archivo");
  return data.id as string;
}
