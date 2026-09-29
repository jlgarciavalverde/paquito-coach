import type { FastifyInstance, FastifyReply } from "fastify";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { Ok } from "@coach/shared";
import type { DB } from "../db/client";
import { appointments, bodyMetrics, checkinResponses, clientProfiles, metricDefs, metricValues, progressPhotos, questionnaires, sessionPacks, payments, mealChecks, mealPlans, media, messages, users, workouts } from "../db/schema";
import { audit } from "../lib/audit";
import { HttpError, notFound } from "../lib/errors";
import { verifyPassword } from "../lib/passwords";
import { clearSessionCookie, requireActiveClient, requireCoach, requireUser } from "../lib/session";
import { typed, type Ctx } from "./ctx";

/**
 * Derechos RGPD: acceso/portabilidad (exportar en JSON) y supresión (borrar cuenta y datos).
 * El borrado es en cascada desde la ficha del cliente (entrenos, planes, citas, mensajes, fotos) y además
 * se borran del disco los archivos de sus fotos.
 */
export function registerPrivacy(app: FastifyInstance, { db, cfg }: Ctx) {
  const api = typed(app);
  const mediaDir = join(cfg.dataDir, "media");

  async function exportClient(clientId: string) {
    const [c] = await db.select().from(clientProfiles).where(eq(clientProfiles.id, clientId));
    if (!c) throw notFound("Cliente");
    const [u] = c.userId ? await db.select({ name: users.name, email: users.email, createdAt: users.createdAt, healthConsentAt: users.healthConsentAt }).from(users).where(eq(users.id, c.userId)) : [];
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
      bonos: await db.select({ nombre: sessionPacks.name, sesiones: sessionPacks.total, caduca: sessionPacks.expires, precio: sessionPacks.price, pagado: sessionPacks.paid, creadoEl: sessionPacks.createdAt }).from(sessionPacks).where(eq(sessionPacks.clientId, clientId)),
      citas: await db.select({ tipo: appointments.kind, titulo: appointments.title, empieza: appointments.startsAt, termina: appointments.endsAt, lugar: appointments.location, asistencia: appointments.status }).from(appointments).where(eq(appointments.clientId, clientId)).orderBy(asc(appointments.startsAt)),
      cuestionariosDeSalud: await db.select({ enviadoEl: questionnaires.submittedAt, respuestas: questionnaires.answers, alertas: questionnaires.alerts, revisadoEl: questionnaires.reviewedAt }).from(questionnaires).where(eq(questionnaires.clientId, clientId)),
      pesoYMedidas: await db.select({ fecha: bodyMetrics.date, pesoKg: bodyMetrics.weightKg, cinturaCm: bodyMetrics.waistCm, caderaCm: bodyMetrics.hipCm, grasaPct: bodyMetrics.bodyFatPct, nota: bodyMetrics.note }).from(bodyMetrics).where(eq(bodyMetrics.clientId, clientId)).orderBy(asc(bodyMetrics.date)),
      fotosDeProgreso: await db.select({ fecha: progressPhotos.date, postura: progressPhotos.pose, foto: progressPhotos.mediaId }).from(progressPhotos).where(eq(progressPhotos.clientId, clientId)).orderBy(asc(progressPhotos.date)),
      otrasMedidas: await db.select({ fecha: metricValues.date, medida: metricDefs.name, unidad: metricDefs.unit, valor: metricValues.value, nota: metricValues.note }).from(metricValues).innerJoin(metricDefs, eq(metricDefs.id, metricValues.metricId)).where(eq(metricValues.clientId, clientId)).orderBy(asc(metricValues.date)),
      checkIns: await db.select({ formulario: checkinResponses.formName, preguntas: checkinResponses.questions, respuestas: checkinResponses.answers, tocaba: checkinResponses.dueDate, enviadoEl: checkinResponses.submittedAt }).from(checkinResponses).where(eq(checkinResponses.clientId, clientId)).orderBy(asc(checkinResponses.submittedAt)),
      mensajes: await db.select({ fecha: messages.createdAt, delEntrenador: messages.fromCoach, texto: messages.body, foto: messages.mediaId }).from(messages).where(eq(messages.clientId, clientId)).orderBy(asc(messages.createdAt)),
    };
  }

  const sendJson = (reply: FastifyReply, name: string, data: unknown) =>
    reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${name}"`)
      .header("Cache-Control", "no-store")
      .send(JSON.stringify(data, null, 2));

  /** Borra la ficha (y su cuenta si la tiene) con todo lo que cuelga de ella, y sus fotos del disco. */
  async function deleteClient(db_: DB, clientId: string) {
    const files = await db_.select({ id: media.id }).from(media).where(eq(media.clientId, clientId));
    const [c] = await db_.select({ userId: clientProfiles.userId }).from(clientProfiles).where(eq(clientProfiles.id, clientId));
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
  api.get("/clients/:id/export", { schema: { tags: ["privacidad"], params: IdParams } }, async (req, reply) => {
    const u = requireCoach(req);
    const [c] = await db.select().from(clientProfiles).where(and(eq(clientProfiles.id, req.params.id), eq(clientProfiles.studioId, u.studioId)));
    if (!c) throw notFound("Cliente");
    await audit(db, req, "privacy.export.client", { type: "client", id: c.id });
    const slug = c.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return sendJson(reply, `datos-${slug || "cliente"}.json`, await exportClient(c.id));
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
