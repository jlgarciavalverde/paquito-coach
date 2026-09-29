import type { FastifyInstance } from "fastify";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { Appointment, BookingInfo, BookingSettings, DEFAULT_BOOKING, DateOnly, Ok, isoWeekday, slotStartsFor, type BookingSlot } from "@coach/shared";
import { appointments, bookingSettings, users } from "../db/schema";
import { HttpError, notFound } from "../lib/errors";
import type { PushSender } from "../lib/push";
import { madridClock } from "../lib/scheduler";
import { madridInstant } from "../lib/tz";
import { requireActiveClient, requireCoach } from "../lib/session";
import { typed, type Ctx } from "./ctx";

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const MAX_DAYS = 28;

/**
 * Reservas por el cliente (H3b): el entrenador publica franjas semanales; el cliente ve los huecos libres y reserva o cancela
 * con la antelación marcada. Un hueco está ocupado por citas que se solapan (las citas sin cliente lo bloquean entero).
 */
export function registerBooking(app: FastifyInstance, { db }: Ctx, deps: { push: PushSender }) {
  const api = typed(app);

  async function settingsOf(studioId: string): Promise<BookingSettings> {
    const [s] = await db.select().from(bookingSettings).where(eq(bookingSettings.studioId, studioId));
    if (!s) return DEFAULT_BOOKING;
    return { enabled: s.enabled, slotMinutes: s.slotMinutes, capacity: s.capacity, noticeHours: s.noticeHours, cancelHours: s.cancelHours, location: s.location, windows: s.windows };
  }

  /** Huecos libres de `from` durante `days` días para `clientId` (sin los que ya tiene él ocupados). */
  async function freeSlots(studioId: string, clientId: string, s: BookingSettings, from: string, days: number): Promise<BookingSlot[]> {
    if (!s.enabled || s.windows.length === 0) return [];
    const start = madridInstant(from, 0);
    const end = madridInstant(addDays(from, days), 0);
    const busy = await db
      .select({ clientId: appointments.clientId, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
      .from(appointments)
      .where(and(eq(appointments.studioId, studioId), ne(appointments.status, "cancelled"), lt(appointments.startsAt, end), gt(appointments.endsAt, start)));
    const earliest = Date.now() + s.noticeHours * 3600_000;
    const out: BookingSlot[] = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(from, i);
      for (const m of slotStartsFor(isoWeekday(date), s.windows, s.slotMinutes)) {
        const a = madridInstant(date, m);
        const b = madridInstant(date, m + s.slotMinutes);
        if (a.getTime() < earliest) continue;
        const over = busy.filter((x) => x.startsAt < b && x.endsAt > a);
        if (over.some((x) => x.clientId === null || x.clientId === clientId)) continue;
        const free = s.capacity - over.length;
        if (free > 0) out.push({ startsAt: a.toISOString(), endsAt: b.toISOString(), free });
      }
    }
    return out;
  }

  // ── Entrenador ──
  api.get("/studio/booking", { schema: { tags: ["agenda"], response: { 200: BookingSettings } } }, async (req) => settingsOf(requireCoach(req).studioId));
  api.put("/studio/booking", { schema: { tags: ["agenda"], body: BookingSettings, response: { 200: BookingSettings } } }, async (req) => {
    const u = requireCoach(req);
    const v = { ...req.body, updatedAt: new Date() };
    await db.insert(bookingSettings).values({ ...v, studioId: u.studioId }).onConflictDoUpdate({ target: bookingSettings.studioId, set: v });
    return settingsOf(u.studioId);
  });

  // ── Cliente ──
  api.get("/me/booking", { schema: { tags: ["agenda"], querystring: z.object({ from: DateOnly, days: z.coerce.number().int().min(1).max(MAX_DAYS).default(14) }), response: { 200: BookingInfo } } }, async (req) => {
    const c = requireActiveClient(req);
    const s = await settingsOf(c.studioId);
    return { enabled: s.enabled, cancelHours: s.cancelHours, location: s.location, slots: await freeSlots(c.studioId, c.clientId, s, req.query.from, req.query.days) };
  });

  api.post(
    "/me/booking",
    { schema: { tags: ["agenda"], body: z.object({ startsAt: z.string().datetime({ offset: true }) }), response: { 200: Appointment } }, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) => {
      const c = requireActiveClient(req);
      const s = await settingsOf(c.studioId);
      if (!s.enabled) throw new HttpError(409, "booking_off", "Tu entrenador no tiene activadas las reservas");
      const at = new Date(req.body.startsAt);
      const date = madridClock(at).date;
      const row = await db.transaction(async (tx) => {
        // Un cerrojo por estudio: dos reservas a la vez no pueden quedarse con la última plaza.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${c.studioId}))`);
        const slot = (await freeSlots(c.studioId, c.clientId, s, date, 1)).find((x) => new Date(x.startsAt).getTime() === at.getTime());
        if (!slot) throw new HttpError(409, "slot_taken", "Ese hueco ya no está libre. Elige otro.");
        const [a] = await tx
          .insert(appointments)
          .values({ studioId: c.studioId, clientId: c.clientId, kind: "session", startsAt: at, endsAt: new Date(slot.endsAt), location: s.location, bookedByClient: true, createdBy: c.id })
          .returning();
        return a!;
      });
      const coaches = await db.select({ id: users.id }).from(users).where(and(eq(users.studioId, c.studioId), eq(users.role, "coach")));
      const when = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(at);
      void deps.push(coaches.map((x) => x.id), { title: "Nueva reserva", body: `${c.name} ha reservado el ${when}.`, url: "/coach/calendario", tag: "reserva" }).catch(() => {});
      return { id: row.id, status: row.status, packId: row.packId, clientId: row.clientId, clientName: c.name, kind: row.kind, title: row.title, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), location: row.location, notes: "" };
    },
  );

  /** El cliente cancela su cita si falta más de `cancelHours`; si no, tiene que hablarlo con el entrenador. */
  api.post("/me/appointments/:id/cancel", { schema: { tags: ["agenda"], params: z.object({ id: z.string().uuid() }), response: { 200: Ok } } }, async (req) => {
    const c = requireActiveClient(req);
    const [a] = await db.select().from(appointments).where(and(eq(appointments.id, req.params.id), eq(appointments.clientId, c.clientId)));
    if (!a) throw notFound("Cita");
    if (a.status !== "scheduled") throw new HttpError(409, "not_cancellable", "Esta cita ya no se puede cancelar");
    const s = await settingsOf(c.studioId);
    if (a.startsAt.getTime() - Date.now() < s.cancelHours * 3600_000)
      throw new HttpError(409, "too_late", `Solo se puede cancelar con ${s.cancelHours} horas de antelación. Escribe a tu entrenador.`);
    await db.update(appointments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(appointments.id, a.id));
    const coaches = await db.select({ id: users.id }).from(users).where(and(eq(users.studioId, c.studioId), eq(users.role, "coach")));
    const when = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(a.startsAt);
    void deps.push(coaches.map((x) => x.id), { title: "Cita cancelada", body: `${c.name} ha cancelado la del ${when}.`, url: "/coach/calendario", tag: "reserva" }).catch(() => {});
    return { ok: true as const };
  });
}
