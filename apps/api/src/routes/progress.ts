import type { FastifyInstance } from "fastify";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { BodyMetric, BodyMetricInput, DateOnly, Ok, ProgressExercise, ProgressPoint } from "@coach/shared";
import { bodyMetrics, clientProfiles, workouts } from "../db/schema";
import { notFound } from "../lib/errors";
import { exerciseSummaries, progressFromWorkouts } from "../lib/progress";
import { requireActiveClient, requireCoach, type AuthUser } from "../lib/session";
import type { FastifyRequest } from "fastify";
import { typed, type Ctx } from "./ctx";

const IdParams = z.object({ id: z.string().uuid() });
type MetricRow = typeof bodyMetrics.$inferSelect;
const toMetric = (m: MetricRow): BodyMetric => ({ date: m.date, weightKg: m.weightKg, waistCm: m.waistCm, hipCm: m.hipCm, bodyFatPct: m.bodyFatPct, note: m.note });

/** Peso/medidas y progreso de cargas. El entrenador los ve de cualquier cliente de su estudio; el cliente, los suyos. */
export function registerProgress(app: FastifyInstance, { db }: Ctx) {
  const api = typed(app);

  async function coachClient(req: FastifyRequest, id: string) {
    const u = requireCoach(req);
    const [c] = await db.select({ id: clientProfiles.id }).from(clientProfiles).where(and(eq(clientProfiles.id, id), eq(clientProfiles.studioId, u.studioId)));
    if (!c) throw notFound("Cliente");
    return { user: u, clientId: c.id };
  }
  const selfClient = (req: FastifyRequest) => {
    const c = requireActiveClient(req);
    return { user: c as AuthUser, clientId: c.clientId };
  };

  const listMetrics = async (clientId: string) => (await db.select().from(bodyMetrics).where(eq(bodyMetrics.clientId, clientId)).orderBy(asc(bodyMetrics.date))).map(toMetric);
  async function upsertMetric(user: AuthUser, clientId: string, b: z.infer<typeof BodyMetricInput>) {
    const values = { weightKg: b.weightKg, waistCm: b.waistCm, hipCm: b.hipCm, bodyFatPct: b.bodyFatPct, note: b.note, createdBy: user.id, updatedAt: new Date() };
    const [m] = await db
      .insert(bodyMetrics)
      .values({ ...values, studioId: user.studioId, clientId, date: b.date })
      .onConflictDoUpdate({ target: [bodyMetrics.clientId, bodyMetrics.date], set: values })
      .returning();
    return toMetric(m!);
  }
  async function computed(clientId: string) {
    const rows = await db
      .select({ id: workouts.id, date: workouts.date, blocks: workouts.blocks, log: workouts.log })
      .from(workouts)
      .where(and(eq(workouts.clientId, clientId), eq(workouts.status, "done"), isNotNull(workouts.completedAt)));
    return progressFromWorkouts(rows);
  }

  const ExQuery = z.object({ exerciseId: z.string().uuid() });

  // ── Entrenador ──
  api.get("/clients/:id/metrics", { schema: { tags: ["progreso"], params: IdParams, response: { 200: z.array(BodyMetric) } } }, async (req) =>
    listMetrics((await coachClient(req, req.params.id)).clientId),
  );
  api.put("/clients/:id/metrics", { schema: { tags: ["progreso"], params: IdParams, body: BodyMetricInput, response: { 200: BodyMetric } } }, async (req) => {
    const { user, clientId } = await coachClient(req, req.params.id);
    return upsertMetric(user, clientId, req.body);
  });
  api.delete(
    "/clients/:id/metrics/:date",
    { schema: { tags: ["progreso"], params: IdParams.extend({ date: DateOnly }), response: { 200: Ok } } },
    async (req) => {
      const { clientId } = await coachClient(req, req.params.id);
      await db.delete(bodyMetrics).where(and(eq(bodyMetrics.clientId, clientId), eq(bodyMetrics.date, req.params.date)));
      return { ok: true as const };
    },
  );
  api.get("/clients/:id/progress/exercises", { schema: { tags: ["progreso"], params: IdParams, response: { 200: z.array(ProgressExercise) } } }, async (req) =>
    exerciseSummaries(await computed((await coachClient(req, req.params.id)).clientId)),
  );
  api.get("/clients/:id/progress", { schema: { tags: ["progreso"], params: IdParams, querystring: ExQuery, response: { 200: z.array(ProgressPoint) } } }, async (req) => {
    const { clientId } = await coachClient(req, req.params.id);
    return (await computed(clientId)).get(req.query.exerciseId)?.points ?? [];
  });

  // ── Cliente ──
  api.get("/me/metrics", { schema: { tags: ["progreso"], response: { 200: z.array(BodyMetric) } } }, async (req) => listMetrics(selfClient(req).clientId));
  api.put("/me/metrics", { schema: { tags: ["progreso"], body: BodyMetricInput, response: { 200: BodyMetric } } }, async (req) => {
    const { user, clientId } = selfClient(req);
    return upsertMetric(user, clientId, req.body);
  });
  api.get("/me/progress/exercises", { schema: { tags: ["progreso"], response: { 200: z.array(ProgressExercise) } } }, async (req) => exerciseSummaries(await computed(selfClient(req).clientId)));
  api.get("/me/progress", { schema: { tags: ["progreso"], querystring: ExQuery, response: { 200: z.array(ProgressPoint) } } }, async (req) =>
    (await computed(selfClient(req).clientId)).get(req.query.exerciseId)?.points ?? [],
  );
}
