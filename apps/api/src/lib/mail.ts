import nodemailer from "nodemailer";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { outbox, studios } from "../db/schema";

export type MailMessage = { to: string; subject: string; html: string; text: string };
/** Cómo se entrega un correo (SMTP de Brevo en producción; uno falso que los guarda en tests y e2e). */
export type MailTransport = (m: MailMessage) => Promise<void>;

export function createSmtpTransport(o: { host: string; port: number; user: string; pass: string; from: string }): MailTransport {
  const t = nodemailer.createTransport({ host: o.host, port: o.port, secure: o.port === 465, auth: { user: o.user, pass: o.pass } });
  return async (m) => void (await t.sendMail({ from: o.from, to: m.to, subject: m.subject, html: m.html, text: m.text }));
}

export function createFakeTransport() {
  const sent: MailMessage[] = [];
  let failNext = 0;
  const send: MailTransport = async (m) => {
    if (failNext > 0) {
      failNext--;
      throw new Error("SMTP caído (simulado)");
    }
    sent.push(m);
  };
  return { send, sent, failNext: (n: number) => void (failNext = n) };
}

type Q = Pick<DB, "insert">;
export type Enqueue = { to: string; kind: string; studioId?: string | null; userId?: string | null; clientId?: string | null } & Pick<MailMessage, "subject" | "html" | "text">;

/**
 * Correo de la app: encolar es una inserción (vale dentro de una transacción: si la operación se deshace, el correo no
 * sale); `flush` envía lo pendiente con reintentos (1, 2, 4… minutos; se abandona tras 6 intentos).
 * Sin transporte (sin clave de Brevo, o en la demo), `enabled` es falso y no se encola nada.
 */
export function createMailer(db: DB, transport: MailTransport | null, log: (e: unknown, msg: string) => void = () => {}) {
  let running: Promise<number> | null = null;
  const flushOnce = async () => {
    if (!transport) return 0;
    // `skip locked`: dos envíos simultáneos (el planificador y uno inmediato) no mandan el mismo correo dos veces.
    const due = await db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        select id from outbox where sent_at is null and attempts < ${MAX_ATTEMPTS} and next_attempt_at <= now()
        order by created_at limit 20 for update skip locked`);
      const ids = Array.from(rows as unknown as { id: string }[]).map((r) => r.id);
      if (ids.length === 0) return [];
      // Se reserva un rato para que nadie más los coja mientras se envían.
      return tx
        .update(outbox)
        .set({ nextAttemptAt: sql`now() + interval '2 minutes'` })
        .where(inArray(outbox.id, ids))
        .returning();
    });
    let sent = 0;
    for (const m of due) {
      try {
        await transport({ to: m.toEmail, subject: m.subject, html: m.html ?? "", text: m.text ?? "" });
        await db.update(outbox).set({ sentAt: new Date(), html: null, text: null, lastError: null }).where(eq(outbox.id, m.id));
        sent++;
      } catch (e) {
        const attempts = m.attempts + 1;
        log(e, `correo ${m.kind}: fallo ${attempts}/${MAX_ATTEMPTS}`);
        await db
          .update(outbox)
          .set({ attempts, lastError: String((e as Error)?.message ?? e).slice(0, 300), nextAttemptAt: sql`now() + ${`${2 ** (attempts - 1)} minutes`}::interval` })
          .where(eq(outbox.id, m.id));
      }
    }
    return sent;
  };
  const mailer = {
    enabled: transport !== null,
    async enqueue(q: Q, m: Enqueue) {
      if (!transport) return false;
      await q.insert(outbox).values({ studioId: m.studioId ?? null, userId: m.userId ?? null, clientId: m.clientId ?? null, kind: m.kind, toEmail: m.to, subject: m.subject, html: m.html, text: m.text });
      return true;
    },
    /** Envía lo pendiente ahora (una sola tanda a la vez). */
    flush() {
      running ??= flushOnce().finally(() => (running = null));
      return running;
    },
    /** Tras responder: se intenta enviar ya, sin hacer esperar a la petición. */
    kick() {
      if (transport) setImmediate(() => void mailer.flush().catch((e) => log(e, "correo: envío")));
    },
  };
  return mailer;
}
export type Mailer = ReturnType<typeof createMailer>;
const MAX_ATTEMPTS = 6;

/** Limpieza (planificador): enviados o abandonados de hace más de 7 días. */
export async function purgeOutbox(db: DB) {
  const r = await db.delete(outbox).where(and(lte(outbox.createdAt, sql`now() - interval '7 days'`), sql`(${outbox.sentAt} is not null or ${outbox.attempts} >= ${MAX_ATTEMPTS})`)).returning({ id: outbox.id });
  return r.length;
}

export const pendingMail = (db: DB) => db.select().from(outbox).where(isNull(outbox.sentAt));

/** Nombre del estudio para la cabecera de los correos. */
export async function brandOf(db: DB, studioId: string) {
  const [s] = await db.select({ name: studios.name }).from(studios).where(eq(studios.id, studioId));
  return { studioName: s?.name ?? "Tu entrenador" };
}
