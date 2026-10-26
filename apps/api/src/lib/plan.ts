import { and, count, eq, inArray, sql } from "drizzle-orm";
import { PLANS, type PlanId } from "@coach/shared";
import type { DB } from "../db/client";
import { clientProfiles, studios } from "../db/schema";
import { HttpError } from "./errors";

/** Clientes que ocupan plaza: con cuenta, invitados y fichas sin cuenta. Los pendientes de aceptar y los archivados, no. */
const COUNTED = ["active", "invited", "no_account"] as const;

export async function activeClients(db: Pick<DB, "select">, studioId: string) {
  const [r] = await db.select({ n: count() }).from(clientProfiles).where(and(eq(clientProfiles.studioId, studioId), inArray(clientProfiles.status, [...COUNTED])));
  return r?.n ?? 0;
}

/** Antes de dar plaza a `adding` clientes más (crear ficha, aceptar, desarchivar). 402 si el plan no llega. */
export async function assertClientCapacity(db: Pick<DB, "select">, studioId: string, adding = 1) {
  const [s] = await db.select({ plan: studios.plan }).from(studios).where(eq(studios.id, studioId));
  const max = PLANS[(s?.plan ?? "fundador") as PlanId].maxClients;
  if (max === null) return;
  const n = await activeClients(db, studioId);
  if (n + adding > max) {
    throw new HttpError(402, "plan_limit", `Tu plan permite ${max} clientes a la vez y ya tienes ${n}. Archiva a alguno que ya no entrene contigo o cambia de plan en Ajustes → Plan.`);
  }
}

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Ocupa plaza de forma segura: con cerrojo por estudio, dos altas a la vez no pasan las dos del límite. */
export async function withClientSlot<T>(db: DB, studioId: string, fn: (tx: Tx) => Promise<T>, adding = 1): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"client-slots:" + studioId}))`);
    await assertClientCapacity(tx, studioId, adding);
    return fn(tx);
  });
}
