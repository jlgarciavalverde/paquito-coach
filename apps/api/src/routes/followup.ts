import type { FastifyInstance, FastifyRequest } from "fastify";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  CheckinAnswers,
  CheckinAssignInput,
  CheckinAssignment,
  CheckinForm,
  CheckinFormInput,
  CheckinResponse,
  CustomMetrics,
  DateOnly,
  MetricDef,
  MetricDefInput,
  MetricValue,
  MetricValueInput,
  Ok,
  PendingCheckin,
  ProgressPhoto,
  ProgressPhotoInput,
  checkinError,
  nextDueAfter,
} from "@coach/shared";
import { checkinAssignments, checkinForms, checkinResponses, clientProfiles, media, metricDefs, metricValues, progressPhotos } from "../db/schema";
import { HttpError, notFound } from "../lib/errors";
import { audit } from "../lib/audit";
import { madridClock } from "../lib/scheduler";
import { requireActiveClient, requireCoach, type AuthUser } from "../lib/session";
import { typed, type Ctx } from "./ctx";

const IdParams = z.object({ id: z.string().uuid() });
const today = () => madridClock(new Date()).date;

type DefRow = typeof metricDefs.$inferSelect;
const toDef = (d: DefRow): MetricDef => ({ id: d.id, name: d.name, unit: d.unit, higherIsBetter: d.higherIsBetter, clientCanLog: d.clientCanLog, archived: Boolean(d.archivedAt) });
type RespRow = typeof checkinResponses.$inferSelect;
const toResponse = (r: RespRow): CheckinResponse => ({
  id: r.id,
  assignmentId: r.assignmentId,
  formName: r.formName,
  questions: r.questions,
  dueDate: r.dueDate,
  answers: r.answers,
  submittedAt: r.submittedAt.toISOString(),
  seen: Boolean(r.seenAt),
});

/**
 * Evolución y seguimiento (H1): fotos de progreso, métricas propias del estudio y check-ins periódicos.
 * Entrenador: cualquier cliente de su estudio. Cliente: lo suyo.
 */
