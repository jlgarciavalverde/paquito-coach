import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { Appointment, AttendanceStatus, Ok, SessionPack, SessionPackInput, packUsable } from "@coach/shared";
import { appointments, clientProfiles, sessionPacks } from "../db/schema";
import { packsOf } from "../lib/packs";
import { HttpError, notFound } from "../lib/errors";
import { audit } from "../lib/audit";
import { madridClock } from "../lib/scheduler";
import { requireActiveClient, requireCoach } from "../lib/session";
import { typed, type Ctx } from "./ctx";

const IdParams = z.object({ id: z.string().uuid() });

/**
 * Bonos de sesiones (H3). Una cita con cliente marcada «hecha» o «no vino» descuenta del bono utilizable más antiguo;
 * volver a «programada» o «cancelada» la devuelve. El uso se calcula contando citas (no hay contador que se desincronice).
 */
export function registerPacks(app: FastifyInstance, { db }: Ctx) {
  const api = typed(app);

  async function coachClient(studioId: string, id: string) {
    const [c] = await db.select({ id: clientProfiles.id }).from(clientProfiles).where(and(eq(clientProfiles.id, id), eq(clientProfiles.studioId, studioId)));
    if (!c) throw notFound("Cliente");
    return c.id;
  }
  async function ownedPack(studioId: string, id: string) {
    const [p] = await db.select().from(sessionPacks).where(and(eq(sessionPacks.id, id), eq(sessionPacks.studioId, studioId)));
    if (!p) throw notFound("Bono");
    return p;
  }

  api.get("/clients/:id/packs", { schema: { tags: ["agenda"], params: IdParams, response: { 200: z.array(SessionPack) } } }, async (req) => {
    const u = requireCoach(req);
    return packsOf(db, await coachClient(u.studioId, req.params.id));
  });
  api.post("/clients/:id/packs", { schema: { tags: ["agenda"], params: IdParams, body: SessionPackInput, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    const clientId = await coachClient(u.studioId, req.params.id);
    await db.insert(sessionPacks).values({ ...req.body, studioId: u.studioId, clientId });
    await audit(db, req, "pack.create", { type: "client", id: clientId }, { total: req.body.total });
    return { ok: true as const };
  });
  api.put(
    "/packs/:id",
    { schema: { tags: ["agenda"], params: IdParams, body: SessionPackInput.extend({ archived: z.boolean().default(false) }), response: { 200: Ok } } },
    async (req) => {
      const u = requireCoach(req);
      await ownedPack(u.studioId, req.params.id);
      const { archived, ...rest } = req.body;
      await db.update(sessionPacks).set({ ...rest, archivedAt: archived ? sql`coalesce(${sessionPacks.archivedAt}, now())` : null }).where(eq(sessionPacks.id, req.params.id));
      return { ok: true as const };
    },
  );
  api.delete("/packs/:id", { schema: { tags: ["agenda"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    await ownedPack(u.studioId, req.params.id);
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(appointments).where(eq(appointments.packId, req.params.id));
    if (n > 0) throw new HttpError(409, "in_use", "Este bono ya tiene sesiones descontadas: archívalo en lugar de borrarlo");
    await db.delete(sessionPacks).where(eq(sessionPacks.id, req.params.id));
    return { ok: true as const };
  });

  /** Marca la asistencia de una cita y descuenta (o devuelve) la sesión del bono. */
  api.post(
    "/appointments/:id/attendance",
    { schema: { tags: ["agenda"], params: IdParams, body: z.object({ status: AttendanceStatus }), response: { 200: Appointment } } },
    async (req) => {
      const u = requireCoach(req);
      const [a] = await db.select().from(appointments).where(and(eq(appointments.id, req.params.id), eq(appointments.studioId, u.studioId)));
      if (!a) throw notFound("Cita");
      const { status } = req.body;
      // Cerrojo por cliente: marcar dos citas a la vez no gasta dos veces la última sesión del mismo bono.
      const r = await db.transaction(async (tx) => {
        let packId: string | null = null;
        if ((status === "done" || status === "no_show") && a.clientId) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pack:" + a.clientId}))`);
          const [cur] = await tx.select({ packId: appointments.packId }).from(appointments).where(eq(appointments.id, a.id));
          if (cur?.packId) packId = cur.packId;
          else {
            const date = madridClock(a.startsAt).date;
            packId = (await packsOf(tx, a.clientId)).find((p) => packUsable(p, date))?.id ?? null;
          }
        }
        const [row] = await tx.update(appointments).set({ status, packId, updatedAt: new Date() }).where(eq(appointments.id, a.id)).returning();
        return row;
      });
      const [c] = a.clientId ? await db.select({ name: clientProfiles.name }).from(clientProfiles).where(eq(clientProfiles.id, a.clientId)) : [];
      return {
        id: r!.id,
        status: r!.status,
        packId: r!.packId,
        clientId: r!.clientId,
        clientName: c?.name ?? null,
        kind: r!.kind,
        title: r!.title,
        startsAt: r!.startsAt.toISOString(),
        endsAt: r!.endsAt.toISOString(),
        location: r!.location,
        notes: r!.notes,
      };
    },
  );

  // ── Cliente: sus bonos en uso ──
  api.get("/me/packs", { schema: { tags: ["agenda"], response: { 200: z.array(SessionPack) } } }, async (req) => {
    const c = requireActiveClient(req);
    return (await packsOf(db, c.clientId)).filter((p) => !p.archived);
  });
}
