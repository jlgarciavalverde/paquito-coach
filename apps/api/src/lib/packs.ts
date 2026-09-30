import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { packUsable, type SessionPack } from "@coach/shared";
import type { DB } from "../db/client";
import { appointments, sessionPacks } from "../db/schema";
import { madridClock } from "./scheduler";

type PackRow = typeof sessionPacks.$inferSelect;
const toPack = (r: PackRow, used: number): SessionPack => ({
  id: r.id,
  clientId: r.clientId,
  name: r.name,
  total: r.total,
  expires: r.expires,
  price: r.price,
  paid: r.paid,
  notes: r.notes,
  used,
  remaining: Math.max(0, r.total - used),
  archived: Boolean(r.archivedAt),
  createdAt: r.createdAt.toISOString(),
});

/** Bonos de varios clientes con lo usado (citas que descuentan de cada uno), en dos consultas sea cual sea el número. */
export async function packsOfMany(db: Pick<DB, "select">, clientIds: string[]): Promise<Map<string, SessionPack[]>> {
  const out = new Map<string, SessionPack[]>();
  if (clientIds.length === 0) return out;
  const rows = await db.select().from(sessionPacks).where(inArray(sessionPacks.clientId, clientIds)).orderBy(asc(sessionPacks.createdAt));
  if (rows.length === 0) return out;
  const used = await db
    .select({ id: appointments.packId, n: sql<number>`count(*)::int` })
    .from(appointments)
    .where(inArray(appointments.packId, rows.map((r) => r.id)))
    .groupBy(appointments.packId);
  const by = new Map(used.map((u) => [u.id, u.n]));
  for (const r of rows) out.set(r.clientId, [...(out.get(r.clientId) ?? []), toPack(r, by.get(r.id) ?? 0)]);
  return out;
}

/** Bonos de un cliente con lo usado y lo que queda. */
export async function packsOf(db: Pick<DB, "select">, clientId: string): Promise<SessionPack[]> {
  return (await packsOfMany(db, [clientId])).get(clientId) ?? [];
}

/** Para «Necesitan atención»: clientes con bono cuya última sesión se acerca, agotado o caducado. */
export async function packAlerts(db: DB, studioId: string, clientIds: string[]) {
  const out = new Map<string, string>();
  if (clientIds.length === 0) return out;
  const rows = await db
    .selectDistinct({ clientId: sessionPacks.clientId })
    .from(sessionPacks)
    .where(and(eq(sessionPacks.studioId, studioId), inArray(sessionPacks.clientId, clientIds), isNull(sessionPacks.archivedAt)));
  const today = madridClock(new Date()).date;
  const all = await packsOfMany(db, rows.map((r) => r.clientId));
  for (const { clientId } of rows) {
    const packs = (all.get(clientId) ?? []).filter((p) => !p.archived);
    const usable = packs.filter((p) => packUsable(p, today));
    const left = usable.reduce((n, p) => n + p.remaining, 0);
    if (left > 1) continue;
    if (left === 1) out.set(clientId, "Bono: queda 1 sesión");
    else out.set(clientId, packs.at(-1)!.remaining === 0 ? "Bono agotado: toca renovar" : "Bono caducado");
  }
  return out;
}
