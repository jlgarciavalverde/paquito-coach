import type { FastifyRequest } from "fastify";
import type { DB } from "../db/client";
import { auditLog } from "../db/schema";

/** Registra una acción sensible. Nunca rompe la petición si falla (solo lo anota en el log). */
export async function audit(
  db: DB,
  req: FastifyRequest,
  action: string,
  target?: { type: string; id: string },
  meta?: Record<string, unknown>,
) {
  try {
    await db.insert(auditLog).values({
      studioId: req.user?.studioId ?? null,
      actorId: req.user?.id ?? null,
      action,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      meta: meta ?? null,
      ip: req.ip,
    });
  } catch (err) {
    req.log.error({ err, action }, "no se pudo escribir en audit_log");
  }
}
