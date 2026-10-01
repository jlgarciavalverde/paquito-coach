import type { FastifyInstance, FastifyReply } from "fastify";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { and, asc, eq, or } from "drizzle-orm";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { z } from "zod";
import { Ok } from "@coach/shared";
import type { DB } from "../db/client";
import {
  appointments, auditLog, bodyMetrics, checkinAssignments, checkinForms, checkinResponses, clientProfiles, conversationReads, mealChecks, mealPlans, media, messages,
  metricDefs, metricValues, payments, programRuns, progressPhotos, pushSubscriptions, questionnaires, reminderLog, sessionPacks, sessions, subscriptions, users, workouts,
} from "../db/schema";
import { audit } from "../lib/audit";
import { HttpError, notFound } from "../lib/errors";
import { verifyPassword } from "../lib/passwords";
import { clearSessionCookie, requireActiveClient, requireCoach, requireUser } from "../lib/session";
import { typed, type Ctx } from "./ctx";
import type { Billing } from "./payments";

/**
 * Qué sección de la exportación cubre cada tabla con datos de un cliente (`client_id`) o de su cuenta (`user_id`).
 * `privacy.export.test.ts` lo recorre desde el catálogo de Postgres: una tabla nueva sin decidir aquí hace fallar la prueba.
 */
export const EXPORT_COVERAGE: Record<string, string> = {
  client_profiles: "ficha",
  sessions: "sesionesAbiertas",
  workouts: "entrenos",
  meal_plans: "planesDeComidas",
  meal_checks: "comidasMarcadas",
  appointments: "citas",
  media: "archivos",
  messages: "mensajes",
  conversation_reads: "chatLeidoHasta",
  push_subscriptions: "dispositivosConAvisos",
  body_metrics: "pesoYMedidas",
  questionnaires: "cuestionariosDeSalud",
  reminder_log: "avisosEnviados",
  progress_photos: "fotosDeProgreso",
  metric_values: "otrasMedidas",
  checkin_assignments: "checkInsProgramados",
  checkin_responses: "checkIns",
  program_runs: "programas",
  session_packs: "bonos",
  payments: "pagos",
  subscriptions: "cuotas",
};
/** Tablas con `client_id`/`user_id` que no se exportan, con el motivo. */
export const NOT_EXPORTED: Record<string, string> = {
  invites: "solo el hash de un enlace de un solo uso; no describe a la persona",
  password_resets: "solo el hash de un enlace de un solo uso; no describe a la persona",
  email_tokens: "solo el hash de un enlace de un solo uso (confirmar un correo nuevo); caduca en 24 horas",
  outbox: "correos pendientes de envío; el cuerpo se borra al enviarse y la fila a los 7 días",
};

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "application/pdf": "pdf" };

/**
 * Derechos RGPD: acceso/portabilidad (exportar en JSON) y supresión (borrar cuenta y datos).
 * El borrado es en cascada desde la ficha del cliente (entrenos, planes, citas, mensajes, fotos) y además
 * se borran del disco los archivos de sus fotos.
 */