export function registerFollowup(app: FastifyInstance, { db, cfg }: Ctx) {
  const api = typed(app);
  const mediaDir = join(cfg.dataDir, "media");

  async function coachClient(req: FastifyRequest, id: string) {
    const u = requireCoach(req);
    const [c] = await db.select({ id: clientProfiles.id }).from(clientProfiles).where(and(eq(clientProfiles.id, id), eq(clientProfiles.studioId, u.studioId)));
    if (!c) throw notFound("Cliente");
    return { user: u as AuthUser, clientId: c.id };
  }
  const selfClient = (req: FastifyRequest) => {
    const c = requireActiveClient(req);
    return { user: c as AuthUser, clientId: c.clientId };
  };

  // ── Fotos de progreso ──────────────────────────────────────────────────────
  const listPhotos = async (clientId: string) =>
    db
      .select({ id: progressPhotos.id, mediaId: progressPhotos.mediaId, date: progressPhotos.date, pose: progressPhotos.pose })
      .from(progressPhotos)
      .where(eq(progressPhotos.clientId, clientId))
      .orderBy(desc(progressPhotos.date), asc(progressPhotos.pose)) as Promise<ProgressPhoto[]>;

  async function addPhoto(user: AuthUser, clientId: string, b: ProgressPhotoInput) {
    // La foto tiene que haberse subido para este cliente (POST /media) y no estar ya usada.
    const [m] = await db.select({ id: media.id }).from(media).where(and(eq(media.id, b.mediaId), eq(media.studioId, user.studioId), eq(media.clientId, clientId)));
    if (!m) throw new HttpError(400, "bad_media", "La foto no es válida");
    const [p] = await db.insert(progressPhotos).values({ studioId: user.studioId, clientId, mediaId: b.mediaId, date: b.date, pose: b.pose }).returning();
    return { id: p!.id, mediaId: p!.mediaId, date: p!.date, pose: p!.pose } as ProgressPhoto;
  }
  async function deletePhoto(clientId: string, photoId: string) {
    const [p] = await db.select().from(progressPhotos).where(and(eq(progressPhotos.id, photoId), eq(progressPhotos.clientId, clientId)));
    if (!p) throw notFound("Foto");
    await db.delete(media).where(eq(media.id, p.mediaId)); // borra también la fila de la foto (cascade)
    await rm(join(mediaDir, p.mediaId), { force: true });
  }

  api.get("/clients/:id/photos", { schema: { tags: ["seguimiento"], params: IdParams, response: { 200: z.array(ProgressPhoto) } } }, async (req) =>
    listPhotos((await coachClient(req, req.params.id)).clientId),
  );
  api.post("/clients/:id/photos", { schema: { tags: ["seguimiento"], params: IdParams, body: ProgressPhotoInput, response: { 200: ProgressPhoto } } }, async (req) => {
    const { user, clientId } = await coachClient(req, req.params.id);
    return addPhoto(user, clientId, req.body);
  });
  api.delete("/clients/:id/photos/:photoId", { schema: { tags: ["seguimiento"], params: IdParams.extend({ photoId: z.string().uuid() }), response: { 200: Ok } } }, async (req) => {
    const { clientId } = await coachClient(req, req.params.id);
    await deletePhoto(clientId, req.params.photoId);
    return { ok: true as const };
  });
  api.get("/me/photos", { schema: { tags: ["seguimiento"], response: { 200: z.array(ProgressPhoto) } } }, async (req) => listPhotos(selfClient(req).clientId));
  api.post("/me/photos", { schema: { tags: ["seguimiento"], body: ProgressPhotoInput, response: { 200: ProgressPhoto } } }, async (req) => {
    const { user, clientId } = selfClient(req);
    return addPhoto(user, clientId, req.body);
  });
  api.delete("/me/photos/:photoId", { schema: { tags: ["seguimiento"], params: z.object({ photoId: z.string().uuid() }), response: { 200: Ok } } }, async (req) => {
    await deletePhoto(selfClient(req).clientId, req.params.photoId);
    return { ok: true as const };
  });

  // ── Métricas propias ───────────────────────────────────────────────────────
  api.get("/metric-defs", { schema: { tags: ["seguimiento"], response: { 200: z.array(MetricDef) } } }, async (req) => {
    const u = requireCoach(req);
    return (await db.select().from(metricDefs).where(eq(metricDefs.studioId, u.studioId)).orderBy(asc(metricDefs.createdAt))).map(toDef);
  });
  api.post("/metric-defs", { schema: { tags: ["seguimiento"], body: MetricDefInput, response: { 200: MetricDef } } }, async (req) => {
    const u = requireCoach(req);
    const [d] = await db.insert(metricDefs).values({ ...req.body, studioId: u.studioId }).returning();
    return toDef(d!);
  });
  api.put(
    "/metric-defs/:id",
    { schema: { tags: ["seguimiento"], params: IdParams, body: MetricDefInput.extend({ archived: z.boolean().default(false) }), response: { 200: MetricDef } } },
    async (req) => {
      const u = requireCoach(req);
      const { archived, ...rest } = req.body;
      const [d] = await db
        .update(metricDefs)
        .set({ ...rest, archivedAt: archived ? sql`coalesce(${metricDefs.archivedAt}, now())` : null })
        .where(and(eq(metricDefs.id, req.params.id), eq(metricDefs.studioId, u.studioId)))
        .returning();
      if (!d) throw notFound("Métrica");
      return toDef(d);
    },
  );

  async function customMetrics(studioId: string, clientId: string, forClient: boolean): Promise<CustomMetrics> {
    const values = await db
      .select({ metricId: metricValues.metricId, date: metricValues.date, value: metricValues.value, note: metricValues.note })
      .from(metricValues)
      .where(eq(metricValues.clientId, clientId))
      .orderBy(asc(metricValues.date));
    const used = new Set(values.map((v) => v.metricId));
    const defs = (await db.select().from(metricDefs).where(eq(metricDefs.studioId, studioId)).orderBy(asc(metricDefs.createdAt)))
      .map(toDef)
      // Archivadas: solo si tienen datos de este cliente (para no perder su historia). Al cliente, solo las que puede anotar o ya tiene.
      .filter((d) => (d.archived ? used.has(d.id) : !forClient || d.clientCanLog || used.has(d.id)));
    const shown = new Set(defs.map((d) => d.id));
    return { defs, values: values.filter((v) => shown.has(v.metricId)) };
  }
  async function upsertValue(user: AuthUser, clientId: string, b: MetricValueInput, forClient: boolean) {
    const [d] = await db.select().from(metricDefs).where(and(eq(metricDefs.id, b.metricId), eq(metricDefs.studioId, user.studioId), isNull(metricDefs.archivedAt)));
    if (!d || (forClient && !d.clientCanLog)) throw notFound("Métrica");
    const set = { value: b.value, note: b.note, createdBy: user.id, updatedAt: new Date() };
    await db
      .insert(metricValues)
      .values({ ...set, studioId: user.studioId, clientId, metricId: d.id, date: b.date })
      .onConflictDoUpdate({ target: [metricValues.clientId, metricValues.metricId, metricValues.date], set });
    return { metricId: d.id, date: b.date, value: b.value, note: b.note } satisfies MetricValue;
  }

  api.get("/clients/:id/custom-metrics", { schema: { tags: ["seguimiento"], params: IdParams, response: { 200: CustomMetrics } } }, async (req) => {
    const { user, clientId } = await coachClient(req, req.params.id);
    return customMetrics(user.studioId, clientId, false);
  });
  api.put("/clients/:id/custom-metrics", { schema: { tags: ["seguimiento"], params: IdParams, body: MetricValueInput, response: { 200: MetricValue } } }, async (req) => {
    const { user, clientId } = await coachClient(req, req.params.id);
    return upsertValue(user, clientId, req.body, false);
  });
  api.delete(
    "/clients/:id/custom-metrics/:metricId/:date",
    { schema: { tags: ["seguimiento"], params: IdParams.extend({ metricId: z.string().uuid(), date: DateOnly }), response: { 200: Ok } } },
    async (req) => {
      const { clientId } = await coachClient(req, req.params.id);
      await db.delete(metricValues).where(and(eq(metricValues.clientId, clientId), eq(metricValues.metricId, req.params.metricId), eq(metricValues.date, req.params.date)));
      return { ok: true as const };
    },
  );
  api.get("/me/custom-metrics", { schema: { tags: ["seguimiento"], response: { 200: CustomMetrics } } }, async (req) => {
    const { user, clientId } = selfClient(req);
    return customMetrics(user.studioId, clientId, true);
  });
  api.put("/me/custom-metrics", { schema: { tags: ["seguimiento"], body: MetricValueInput, response: { 200: MetricValue } } }, async (req) => {
    const { user, clientId } = selfClient(req);
    return upsertValue(user, clientId, req.body, true);
  });

  // ── Check-ins: formularios ─────────────────────────────────────────────────
  async function ownedForm(studioId: string, id: string) {
    const [f] = await db.select().from(checkinForms).where(and(eq(checkinForms.id, id), eq(checkinForms.studioId, studioId), isNull(checkinForms.archivedAt)));
    if (!f) throw notFound("Formulario");
    return f;
  }
  api.get("/checkin-forms", { schema: { tags: ["seguimiento"], response: { 200: z.array(CheckinForm) } } }, async (req) => {
    const u = requireCoach(req);
    const rows = await db.select().from(checkinForms).where(and(eq(checkinForms.studioId, u.studioId), isNull(checkinForms.archivedAt))).orderBy(asc(checkinForms.name));
    const counts = rows.length
      ? await db
          .select({ id: checkinAssignments.formId, n: sql<number>`count(*)::int` })
          .from(checkinAssignments)
          .where(inArray(checkinAssignments.formId, rows.map((r) => r.id)))
          .groupBy(checkinAssignments.formId)
      : [];
    const byId = new Map(counts.map((c) => [c.id, c.n]));
    return rows.map((f) => ({ id: f.id, name: f.name, intro: f.intro, questions: f.questions, updatedAt: f.updatedAt.toISOString(), assignedCount: byId.get(f.id) ?? 0 }));
  });
  api.post("/checkin-forms", { schema: { tags: ["seguimiento"], body: CheckinFormInput, response: { 200: CheckinForm } } }, async (req) => {
    const u = requireCoach(req);
    const [f] = await db.insert(checkinForms).values({ ...req.body, studioId: u.studioId }).returning();
    return { id: f!.id, name: f!.name, intro: f!.intro, questions: f!.questions, updatedAt: f!.updatedAt.toISOString(), assignedCount: 0 };
  });
  api.put("/checkin-forms/:id", { schema: { tags: ["seguimiento"], params: IdParams, body: CheckinFormInput, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    await ownedForm(u.studioId, req.params.id);
    await db.update(checkinForms).set({ ...req.body, updatedAt: new Date() }).where(eq(checkinForms.id, req.params.id));
    return { ok: true as const };
  });
  /** Archivar: deja de pedirse a todos (las respuestas ya dadas se conservan). */
  api.delete("/checkin-forms/:id", { schema: { tags: ["seguimiento"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    await ownedForm(u.studioId, req.params.id);
    await db.transaction(async (tx) => {
      await tx.update(checkinForms).set({ archivedAt: new Date() }).where(eq(checkinForms.id, req.params.id));
      await tx.delete(checkinAssignments).where(eq(checkinAssignments.formId, req.params.id));
    });
    return { ok: true as const };
  });
  api.post("/checkin-forms/:id/assign", { schema: { tags: ["seguimiento"], params: IdParams, body: CheckinAssignInput, response: { 200: z.object({ assigned: z.number() }) } } }, async (req) => {
    const u = requireCoach(req);
    const f = await ownedForm(u.studioId, req.params.id);
    const clients = await db
      .select({ id: clientProfiles.id })
      .from(clientProfiles)
      .where(and(eq(clientProfiles.studioId, u.studioId), inArray(clientProfiles.id, req.body.clientIds)));
    if (clients.length !== new Set(req.body.clientIds).size) throw notFound("Cliente");
    for (const c of clients)
      await db
        .insert(checkinAssignments)
        .values({ studioId: u.studioId, clientId: c.id, formId: f.id, everyDays: req.body.everyDays, nextDue: req.body.start })
        .onConflictDoUpdate({ target: [checkinAssignments.clientId, checkinAssignments.formId], set: { everyDays: req.body.everyDays, nextDue: req.body.start } });
    await audit(db, req, "checkin.assign", { type: "checkin_form", id: f.id }, { clients: clients.length });
    return { assigned: clients.length };
  });

  // ── Check-ins: por cliente ─────────────────────────────────────────────────
  const assignmentsOf = async (clientId: string): Promise<CheckinAssignment[]> =>
    db
      .select({ id: checkinAssignments.id, formId: checkinAssignments.formId, formName: checkinForms.name, clientId: checkinAssignments.clientId, everyDays: checkinAssignments.everyDays, nextDue: checkinAssignments.nextDue })
      .from(checkinAssignments)
      .innerJoin(checkinForms, eq(checkinForms.id, checkinAssignments.formId))
      .where(eq(checkinAssignments.clientId, clientId))
      .orderBy(asc(checkinAssignments.nextDue));
  const responsesOf = async (clientId: string) =>
    (await db.select().from(checkinResponses).where(eq(checkinResponses.clientId, clientId)).orderBy(desc(checkinResponses.submittedAt)).limit(100)).map(toResponse);

  api.get(
    "/clients/:id/checkins",
    { schema: { tags: ["seguimiento"], params: IdParams, response: { 200: z.object({ assignments: z.array(CheckinAssignment), responses: z.array(CheckinResponse) }) } } },
    async (req) => {
      const { clientId } = await coachClient(req, req.params.id);
      return { assignments: await assignmentsOf(clientId), responses: await responsesOf(clientId) };
    },
  );
  api.post("/clients/:id/checkins/seen", { schema: { tags: ["seguimiento"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const { clientId } = await coachClient(req, req.params.id);
    await db.update(checkinResponses).set({ seenAt: new Date() }).where(and(eq(checkinResponses.clientId, clientId), isNull(checkinResponses.seenAt)));
    return { ok: true as const };
  });
  api.delete("/checkin-assignments/:id", { schema: { tags: ["seguimiento"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    const r = await db.delete(checkinAssignments).where(and(eq(checkinAssignments.id, req.params.id), eq(checkinAssignments.studioId, u.studioId))).returning({ id: checkinAssignments.id });
    if (r.length === 0) throw notFound("Check-in");
    return { ok: true as const };
  });

  // ── Check-ins: el cliente ──────────────────────────────────────────────────
  api.get("/me/checkins", { schema: { tags: ["seguimiento"], response: { 200: z.array(PendingCheckin) } } }, async (req) => {
    const { clientId } = selfClient(req);
    const rows = await db
      .select({ a: checkinAssignments, f: checkinForms })
      .from(checkinAssignments)
      .innerJoin(checkinForms, eq(checkinForms.id, checkinAssignments.formId))
      .where(and(eq(checkinAssignments.clientId, clientId), lte(checkinAssignments.nextDue, today())))
      .orderBy(asc(checkinAssignments.nextDue));
    return rows.map(({ a, f }) => ({ assignmentId: a.id, formName: f.name, intro: f.intro, questions: f.questions, dueDate: a.nextDue }));
  });
  api.post(
    "/me/checkins/:id",
    { schema: { tags: ["seguimiento"], params: IdParams, body: z.object({ answers: CheckinAnswers }), response: { 200: CheckinResponse } }, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) => {
      const { user, clientId } = selfClient(req);
      const t = today();
      const [row] = await db
        .select({ a: checkinAssignments, f: checkinForms })
        .from(checkinAssignments)
        .innerJoin(checkinForms, eq(checkinForms.id, checkinAssignments.formId))
        .where(and(eq(checkinAssignments.id, req.params.id), eq(checkinAssignments.clientId, clientId)));
      if (!row) throw notFound("Check-in");
      if (row.a.nextDue > t) throw new HttpError(409, "not_due", "Este check-in aún no te toca");
      const qs = row.f.questions;
      // Solo se guardan respuestas a preguntas del formulario.
      const answers = Object.fromEntries(qs.filter((q) => q.id in req.body.answers).map((q) => [q.id, req.body.answers[q.id]!]));
      const err = checkinError(qs, answers);
      if (err) throw new HttpError(400, "validation", err);
      const photoIds = qs.filter((q) => q.kind === "photo" && typeof answers[q.id] === "string").map((q) => answers[q.id] as string);
      if (photoIds.length) {
        const ok = await db.select({ id: media.id }).from(media).where(and(inArray(media.id, photoIds), eq(media.clientId, clientId), eq(media.studioId, user.studioId)));
        if (ok.length !== new Set(photoIds).size) throw new HttpError(400, "bad_media", "La foto no es válida");
      }
      const [resp] = await db.transaction(async (tx) => {
        const r = await tx
          .insert(checkinResponses)
          .values({ studioId: user.studioId, clientId, assignmentId: row.a.id, formName: row.f.name, questions: qs, dueDate: row.a.nextDue, answers })
          .returning();
        await tx.update(checkinAssignments).set({ nextDue: nextDueAfter(row.a.nextDue, row.a.everyDays, t) }).where(eq(checkinAssignments.id, row.a.id));
        return r;
      });
      return toResponse(resp!);
    },
  );
}
