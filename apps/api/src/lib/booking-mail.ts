import { and, eq, isNull, notExists } from "drizzle-orm";
import type { AppConfig } from "../config";
import type { DB } from "../db/client";
import { appointments, clientProfiles, pushSubscriptions, users } from "../db/schema";
import { brandOf, type Mailer } from "./mail";
import { mailTemplates, whenEs } from "./mail-templates";

/**
 * Correos de reservas: al cliente, confirmación o cancelación (si no ha desactivado los correos); al entrenador, la
 * reserva nueva solo si no tiene avisos en el móvil (si los tiene, ya le llega el push). Nunca hace fallar la reserva.
 */
export async function sendBookingMail(db: DB, mail: Mailer, cfg: Pick<AppConfig, "publicUrl">, appointmentId: string, kind: "confirmed" | "cancelled") {
  if (!mail.enabled) return;
  const [row] = await db
    .select({ a: appointments, name: clientProfiles.name, userId: users.id, email: users.email, notify: users.emailNotifications, unsub: users.unsubscribeToken })
    .from(appointments)
    .innerJoin(clientProfiles, eq(clientProfiles.id, appointments.clientId))
    .innerJoin(users, eq(users.id, clientProfiles.userId))
    .where(eq(appointments.id, appointmentId));
  if (!row) return;
  const brand = await brandOf(db, row.a.studioId);
  const when = whenEs(row.a.startsAt);
  const unsub = (t: string) => `${cfg.publicUrl}/baja?token=${t}`;
  if (row.notify) {
    const t =
      kind === "confirmed"
        ? mailTemplates.bookingConfirmed(brand, { name: row.name, when, location: row.a.location, url: `${cfg.publicUrl}/app/agenda`, unsubscribeUrl: unsub(row.unsub) })
        : mailTemplates.bookingCancelled(brand, { name: row.name, when, url: `${cfg.publicUrl}/app/reservar`, unsubscribeUrl: unsub(row.unsub) });
    await mail.enqueue(db, { kind: `booking_${kind}`, to: row.email, userId: row.userId, studioId: row.a.studioId, ...t });
  }
  if (kind === "confirmed") {
    const coaches = await db
      .select({ id: users.id, name: users.name, email: users.email, unsub: users.unsubscribeToken })
      .from(users)
      .where(
        and(
          eq(users.studioId, row.a.studioId),
          eq(users.role, "coach"),
          eq(users.emailNotifications, true),
          isNull(users.deletedAt),
          notExists(db.select({ x: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, users.id))),
        ),
      );
    for (const c of coaches) {
      const t = mailTemplates.newBookingForCoach(brand, { coachName: c.name, clientName: row.name, when, url: `${cfg.publicUrl}/coach/calendario`, unsubscribeUrl: unsub(c.unsub) });
      await mail.enqueue(db, { kind: "booking_coach", to: c.email, userId: c.id, studioId: row.a.studioId, ...t });
    }
  }
  mail.kick();
}