export function registerPrivacy(app: FastifyInstance, { db, cfg }: Ctx, deps: { billing: Billing }) {
  const api = typed(app);
  const mediaDir = join(cfg.dataDir, "media");

  async function exportClient(clientId: string) {
    const [c] = await db.select().from(clientProfiles).where(eq(clientProfiles.id, clientId));
    if (!c) throw notFound("Cliente");
    const [u] = c.userId
      ? await db.select({ nombre: users.name, correo: users.email, creadaEl: users.createdAt, consentimientoSaludEl: users.healthConsentAt, recordatorios: users.reminders }).from(users).where(eq(users.id, c.userId))
      : [];
    const byUser = <T>(q: (userId: string) => Promise<T[]>) => (c.userId ? q(c.userId) : Promise.resolve([] as T[]));
    return {
      exportadoEl: new Date().toISOString(),
      explicacion: "Copia de todos los datos personales que la app guarda sobre ti (RGPD, arts. 15 y 20).",
      cuenta: u ?? null,
      ficha: {
        nombre: c.name, correo: c.email, telefono: c.phone, fechaNacimiento: c.birthDate, objetivo: c.goal,
        lesionesYLimitaciones: c.healthNotes, notasDelEntrenador: c.privateNotes, etiquetas: c.tags, estado: c.status, creadaEl: c.createdAt,
      },
      entrenos: await db.select({ fecha: workouts.date, titulo: workouts.title, indicaciones: workouts.coachNotes, prescripcion: workouts.blocks, registro: workouts.log, estado: workouts.status, esfuerzo: workouts.sessionRpe, comentario: workouts.clientComment, terminadoEl: workouts.completedAt }).from(workouts).where(eq(workouts.clientId, clientId)).orderBy(asc(workouts.date)),
      planesDeComidas: await db.select({ nombre: mealPlans.name, notas: mealPlans.notes, objetivos: mealPlans.targets, dias: mealPlans.days, activo: mealPlans.active, creadoEl: mealPlans.createdAt }).from(mealPlans).where(eq(mealPlans.clientId, clientId)),
      comidasMarcadas: await db.select({ fecha: mealChecks.date, comida: mealChecks.mealId, hecha: mealChecks.done, nota: mealChecks.note }).from(mealChecks).where(eq(mealChecks.clientId, clientId)).orderBy(asc(mealChecks.date)),
      pagos: await db.select({ concepto: payments.description, importeCentimos: payments.amountCents, estado: payments.status, creadoEl: payments.createdAt, pagadoEl: payments.paidAt }).from(payments).where(eq(payments.clientId, clientId)),
      cuotas: await db.select({ nombre: subscriptions.name, importeCentimos: subscriptions.amountCents, estado: subscriptions.status, periodoHasta: subscriptions.currentPeriodEnd, seCancelaAlFinal: subscriptions.cancelAtPeriodEnd, creadaEl: subscriptions.createdAt }).from(subscriptions).where(eq(subscriptions.clientId, clientId)),
      programas: await db.select({ nombre: programRuns.name, empieza: programRuns.start, semanas: programRuns.weeks, terminadoEl: programRuns.endedAt }).from(programRuns).where(eq(programRuns.clientId, clientId)),
      bonos: await db.select({ nombre: sessionPacks.name, sesiones: sessionPacks.total, caduca: sessionPacks.expires, precio: sessionPacks.price, pagado: sessionPacks.paid, creadoEl: sessionPacks.createdAt }).from(sessionPacks).where(eq(sessionPacks.clientId, clientId)),
      citas: await db.select({ tipo: appointments.kind, titulo: appointments.title, empieza: appointments.startsAt, termina: appointments.endsAt, lugar: appointments.location, notas: appointments.notes, asistencia: appointments.status, reservadaPorTi: appointments.bookedByClient, pago: appointments.paymentStatus }).from(appointments).where(eq(appointments.clientId, clientId)).orderBy(asc(appointments.startsAt)),
      cuestionariosDeSalud: await db.select({ enviadoEl: questionnaires.submittedAt, respuestas: questionnaires.answers, alertas: questionnaires.alerts, revisadoEl: questionnaires.reviewedAt }).from(questionnaires).where(eq(questionnaires.clientId, clientId)),
      pesoYMedidas: await db.select({ fecha: bodyMetrics.date, pesoKg: bodyMetrics.weightKg, cinturaCm: bodyMetrics.waistCm, caderaCm: bodyMetrics.hipCm, grasaPct: bodyMetrics.bodyFatPct, nota: bodyMetrics.note }).from(bodyMetrics).where(eq(bodyMetrics.clientId, clientId)).orderBy(asc(bodyMetrics.date)),
      fotosDeProgreso: await db.select({ fecha: progressPhotos.date, postura: progressPhotos.pose, foto: progressPhotos.mediaId }).from(progressPhotos).where(eq(progressPhotos.clientId, clientId)).orderBy(asc(progressPhotos.date)),
      otrasMedidas: await db.select({ fecha: metricValues.date, medida: metricDefs.name, unidad: metricDefs.unit, valor: metricValues.value, nota: metricValues.note }).from(metricValues).innerJoin(metricDefs, eq(metricDefs.id, metricValues.metricId)).where(eq(metricValues.clientId, clientId)).orderBy(asc(metricValues.date)),
      checkInsProgramados: await db.select({ formulario: checkinForms.name, cadaDias: checkinAssignments.everyDays, siguiente: checkinAssignments.nextDue }).from(checkinAssignments).innerJoin(checkinForms, eq(checkinForms.id, checkinAssignments.formId)).where(eq(checkinAssignments.clientId, clientId)),
      checkIns: await db.select({ formulario: checkinResponses.formName, preguntas: checkinResponses.questions, respuestas: checkinResponses.answers, tocaba: checkinResponses.dueDate, enviadoEl: checkinResponses.submittedAt }).from(checkinResponses).where(eq(checkinResponses.clientId, clientId)).orderBy(asc(checkinResponses.submittedAt)),
      mensajes: await db.select({ fecha: messages.createdAt, delEntrenador: messages.fromCoach, texto: messages.body, foto: messages.mediaId }).from(messages).where(eq(messages.clientId, clientId)).orderBy(asc(messages.createdAt)),
      chatLeidoHasta: await db.select({ quien: users.role, hasta: conversationReads.lastReadAt }).from(conversationReads).innerJoin(users, eq(users.id, conversationReads.userId)).where(eq(conversationReads.clientId, clientId)),
      archivos: (await db.select({ id: media.id, tipo: media.mime, bytes: media.size, subidoEl: media.createdAt }).from(media).where(eq(media.clientId, clientId)).orderBy(asc(media.createdAt))).map((m) => ({
        ...m,
        enElZip: `archivos/${m.id}.${EXT[m.tipo] ?? "bin"}`,
      })),
      sesionesAbiertas: await byUser((id) => db.select({ navegador: sessions.userAgent, desde: sessions.createdAt, ultimoUso: sessions.lastUsedAt }).from(sessions).where(eq(sessions.userId, id))),
      dispositivosConAvisos: await byUser(async (id) =>
        (await db.select({ endpoint: pushSubscriptions.endpoint, desde: pushSubscriptions.createdAt }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, id))).map((p) => ({ servicio: new URL(p.endpoint).host, desde: p.desde })),
      ),
      avisosEnviados: await byUser((id) => db.select({ tipo: reminderLog.kind, dia: reminderLog.date, enviadoEl: reminderLog.sentAt }).from(reminderLog).where(eq(reminderLog.userId, id)).orderBy(asc(reminderLog.date))),
      registroDeAccesos: await db
        .select({ accion: auditLog.action, fecha: auditLog.createdAt, ip: auditLog.ip })
        .from(auditLog)
        .where(or(eq(auditLog.targetId, clientId), ...(c.userId ? [eq(auditLog.actorId, c.userId)] : [])))
        .orderBy(asc(auditLog.createdAt)),
    };
  }

  const sendJson = (reply: FastifyReply, name: string, data: unknown) =>
    reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${name}"`)
      .header("Cache-Control", "no-store")
      .send(JSON.stringify(data, null, 2));

  /**
   * La exportación con sus archivos (fotos del chat, de progreso y de check-ins) en un ZIP. Se envía a trozos, un archivo
   * cada vez, sin comprimir (las fotos ya lo están): no hace falta tener en memoria los hasta 300 MB de un cliente.
   */
  async function sendZip(reply: FastifyReply, name: string, clientId: string) {
    const data = await exportClient(clientId);
    const out = new PassThrough();
    const zip = new Zip((err, chunk, final) => {
      if (err) return void out.destroy(err);
      out.write(Buffer.from(chunk));
      if (final) out.end();
    });
    reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${name}"`)
      .header("Cache-Control", "no-store");
    void (async () => {
      const add = (path: string, bytes: Uint8Array) => {
        const f = new ZipPassThrough(path);
        zip.add(f);
        f.push(bytes, true);
      };
      add("datos.json", strToU8(JSON.stringify(data, null, 2)));
      for (const m of data.archivos) {
        const bytes = await readFile(join(mediaDir, m.id)).catch(() => null); // si falta en disco, se lista pero no va
        if (bytes) add(m.enElZip, bytes);
      }
      zip.end();
    })().catch((e) => out.destroy(e as Error));
    return reply.send(out);
  }

  /** Borra la ficha (y su cuenta si la tiene) con todo lo que cuelga de ella, y sus fotos del disco. */
  async function deleteClient(db_: DB, clientId: string) {
    const files = await db_.select({ id: media.id }).from(media).where(eq(media.clientId, clientId));
    const [c] = await db_.select({ userId: clientProfiles.userId }).from(clientProfiles).where(eq(clientProfiles.id, clientId));
    // Antes de borrar: fuera de Stripe (cancela sus cuotas: no se le vuelve a cobrar) y enlaces pendientes caducados.
    // Sus cobros se conservan anonimizados (client_id queda nulo, con el nombre de entonces) por obligación fiscal.
    await deps.billing.forgetClient(clientId);
    await db_.transaction(async (tx) => {
      await tx.delete(clientProfiles).where(eq(clientProfiles.id, clientId)); // cascada: entrenos, planes, citas, mensajes, fotos…
      if (c?.userId) await tx.delete(users).where(eq(users.id, c.userId)); // cascada: sesiones, suscripciones push, lecturas
    });
    await Promise.all(files.map((f) => rm(join(mediaDir, f.id), { force: true })));
    return files.length;
  }

  // ── Cliente ──
  api.get("/me/export", { schema: { tags: ["privacidad"] }, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = requireUser(req);
    if (u.role !== "client" || !u.clientId) throw new HttpError(403, "forbidden", "Como entrenador, exporta los datos de cada cliente desde su ficha");
    await audit(db, req, "privacy.export.self", { type: "client", id: u.clientId });
    return sendJson(reply, "mis-datos.json", await exportClient(u.clientId));
  });
  api.get("/me/export.zip", { schema: { tags: ["privacidad"] }, config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = requireUser(req);
    if (u.role !== "client" || !u.clientId) throw new HttpError(403, "forbidden", "Como entrenador, exporta los datos de cada cliente desde su ficha");
    await audit(db, req, "privacy.export.self", { type: "client", id: u.clientId }, { zip: true });
    return sendZip(reply, "mis-datos.zip", u.clientId);
  });

  api.post(
    "/me/delete",
    { schema: { tags: ["privacidad"], body: z.object({ password: z.string().min(1).max(200) }), response: { 200: Ok } }, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const u = requireUser(req);
      if (u.role !== "client" || !u.clientId) throw new HttpError(403, "forbidden", "La cuenta del entrenador no se puede borrar desde aquí");
      const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, u.id));
      if (!(await verifyPassword(req.body.password, row?.hash))) throw new HttpError(400, "bad_password", "La contraseña no es correcta");
      await audit(db, req, "privacy.delete.self", { type: "client", id: u.clientId });
      await deleteClient(db, u.clientId);
      clearSessionCookie(cfg, reply);
      return { ok: true as const };
    },
  );

  // ── Entrenador ──
  const IdParams = z.object({ id: z.string().uuid() });
  async function coachExport(studioId: string, id: string) {
    const [c] = await db.select().from(clientProfiles).where(and(eq(clientProfiles.id, id), eq(clientProfiles.studioId, studioId)));
    if (!c) throw notFound("Cliente");
    const slug = c.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return { c, base: `datos-${slug || "cliente"}` };
  }
  api.get("/clients/:id/export", { schema: { tags: ["privacidad"], params: IdParams } }, async (req, reply) => {
    const u = requireCoach(req);
    const { c, base } = await coachExport(u.studioId, req.params.id);
    await audit(db, req, "privacy.export.client", { type: "client", id: c.id });
    return sendJson(reply, `${base}.json`, await exportClient(c.id));
  });
  api.get("/clients/:id/export.zip", { schema: { tags: ["privacidad"], params: IdParams }, config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = requireCoach(req);
    const { c, base } = await coachExport(u.studioId, req.params.id);
    await audit(db, req, "privacy.export.client", { type: "client", id: c.id }, { zip: true });
    return sendZip(reply, `${base}.zip`, c.id);
  });

  /** Borrado definitivo: solo de clientes archivados y escribiendo su nombre, para que no sea un clic accidental. */
  api.post(
    "/clients/:id/delete",
    { schema: { tags: ["privacidad"], params: IdParams, body: z.object({ confirmName: z.string().max(120) }), response: { 200: Ok } } },
    async (req) => {
      const u = requireCoach(req);
      const [c] = await db.select().from(clientProfiles).where(and(eq(clientProfiles.id, req.params.id), eq(clientProfiles.studioId, u.studioId)));
      if (!c) throw notFound("Cliente");
      if (c.status !== "archived") throw new HttpError(409, "not_archived", "Archiva primero al cliente; después podrás borrarlo definitivamente");
      if (req.body.confirmName.trim().toLowerCase() !== c.name.trim().toLowerCase()) throw new HttpError(400, "confirm_mismatch", "Escribe el nombre exactamente como aparece en la ficha");
      await audit(db, req, "privacy.delete.client", { type: "client", id: c.id });
      await deleteClient(db, c.id);
      return { ok: true as const };
    },
  );

}
