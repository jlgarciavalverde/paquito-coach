import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { media } from "../db/schema";
import { HttpError } from "./errors";

export const STUDIO_QUOTA = 2 * 1024 ** 3; // 2 GB por estudio
export const CLIENT_QUOTA = 300 * 1024 ** 2; // 300 MB por cliente

/** Comprueba que cabe un archivo más (fotos del chat, de progreso y PDFs): evita que alguien llene el disco del servidor. */
export async function assertQuota(db: DB, studioId: string, clientId: string | null, bytes: number) {
  const [s] = await db.select({ n: sql<number>`coalesce(sum(${media.size}), 0)::bigint` }).from(media).where(eq(media.studioId, studioId));
  if (Number(s?.n ?? 0) + bytes > STUDIO_QUOTA) throw new HttpError(413, "quota", "Se ha llenado el espacio de archivos del estudio. Borra fotos o documentos que ya no uses.");
  if (clientId) {
    const [c] = await db.select({ n: sql<number>`coalesce(sum(${media.size}), 0)::bigint` }).from(media).where(and(eq(media.studioId, studioId), eq(media.clientId, clientId)));
    if (Number(c?.n ?? 0) + bytes > CLIENT_QUOTA) throw new HttpError(413, "quota", "Este cliente ha llegado al máximo de fotos guardadas. Borra alguna antigua.");
  }
}
