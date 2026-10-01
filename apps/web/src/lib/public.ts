import { queryOptions } from "@tanstack/react-query";
import type { Lead, LegalInfo, PublicStudio, StudioProfile } from "@coach/shared";
import { api, RequestError } from "./api";

/** Página pública del estudio (null si no está publicada). */
export const publicStudioQuery = queryOptions({
  queryKey: ["public", "studio"],
  queryFn: () => api<PublicStudio>("/public/studio").catch((e) => (e instanceof RequestError && e.status === 404 ? null : Promise.reject(e))),
  staleTime: 60_000,
});
export const legalQuery = queryOptions({ queryKey: ["public", "legal"], queryFn: () => api<LegalInfo>("/public/legal"), staleTime: 5 * 60_000 });
export const studioProfileQuery = queryOptions({ queryKey: ["studio", "profile"], queryFn: () => api<StudioProfile & { hasPhoto: boolean }>("/studio/profile") });
export const leadsQuery = queryOptions({ queryKey: ["leads"], queryFn: () => api<Lead[]>("/leads"), staleTime: 0 });
