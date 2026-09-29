import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { appointments, clientProfiles, reminderLog, users, workouts } from "../db/schema";
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
 * Recordatorios del día. Mañana (desde las 8:00): al cliente, el entreno que le toca; al entrenador, el resumen del día.
 * Tarde (desde las 20:00): al cliente que aún no ha registrado el entreno de hoy. Cada uno como mucho una vez al día.
 */
export async function runReminders(db: DB, push: PushSender, now = new Date()) {
  const { date, hour } = madridClock(now);
  const sent: string[] = [];
  if (hour < 8) return sent;
  const evening = hour >= 20;

  // Clientes con entreno hoy (sin hacer) y cuenta activa con recordatorios
  const todays = await db
    .select({ userId: users.id, title: workouts.title, status: workouts.status })
    .from(workouts)
    .innerJoin(clientProfiles, eq(clientProfiles.id, workouts.clientId))
    .innerJoin(users, eq(users.id, clientProfiles.userId))
    .where(and(eq(workouts.date, date), eq(clientProfiles.status, "active"), eq(users.reminders, true), isNull(users.deletedAt)));
  const planned = todays.filter((w) => w.status === "planned");
  for (const w of planned) {
    const kind = evening ? "client-evening" : "client-morning";
    if (!(await claim(db, kind, w.userId, date))) continue;
    await push([w.userId], evening
      ? { title: "¿Has entrenado hoy?", body: `Te falta anotar «${w.title}». Si no has podido, márcalo también: tu entrenador lo verá.`, url: "/app/entreno", tag: "recordatorio" }
      : { title: "Hoy toca entrenar", body: `Tienes «${w.title}». Ábrelo para ver los ejercicios.`, url: "/app", tag: "recordatorio" });
    sent.push(`${kind}:${w.userId}`);
  }

  // Resumen para cada entrenador (solo por la mañana y si hay algo)
  if (!evening) {
    const coaches = await db.select({ id: users.id, studioId: users.studioId }).from(users).where(and(eq(users.role, "coach"), eq(users.reminders, true), isNull(users.deletedAt)));
    for (const c of coaches) {
      const start = new Date(`${date}T00:00:00Z`);
      const end = new Date(start.getTime() + 36 * 3600000); // margen de zona horaria; se filtra por fecha local abajo
      const appts = (
        await db.select({ startsAt: appointments.startsAt }).from(appointments).where(and(eq(appointments.studioId, c.studioId), gte(appointments.startsAt, new Date(start.getTime() - 12 * 3600000)), lt(appointments.startsAt, end)))
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

/** Comprueba cada 5 minutos si toca mandar algo (sin cron externo). */
export function startReminders(db: DB, push: PushSender, log: (e: unknown) => void) {
  const tick = () => void runReminders(db, push).catch(log);
  const id = setInterval(tick, 5 * 60_000);
  id.unref();
  setTimeout(tick, 30_000).unref();
  return () => clearInterval(id);
}
