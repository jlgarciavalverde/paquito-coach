import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { Anamnesis, Ok, Questionnaire, QuestionnaireInput, QuestionnaireState, questionnaireAlerts } from "@coach/shared";
import type { DB } from "../db/client";
import { clientProfiles, questionnaires } from "../db/schema";
import { audit } from "../lib/audit";
import { notFound } from "../lib/errors";
import { requireActiveClient, requireCoach } from "../lib/session";
import { typed, type Ctx } from "./ctx";

type Row = typeof questionnaires.$inferSelect;
const toQ = (r: Row): Questionnaire => ({
  id: r.id,
  parq: r.answers.parq,
  anamnesis: Anamnesis.parse(r.answers.anamnesis),
  submittedAt: r.submittedAt.toISOString(),
  reviewedAt: r.reviewedAt?.toISOString() ?? null,
  alerts: r.alerts,
});

export async function questionnaireState(db: DB, clientId: string): Promise<QuestionnaireState> {
  const [c] = await db.select({ requested: clientProfiles.questionnaireRequestedAt }).from(clientProfiles).where(eq(clientProfiles.id, clientId));
  const [last] = await db.select().from(questionnaires).where(eq(questionnaires.clientId, clientId)).orderBy(desc(questionnaires.submittedAt)).limit(1);
  const pending = !last || (c?.requested != null && c.requested > last.submittedAt);
  return { pending, last: last ? toQ(last) : null };
}

/** Cuestionario de salud (PAR-Q+ y anamnesis): el cliente lo rellena; el entrenador lo revisa o pide que lo repita. */
export function registerQuestionnaire(app: FastifyInstance, { db }: Ctx) {
  const api = typed(app);
  const IdParams = z.object({ id: z.string().uuid() });

  async function owned(studioId: string, id: string) {
    const [c] = await db.select().from(clientProfiles).where(and(eq(clientProfiles.id, id), eq(clientProfiles.studioId, studioId)));
    if (!c) throw notFound("Cliente");
    return c;
  }

  api.get("/me/questionnaire", { schema: { tags: ["salud"], response: { 200: QuestionnaireState } } }, async (req) => questionnaireState(db, requireActiveClient(req).clientId));

  api.post("/me/questionnaire", { schema: { tags: ["salud"], body: QuestionnaireInput, response: { 200: Questionnaire } }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const c = requireActiveClient(req);
    const [r] = await db
      .insert(questionnaires)
      .values({ studioId: c.studioId, clientId: c.clientId, answers: req.body, alerts: questionnaireAlerts(req.body) })
      .returning();
    await audit(db, req, "questionnaire.submit", { type: "client", id: c.clientId });
    return toQ(r!);
  });

  api.get("/clients/:id/questionnaire", { schema: { tags: ["salud"], params: IdParams, response: { 200: QuestionnaireState } } }, async (req) => {
    const u = requireCoach(req);
    const c = await owned(u.studioId, req.params.id);
    await audit(db, req, "questionnaire.view", { type: "client", id: c.id });
    return questionnaireState(db, c.id);
  });

  api.post("/clients/:id/questionnaire/review", { schema: { tags: ["salud"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    const c = await owned(u.studioId, req.params.id);
    await db
      .update(questionnaires)
      .set({ reviewedAt: new Date(), reviewedBy: u.id })
      .where(and(eq(questionnaires.clientId, c.id), isNull(questionnaires.reviewedAt)));
    await audit(db, req, "questionnaire.review", { type: "client", id: c.id });
    return { ok: true as const };
  });

  api.post("/clients/:id/questionnaire/request", { schema: { tags: ["salud"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    const c = await owned(u.studioId, req.params.id);
    await db.update(clientProfiles).set({ questionnaireRequestedAt: sql`now()` }).where(eq(clientProfiles.id, c.id));
    return { ok: true as const };
  });

  /** Cuestionarios con alertas sin revisar (para «Hoy»). */
  api.get(
    "/questionnaires/unreviewed",
    { schema: { tags: ["salud"], response: { 200: z.array(z.object({ clientId: z.string(), clientName: z.string(), alerts: z.number(), submittedAt: z.string() })) } } },
    async (req) => {
      const u = requireCoach(req);
      const rows = await db
        .select({ q: questionnaires, name: clientProfiles.name })
        .from(questionnaires)
        .innerJoin(clientProfiles, eq(clientProfiles.id, questionnaires.clientId))
        .where(and(eq(questionnaires.studioId, u.studioId), isNull(questionnaires.reviewedAt), sql`jsonb_array_length(${questionnaires.alerts}) > 0`))
        .orderBy(desc(questionnaires.submittedAt));
      const seen = new Set<string>();
      return rows
        .filter((r) => !seen.has(r.q.clientId) && seen.add(r.q.clientId))
        .map((r) => ({ clientId: r.q.clientId, clientName: r.name, alerts: r.q.alerts.length, submittedAt: r.q.submittedAt.toISOString() }));
    },
  );
}
