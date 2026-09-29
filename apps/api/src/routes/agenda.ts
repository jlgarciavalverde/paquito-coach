import type { FastifyInstance } from "fastify";
import { and, asc, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { Appointment, AppointmentBody, AppointmentPatch, Ok, TimeRange } from "@coach/shared";
import { appointments, clientProfiles } from "../db/schema";
import { HttpError, notFound } from "../lib/errors";
import { requireActiveClient, requireCoach } from "../lib/session";
import { typed, type Ctx } from "./ctx";

const IdParams = z.object({ id: z.string().uuid() });
type Row = typeof appointments.$inferSelect;

const toAppointment = (a: Row, clientName: string | null): Appointment => ({
  id: a.id,
  clientId: a.clientId,
  clientName,
  kind: a.kind,
  title: a.title,
  startsAt: a.startsAt.toISOString(),
  endsAt: a.endsAt.toISOString(),
  location: a.location,
  notes: a.notes,
});

const MAX_RANGE_MS = 62 * 24 * 3600 * 1000;

export function registerAgenda(app: FastifyInstance, { db }: Ctx) {
  const api = typed(app);

  function checkRange(q: { from: string; to: string }) {
    const span = new Date(q.to).getTime() - new Date(q.from).getTime();
    if (span <= 0 || span > MAX_RANGE_MS) throw new HttpError(400, "bad_range", "Rango de fechas no válido (máximo dos meses)");
  }
  async function assertClient(studioId: string, clientId: string | null | undefined) {
    if (!clientId) return;
    const [c] = await db.select({ id: clientProfiles.id }).from(clientProfiles).where(and(eq(clientProfiles.id, clientId), eq(clientProfiles.studioId, studioId)));
    if (!c) throw notFound("Cliente");
  }
  async function owned(studioId: string, id: string) {
    const [a] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.studioId, studioId)));
    if (!a) throw notFound("Cita");
    return a;
  }
  async function nameOf(clientId: string | null) {
    if (!clientId) return null;
    const [c] = await db.select({ name: clientProfiles.name }).from(clientProfiles).where(eq(clientProfiles.id, clientId));
    return c?.name ?? null;
  }

  /** Citas que se solapan con el rango (una cita de 23:30 a 00:30 aparece en ambos días). */
  api.get("/appointments", { schema: { tags: ["agenda"], querystring: TimeRange.extend({ clientId: z.string().uuid().optional() }), response: { 200: z.array(Appointment) } } }, async (req) => {
    const u = requireCoach(req);
    checkRange(req.query);
    const where = [eq(appointments.studioId, u.studioId), lt(appointments.startsAt, new Date(req.query.to)), gt(appointments.endsAt, new Date(req.query.from))];
    if (req.query.clientId) where.push(eq(appointments.clientId, req.query.clientId));
    const rows = await db
      .select({ a: appointments, name: clientProfiles.name })
      .from(appointments)
      .leftJoin(clientProfiles, eq(clientProfiles.id, appointments.clientId))
      .where(and(...where))
      .orderBy(asc(appointments.startsAt));
    return rows.map((r) => toAppointment(r.a, r.name));
  });

  api.post("/appointments", { schema: { tags: ["agenda"], body: AppointmentBody, response: { 200: Appointment } } }, async (req) => {
    const u = requireCoach(req);
    const b = req.body;
    await assertClient(u.studioId, b.clientId);
    const [a] = await db
      .insert(appointments)
      .values({ ...b, startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt), studioId: u.studioId, createdBy: u.id })
      .returning();
    return toAppointment(a!, await nameOf(a!.clientId));
  });

  api.patch("/appointments/:id", { schema: { tags: ["agenda"], params: IdParams, body: AppointmentPatch, response: { 200: Appointment } } }, async (req) => {
    const u = requireCoach(req);
    const cur = await owned(u.studioId, req.params.id);
    const b = req.body;
    if (b.clientId !== undefined) await assertClient(u.studioId, b.clientId);
    const startsAt = b.startsAt ? new Date(b.startsAt) : cur.startsAt;
    const endsAt = b.endsAt ? new Date(b.endsAt) : cur.endsAt;
    if (endsAt <= startsAt) throw new HttpError(400, "validation", "La cita tiene que terminar después de empezar");
    const [a] = await db
      .update(appointments)
      .set({ ...b, startsAt, endsAt, updatedAt: new Date() })
      .where(eq(appointments.id, cur.id))
      .returning();
    return toAppointment(a!, await nameOf(a!.clientId));
  });

  api.delete("/appointments/:id", { schema: { tags: ["agenda"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    await owned(u.studioId, req.params.id);
    await db.delete(appointments).where(eq(appointments.id, req.params.id));
    return { ok: true as const };
  });

  /** Las citas del cliente (sin las notas internas del entrenador). */
  api.get("/me/appointments", { schema: { tags: ["agenda"], querystring: TimeRange, response: { 200: z.array(Appointment) } } }, async (req) => {
    const c = requireActiveClient(req);
    checkRange(req.query);
    const rows = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.clientId, c.clientId), eq(appointments.studioId, c.studioId), lt(appointments.startsAt, new Date(req.query.to)), gt(appointments.endsAt, new Date(req.query.from))))
      .orderBy(asc(appointments.startsAt));
    return rows.map((a) => ({ ...toAppointment(a, c.name), notes: "" }));
  });
}
