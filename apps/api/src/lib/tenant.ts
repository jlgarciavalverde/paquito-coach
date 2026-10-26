import type { FastifyRequest } from "fastify";
import { asc, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import type { AppConfig } from "../config";
import { studios } from "../db/schema";

export type StudioRow = typeof studios.$inferSelect;

/**
 * El estudio del que habla una petición sin sesión (página pública, aviso legal, manifest…), ADR 0018:
 * 1. `?estudio=<slug>` (la web lo manda desde `/e/<slug>`);
 * 2. el dominio propio del estudio (`HOST_STUDIOS`);
 * 3. ninguno: es la web de la plataforma.
 */
export async function studioOfRequest(db: DB, cfg: AppConfig, req: FastifyRequest): Promise<StudioRow | null> {
  const q = (req.query as Record<string, unknown> | undefined)?.estudio;
  if (typeof q === "string" && q) return studioBySlug(db, q);
  return studioOfHost(db, cfg, req.headers.host);
}

export async function studioOfHost(db: DB, cfg: AppConfig, host: string | undefined): Promise<StudioRow | null> {
  const slug = host ? cfg.hostStudios[host.toLowerCase()] : undefined;
  if (!slug) return null;
  if (slug === "@first") {
    const [s] = await db.select().from(studios).orderBy(asc(studios.createdAt)).limit(1);
    return s ?? null;
  }
  return studioBySlug(db, slug);
}

export async function studioBySlug(db: DB, slug: string): Promise<StudioRow | null> {
  if (slug.length > 40) return null;
  const [s] = await db.select().from(studios).where(eq(studios.slug, slug.toLowerCase()));
  return s ?? null;
}

/** Enlace a una página de la app de un estudio: en su dominio propio si lo tiene; si no, en la dirección general. */
export function studioUrl(cfg: AppConfig, slug: string | null | undefined, path: string) {
  const own = slug ? Object.entries(cfg.hostStudios).find(([, s]) => s === slug)?.[0] : undefined;
  const base = own ? `${new URL(cfg.publicUrl).protocol}//${own}` : cfg.publicUrl;
  return `${base}${path}`;
}
