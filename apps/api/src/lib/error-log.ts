import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { errorReports } from "../db/schema";
import { redactUrl } from "./redact";

/**
 * Registro propio de errores (Q1): la web y la API guardan aquí lo que falla, agrupado por huella. Sin servicios externos
 * (la app trata datos de salud) y sin datos personales: correos, teléfonos, identificadores y números largos se ocultan.
 */
export function scrub(text: string, max: number) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\b(?:sk|rk|pk|whsec|acct|cus|cs|pi|sub|in)_[A-Za-z0-9_]{6,}\b/g, "[stripe]")
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[número]")
    .slice(0, max);
}

/** Misma huella = mismo error: origen, tipo, mensaje sin cifras y primera línea de la pila sin posiciones. */
export function fingerprint(source: string, kind: string, message: string, stack: string) {
  const top = stack.split("\n").find((l) => /\bat\b|@/.test(l)) ?? "";
  const norm = (s: string) => s.replace(/\d+/g, "#").replace(/:\#+(:\#+)?/g, "").trim();
  return createHash("sha256").update(`${source}|${kind}|${norm(message)}|${norm(top)}`).digest("hex").slice(0, 32);
}

export type ErrorEntry = { source: "web" | "api"; kind: string; message: string; stack?: string; path?: string; version?: string; userAgent?: string; requestId?: string | null };

export async function recordError(db: DB, e: ErrorEntry) {
  const message = scrub(e.message || "(sin mensaje)", 500);
  const stack = scrub(e.stack ?? "", 4000);
  const path = scrub(redactUrl(e.path ?? "").split("?")[0]!, 200);
  const fp = fingerprint(e.source, e.kind, message, stack);
  await db
    .insert(errorReports)
    .values({ fingerprint: fp, source: e.source, kind: e.kind, message, stack, path, version: (e.version ?? "").slice(0, 40), userAgent: (e.userAgent ?? "").slice(0, 200), lastRequestId: e.requestId ?? null })
    .onConflictDoUpdate({
      target: errorReports.fingerprint,
      // Si vuelve a pasar uno que se dio por resuelto, se reabre.
      set: { count: sql`${errorReports.count} + 1`, lastSeen: sql`now()`, path, version: (e.version ?? "").slice(0, 40), lastRequestId: e.requestId ?? null, resolvedAt: null },
    });
}
