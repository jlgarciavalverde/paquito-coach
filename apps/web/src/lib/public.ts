import { queryOptions } from "@tanstack/react-query";
import type { Lead, LegalInfo, PlatformInfo, PublicStudio, StudioProfile } from "@coach/shared";
import { z } from "zod";
import { api, RequestError } from "./api";

export const StudioSearch = z.object({ estudio: z.string().max(60).optional() });

/** `?estudio=<slug>` para las rutas públicas cuando la página es `/e/<slug>` (sin él, el estudio del dominio o la plataforma). */
export const withStudio = (path: string, slug?: string | null) => (slug ? `${path}?estudio=${encodeURIComponent(slug)}` : path);

/** Página pública del estudio (null si no está publicada o no existe). */
export const publicStudioQuery = (slug?: string | null) =>
  queryOptions({
    queryKey: ["public", "studio", slug ?? null],
    queryFn: () => api<PublicStudio>(withStudio("/public/studio", slug)).catch((e) => (e instanceof RequestError && e.status === 404 ? null : Promise.reject(e))),
    staleTime: 60_000,
  });
export const legalQuery = (slug?: string | null) =>
  queryOptions({ queryKey: ["public", "legal", slug ?? null], queryFn: () => api<LegalInfo>(withStudio("/public/legal", slug)), staleTime: 5 * 60_000 });
export const platformQuery = queryOptions({ queryKey: ["platform"], queryFn: () => api<PlatformInfo>("/platform"), staleTime: 5 * 60_000 });
export const studioProfileQuery = queryOptions({ queryKey: ["studio", "profile"], queryFn: () => api<StudioProfile & { hasPhoto: boolean }>("/studio/profile") });
export const leadsQuery = queryOptions({ queryKey: ["leads"], queryFn: () => api<Lead[]>("/leads"), staleTime: 0 });
