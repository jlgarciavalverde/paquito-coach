import { rm } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, gte, isNull, lt, or, sql, ne } from "drizzle-orm";
import type { DB } from "../db/client";
import { appointments, auditLog, checkinAssignments, checkinForms, clientProfiles, passwordResets, reminderLog, sessions, users, workouts } from "../db/schema";
import type { PushSender } from "./push";

/** Hora y fecha en Madrid (el estudio está en España; ver docs/ESTADO.md si algún día hay estudios en otras zonas). */
export function madridClock(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

/** Marca el recordatorio como enviado; devuelve false si ya se había mandado (idempotente tras reinicios). */
async function claim(db: DB, kind: string, userId: string, date: string) {
  const r = await db.insert(reminderLog).values({ kind, userId, date }).onConflictDoNothing().returning({ k: reminderLog.kind });
  return r.length > 0;
}

/**
 * Recordatorios del día. Mañana (de 8:00 a 11:00): al cliente, lo que le toca; al entrenador, el resumen del día.
 * Tarde (desde las 20:00): al cliente que aún no ha registrado el entreno de hoy. Cada uno como mucho una vez al día.
 * Fuera de esas franjas no se manda nada (si el servidor arranca a mediodía, no llega «Hoy toca entrenar» a las 14:00).
 */
export async function runReminders(db: DB, push: PushSender, now = new Date()) {
  const { date, hour } = madridClock(now);
  const sent: string[] = [];
  const evening = hour >= 20;
  if (hour < 8 || (hour >= 11 && !evening)) return sent;

  // Clientes con entreno hoy (sin hacer) y cuenta activa con recordatorios
  const todays = await db
    .select({ userId: users.id, title: workouts.title, status: workouts.status })
    .from(workouts)
    .innerJoin(clientProfiles, eq(clientProfiles.id, workouts.clientId))
    .innerJoin(users, eq(users.id, clientProfiles.userId))
    .where(and(eq(workouts.date, date), eq(clientProfiles.status, "active"), eq(users.reminders, true), isNull(users.deletedAt)));
  // Un aviso por cliente con todos sus entrenos pendientes de hoy (antes solo se nombraba el primero)
  const byUser = new Map<string, string[]>();
  for (const w of todays) if (w.status === "planned") byUser.set(w.userId, [...(byUser.get(w.userId) ?? []), w.title]);
  for (const [userId, titles] of byUser) {
    const kind = evening ? "client-evening" : "client-morning";
    if (!(await claim(db, kind, userId, date))) continue;
    const list = titles.map((t) => `«${t}»`).join(" y ");
    await push([userId], evening
      ? { title: "¿Has entrenado hoy?", body: `Te falta anotar ${list}. Si no has podido, márcalo también: tu entrenador lo verá.`, url: "/app/entreno", tag: "recordatorio" }
      : { title: "Hoy toca entrenar", body: `Tienes ${list}. Ábrelo para ver los ejercicios.`, url: "/app", tag: "recordatorio" });
    sent.push(`${kind}:${userId}`);
  }

  // Check-ins que tocan hoy (por la mañana; uno por cliente y día)
  if (!evening) {
    const due = await db
      .selectDistinctOn([users.id], { userId: users.id, form: checkinForms.name })
      .from(checkinAssignments)
      .innerJoin(checkinForms, eq(checkinForms.id, checkinAssignments.formId))
      .innerJoin(clientProfiles, eq(clientProfiles.id, checkinAssignments.clientId))
      .innerJoin(users, eq(users.id, clientProfiles.userId))
      .where(and(eq(checkinAssignments.nextDue, date), eq(clientProfiles.status, "active"), eq(users.reminders, true), isNull(users.deletedAt)));
    for (const d of due) {
      if (!(await claim(db, "client-checkin", d.userId, date))) continue;
      await push([d.userId], { title: "Te toca el check-in", body: `«${d.form}»: son dos minutos y le ayuda a tu entrenador a ajustar tu plan.`, url: "/app", tag: "checkin" });
      sent.push(`client-checkin:${d.userId}`);
    }
  }

  // Resumen para cada entrenador (solo por la mañana y si hay algo)
  if (!evening) {
    const coaches = await db.select({ id: users.id, studioId: users.studioId }).from(users).where(and(eq(users.role, "coach"), eq(users.reminders, true), isNull(users.deletedAt)));
    for (const c of coaches) {
      const start = new Date(`${date}T00:00:00Z`);
      const end = new Date(start.getTime() + 36 * 3600000); // margen de zona horaria; se filtra por fecha local abajo
      const appts = (
        await db.select({ startsAt: appointments.startsAt }).from(appointments).where(and(eq(appointments.studioId, c.studioId), ne(appointments.status, "cancelled"), gte(appointments.startsAt, new Date(start.getTime() - 12 * 3600000)), lt(appointments.startsAt, end)))
      ).filter((a) => madridClock(a.startsAt).date === date).length;
      const [{ n: wo } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(workouts).where(and(eq(workouts.studioId, c.studioId), eq(workouts.date, date)));
      if (appts + wo === 0) continue;
      if (!(await claim(db, "coach-morning", c.id, date))) continue;
      const parts = [appts ? `${appts} ${appts === 1 ? "cita" : "citas"}` : "", wo ? `${wo} ${wo === 1 ? "entreno" : "entrenos"} de tus clientes` : ""].filter(Boolean);
      await push([c.id], { title: "Tu día", body: `Hoy tienes ${parts.join(" y ")}.`, url: "/coach", tag: "resumen" });
      sent.push(`coach-morning:${c.id}`);
    }
  }
  return sent;
}

/** Reservas retenidas para pagar cuya retención ha caducado sin pago: se cancelan y el hueco vuelve a estar libre. */
export async function releaseHolds(db: DB, onReleased?: (appointmentIds: string[]) => Promise<void>) {
  const r = await db
    .update(appointments)
    .set({ status: "cancelled", holdExpiresAt: null })
    .where(and(eq(appointments.paymentStatus, "pending"), eq(appointments.status, "scheduled"), lt(appointments.holdExpiresAt, sql`now()`)))
    .returning({ id: appointments.id });
  if (r.length && onReleased) await onReleased(r.map((x) => x.id));
  return r.length;
}

/**
 * Archivos subidos que nadie usa tras un día: una foto que el cliente subió y no llegó a enviar, un PDF que no acabó en el
 * material… Se buscan referencias en mensajes, fotos de progreso, material y respuestas de check-in (guardan el id en JSON).
 */
export async function purgeOrphanMedia(db: DB, mediaDir?: string) {
  const rows = await db.execute<{ id: string }>(sql`
    delete from media m
    where m.created_at < now() - interval '1 day'
      and not exists (select 1 from messages x where x.media_id = m.id)
      and not exists (select 1 from progress_photos x where x.media_id = m.id)
      and not exists (select 1 from resources x where x.media_id = m.id)
      and not exists (select 1 from checkin_responses r, jsonb_each_text(r.answers) a where r.client_id = m.client_id and a.value = m.id::text)
    returning m.id`);
  if (mediaDir) await Promise.all(rows.map((r) => rm(join(mediaDir, r.id), { force: true })));
  return rows.length;
}

/**
 * Limpieza: sesiones caducadas (60 días sin uso o 180 de edad), enlaces de restablecer caducados hace más de un día,
 * registro de auditoría de más de 2 años (plazo de conservación, ver `docs/seguridad.md`) y archivos huérfanos.
 */
export async function purgeExpired(db: DB, mediaDir?: string) {
  const s = await db.delete(sessions).where(or(lt(sessions.lastUsedAt, sql`now() - interval '60 days'`), lt(sessions.createdAt, sql`now() - interval '180 days'`))).returning({ id: sessions.id });
  const r = await db.delete(passwordResets).where(lt(passwordResets.expiresAt, sql`now() - interval '1 day'`)).returning({ id: passwordResets.id });
  const a = await db.delete(auditLog).where(lt(auditLog.createdAt, sql`now() - interval '2 years'`)).returning({ id: auditLog.id });
  const media = await purgeOrphanMedia(db, mediaDir);
  return { sessions: s.length, resets: r.length, audit: a.length, media };
}

type SchedulerOpts = { onHoldsReleased?: (appointmentIds: string[]) => Promise<void>; mediaDir?: string };

/** Comprueba cada 5 minutos si toca mandar algo (sin cron externo). */
export function startReminders(db: DB, push: PushSender, log: (e: unknown) => void, opts: SchedulerOpts = {}) {
  const tick = () => void Promise.all([runReminders(db, push), releaseHolds(db, opts.onHoldsReleased), purgeExpired(db, opts.mediaDir)]).catch(log);
  const id = setInterval(tick, 5 * 60_000);
  id.unref();
  setTimeout(tick, 30_000).unref();
  return () => clearInterval(id);
}
