import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  ActivityItem,
  AssignInput,
  CompleteWorkoutInput,
  DateOnly,
  Exercise,
  ExerciseInput,
  ExerciseQuery,
  Ok,
  Routine,
  RoutineBody,
  Workout,
  WorkoutLog,
  WorkoutPatch,
  WorkoutRange,
  type RoutineBlock,
} from "@coach/shared";
import { clientProfiles, exercises, routines, users, workouts } from "../db/schema";
import { audit } from "../lib/audit";
import { HttpError, notFound } from "../lib/errors";
import { requireActiveClient, requireCoach, requireUser } from "../lib/session";
import { typed, type Ctx } from "./ctx";

const IdParams = z.object({ id: z.string().uuid() });

type ExerciseRow = typeof exercises.$inferSelect;
const toExercise = (r: ExerciseRow): Exercise => ({
  id: r.id,
  name: r.name,
  aliases: r.aliases,
  muscle: r.muscle as Exercise["muscle"],
  secondary: r.secondary as Exercise["secondary"],
  equipment: r.equipment as Exercise["equipment"],
  instructions: r.instructions,
  videoUrl: r.videoUrl,
  own: r.studioId !== null,
});

type RoutineRow = typeof routines.$inferSelect;
const countItems = (blocks: RoutineBlock[]) => blocks.reduce((n, b) => n + b.items.length, 0);

type WorkoutRow = typeof workouts.$inferSelect;
const toWorkout = (w: WorkoutRow, clientName: string): Workout => ({
  id: w.id,
  clientId: w.clientId,
  clientName,
  date: w.date,
  title: w.title,
  coachNotes: w.coachNotes,
  blocks: w.blocks,
  log: w.log,
  status: w.status,
  sessionRpe: w.sessionRpe,
  clientComment: w.clientComment,
  completedAt: w.completedAt?.toISOString() ?? null,
  routineId: w.routineId,
});

export function registerTraining(app: FastifyInstance, { db, hub }: Ctx) {
  const api = typed(app);

  /** Todos los ids de ejercicio de unos bloques deben existir y ser comunes o de este estudio. */
  async function assertExercises(studioId: string, blocks: RoutineBlock[]) {
    const ids = [...new Set(blocks.flatMap((b) => b.items.map((i) => i.exerciseId)))];
    if (ids.length === 0) return;
    const found = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(inArray(exercises.id, ids), or(isNull(exercises.studioId), eq(exercises.studioId, studioId))));
    if (found.length !== ids.length) throw new HttpError(400, "unknown_exercise", "Hay ejercicios que no existen en tu biblioteca");
  }

  async function ownedRoutine(studioId: string, id: string) {
    const [r] = await db.select().from(routines).where(and(eq(routines.id, id), eq(routines.studioId, studioId), isNull(routines.archivedAt)));
    if (!r) throw notFound("Rutina");
    return r;
  }

  async function assignedCounts(studioId: string, ids: string[]) {
    if (ids.length === 0) return new Map<string, number>();
    const rows = await db
      .select({ id: workouts.routineId, n: sql<number>`count(distinct ${workouts.clientId})::int` })
      .from(workouts)
      .where(and(eq(workouts.studioId, studioId), inArray(workouts.routineId, ids)))
      .groupBy(workouts.routineId);
    return new Map(rows.map((r) => [r.id!, r.n]));
  }

  const toRoutine = (r: RoutineRow, assigned = 0): Routine => ({
    id: r.id,
    name: r.name,
    description: r.description,
    blocks: r.blocks,
    updatedAt: r.updatedAt.toISOString(),
    exerciseCount: countItems(r.blocks),
    assignedCount: assigned,
  });

  // ── Ejercicios ────────────────────────────────────────────────────────────
  api.get("/exercises", { schema: { tags: ["entrenamiento"], querystring: ExerciseQuery, response: { 200: z.array(Exercise) } } }, async (req) => {
    const u = requireUser(req);
    const q = req.query;
    const where: SQL[] = [isNull(exercises.archivedAt)];
    where.push(q.own ? eq(exercises.studioId, u.studioId) : or(isNull(exercises.studioId), eq(exercises.studioId, u.studioId))!);
    if (q.muscle) where.push(eq(exercises.muscle, q.muscle));
    if (q.equipment) where.push(eq(exercises.equipment, q.equipment));
    if (q.q) {
      const like = `%${q.q.replace(/[%_\\]/g, "\\$&")}%`;
      where.push(or(ilike(exercises.name, like), sql`array_to_string(${exercises.aliases}, ' ') ilike ${like}`)!);
    }
    const rows = await db
      .select()
      .from(exercises)
      .where(and(...where))
      // Primero los propios del estudio, luego los que empiezan por lo buscado.
      .orderBy(sql`${exercises.studioId} is null`, q.q ? sql`lower(${exercises.name}) like ${q.q.toLowerCase() + "%"} desc` : sql`1`, asc(exercises.name))
      .limit(q.limit);
    return rows.map(toExercise);
  });

  api.get("/exercises/:id", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: Exercise } } }, async (req) => {
    const u = requireUser(req);
    const [r] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, req.params.id), or(isNull(exercises.studioId), eq(exercises.studioId, u.studioId))));
    if (!r) throw notFound("Ejercicio");
    return toExercise(r);
  });

  api.post("/exercises", { schema: { tags: ["entrenamiento"], body: ExerciseInput, response: { 200: Exercise } } }, async (req) => {
    const u = requireCoach(req);
    const [r] = await db.insert(exercises).values({ ...req.body, videoUrl: req.body.videoUrl ?? null, studioId: u.studioId }).returning();
    return toExercise(r!);
  });

  api.patch("/exercises/:id", { schema: { tags: ["entrenamiento"], params: IdParams, body: ExerciseInput.partial(), response: { 200: Exercise } } }, async (req) => {
    const u = requireCoach(req);
    const [r] = await db
      .update(exercises)
      .set(req.body)
      .where(and(eq(exercises.id, req.params.id), eq(exercises.studioId, u.studioId), isNull(exercises.archivedAt)))
      .returning();
    // Los de la biblioteca común no se editan (404 igual que si no existiera).
    if (!r) throw notFound("Ejercicio propio");
    return toExercise(r);
  });

  api.delete("/exercises/:id", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    const r = await db
      .update(exercises)
      .set({ archivedAt: new Date() })
      .where(and(eq(exercises.id, req.params.id), eq(exercises.studioId, u.studioId)))
      .returning({ id: exercises.id });
    if (r.length === 0) throw notFound("Ejercicio propio");
    return { ok: true as const };
  });

  // ── Rutinas ───────────────────────────────────────────────────────────────
  api.get("/routines", { schema: { tags: ["entrenamiento"], response: { 200: z.array(Routine) } } }, async (req) => {
    const u = requireCoach(req);
    const rows = await db.select().from(routines).where(and(eq(routines.studioId, u.studioId), isNull(routines.archivedAt))).orderBy(desc(routines.updatedAt));
    const counts = await assignedCounts(u.studioId, rows.map((r) => r.id));
    return rows.map((r) => toRoutine(r, counts.get(r.id) ?? 0));
  });

  api.post("/routines", { schema: { tags: ["entrenamiento"], body: RoutineBody, response: { 200: Routine } } }, async (req) => {
    const u = requireCoach(req);
    await assertExercises(u.studioId, req.body.blocks);
    const [r] = await db.insert(routines).values({ ...req.body, studioId: u.studioId, createdBy: u.id }).returning();
    return toRoutine(r!);
  });

  api.get("/routines/:id", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: Routine } } }, async (req) => {
    const u = requireCoach(req);
    const r = await ownedRoutine(u.studioId, req.params.id);
    return toRoutine(r, (await assignedCounts(u.studioId, [r.id])).get(r.id) ?? 0);
  });

  api.put("/routines/:id", { schema: { tags: ["entrenamiento"], params: IdParams, body: RoutineBody, response: { 200: Routine } } }, async (req) => {
    const u = requireCoach(req);
    await ownedRoutine(u.studioId, req.params.id);
    await assertExercises(u.studioId, req.body.blocks);
    const [r] = await db
      .update(routines)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(routines.id, req.params.id), eq(routines.studioId, u.studioId)))
      .returning();
    return toRoutine(r!, (await assignedCounts(u.studioId, [r!.id])).get(r!.id) ?? 0);
  });

  api.delete("/routines/:id", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    await ownedRoutine(u.studioId, req.params.id);
    await db.update(routines).set({ archivedAt: new Date() }).where(eq(routines.id, req.params.id));
    return { ok: true as const };
  });

  api.post("/routines/:id/duplicate", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: Routine } } }, async (req) => {
    const u = requireCoach(req);
    const src = await ownedRoutine(u.studioId, req.params.id);
    const [r] = await db
      .insert(routines)
      .values({ studioId: u.studioId, name: `${src.name} (copia)`.slice(0, 100), description: src.description, blocks: src.blocks, createdBy: u.id })
      .returning();
    return toRoutine(r!);
  });

  /** Asigna la rutina (una copia) a varios clientes en varios días. */
  api.post(
    "/routines/:id/assign",
    { schema: { tags: ["entrenamiento"], params: IdParams, body: AssignInput, response: { 200: z.object({ created: z.number() }) } } },
    async (req) => {
      const u = requireCoach(req);
      const r = await ownedRoutine(u.studioId, req.params.id);
      const clients = await db
        .select({ id: clientProfiles.id })
        .from(clientProfiles)
        .where(and(eq(clientProfiles.studioId, u.studioId), inArray(clientProfiles.id, req.body.clientIds)));
      if (clients.length !== new Set(req.body.clientIds).size) throw notFound("Cliente");
      const dates = [...new Set(req.body.dates)];
      const values = clients.flatMap((c) =>
        dates.map((date) => ({ studioId: u.studioId, clientId: c.id, routineId: r.id, date, title: r.name, blocks: r.blocks })),
      );
      await db.insert(workouts).values(values);
      await audit(db, req, "routine.assign", { type: "routine", id: r.id }, { clients: clients.length, dates: dates.length });
      return { created: values.length };
    },
  );

  // ── Entrenos asignados ────────────────────────────────────────────────────
  /** Entreno visible para quien pregunta: el entrenador de su estudio o el propio cliente. */
  async function visibleWorkout(req: Parameters<typeof requireUser>[0], id: string) {
    const u = requireUser(req);
    const [row] = await db
      .select({ w: workouts, name: clientProfiles.name, userId: clientProfiles.userId })
      .from(workouts)
      .innerJoin(clientProfiles, eq(clientProfiles.id, workouts.clientId))
      .where(and(eq(workouts.id, id), eq(workouts.studioId, u.studioId)));
    if (!row) throw notFound("Entreno");
    if (u.role === "client") {
      const c = requireActiveClient(req);
      if (row.w.clientId !== c.clientId) throw notFound("Entreno");
    }
    return { ...row, user: u };
  }

  api.get(
    "/clients/:id/workouts",
    { schema: { tags: ["entrenamiento"], params: IdParams, querystring: WorkoutRange, response: { 200: z.array(Workout) } } },
    async (req) => {
      const u = requireCoach(req);
      const [c] = await db.select().from(clientProfiles).where(and(eq(clientProfiles.id, req.params.id), eq(clientProfiles.studioId, u.studioId)));
      if (!c) throw notFound("Cliente");
      const rows = await db
        .select()
        .from(workouts)
        .where(and(eq(workouts.clientId, c.id), gte(workouts.date, req.query.from), lte(workouts.date, req.query.to)))
        .orderBy(asc(workouts.date), asc(workouts.createdAt));
      return rows.map((w) => toWorkout(w, c.name));
    },
  );

  api.get("/me/workouts", { schema: { tags: ["entrenamiento"], querystring: WorkoutRange, response: { 200: z.array(Workout) } } }, async (req) => {
    const c = requireActiveClient(req);
    const rows = await db
      .select()
      .from(workouts)
      .where(and(eq(workouts.clientId, c.clientId), eq(workouts.studioId, c.studioId), gte(workouts.date, req.query.from), lte(workouts.date, req.query.to)))
      .orderBy(asc(workouts.date), asc(workouts.createdAt));
    return rows.map((w) => toWorkout(w, c.name));
  });

  api.get("/workouts/:id", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: Workout } } }, async (req) => {
    const { w, name, user } = await visibleWorkout(req, req.params.id);
    if (user.role === "coach" && w.completedAt && !w.seenByCoach) await db.update(workouts).set({ seenByCoach: true }).where(eq(workouts.id, w.id));
    return toWorkout(w, name);
  });

  api.patch("/workouts/:id", { schema: { tags: ["entrenamiento"], params: IdParams, body: WorkoutPatch, response: { 200: Workout } } }, async (req) => {
    const u = requireCoach(req);
    const { name } = await visibleWorkout(req, req.params.id);
    if (req.body.blocks) await assertExercises(u.studioId, req.body.blocks);
    const [w] = await db.update(workouts).set({ ...req.body, updatedAt: new Date() }).where(eq(workouts.id, req.params.id)).returning();
    return toWorkout(w!, name);
  });

  api.delete("/workouts/:id", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    requireCoach(req);
    await visibleWorkout(req, req.params.id);
    await db.delete(workouts).where(eq(workouts.id, req.params.id));
    return { ok: true as const };
  });

  /** El cliente guarda lo que va anotando (autoguardado). */
  api.put("/workouts/:id/log", { schema: { tags: ["entrenamiento"], params: IdParams, body: WorkoutLog, response: { 200: Ok } } }, async (req) => {
    requireActiveClient(req);
    const { w } = await visibleWorkout(req, req.params.id);
    const itemIds = new Set(w.blocks.flatMap((b) => b.items.map((i) => i.id)));
    const log = Object.fromEntries(Object.entries(req.body).filter(([k]) => itemIds.has(k)));
    await db.update(workouts).set({ log, updatedAt: new Date() }).where(eq(workouts.id, w.id));
    return { ok: true as const };
  });

  api.post("/workouts/:id/complete", { schema: { tags: ["entrenamiento"], params: IdParams, body: CompleteWorkoutInput, response: { 200: Workout } } }, async (req) => {
    requireActiveClient(req);
    const { w, name } = await visibleWorkout(req, req.params.id);
    const [upd] = await db
      .update(workouts)
      .set({
        status: req.body.skipped ? "skipped" : "done",
        sessionRpe: req.body.skipped ? null : req.body.sessionRpe,
        clientComment: req.body.comment,
        completedAt: new Date(),
        seenByCoach: false,
        updatedAt: new Date(),
      })
      .where(eq(workouts.id, w.id))
      .returning();
    const coaches = await db.select({ id: users.id }).from(users).where(and(eq(users.studioId, w.studioId), eq(users.role, "coach")));
    hub.send(coaches.map((c) => c.id), { type: "workout.completed", workoutId: w.id, clientId: w.clientId });
    return toWorkout(upd!, name);
  });

  api.post("/workouts/:id/reopen", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: Workout } } }, async (req) => {
    requireActiveClient(req);
    const { w, name } = await visibleWorkout(req, req.params.id);
    const [upd] = await db
      .update(workouts)
      .set({ status: "planned", completedAt: null, sessionRpe: null, updatedAt: new Date() })
      .where(eq(workouts.id, w.id))
      .returning();
    return toWorkout(upd!, name);
  });

  /** Lo último que han hecho los clientes (panel «Hoy» del entrenador). */
  api.get(
    "/activity",
    { schema: { tags: ["entrenamiento"], querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(12) }), response: { 200: z.array(ActivityItem.extend({ unseen: z.boolean() })) } } },
    async (req) => {
      const u = requireCoach(req);
      const rows = await db
        .select({ w: workouts, name: clientProfiles.name })
        .from(workouts)
        .innerJoin(clientProfiles, eq(clientProfiles.id, workouts.clientId))
        .where(and(eq(workouts.studioId, u.studioId), isNotNull(workouts.completedAt)))
        .orderBy(desc(workouts.completedAt))
        .limit(req.query.limit);
      return rows.map(({ w, name }) => ({
        workoutId: w.id,
        clientId: w.clientId,
        clientName: name,
        title: w.title,
        date: w.date,
        status: w.status,
        sessionRpe: w.sessionRpe,
        clientComment: w.clientComment,
        completedAt: w.completedAt!.toISOString(),
        unseen: !w.seenByCoach,
      }));
    },
  );

  /** Entrenos de todos los clientes del estudio en un rango (vista de la semana del entrenador). */
  api.get("/workouts", { schema: { tags: ["entrenamiento"], querystring: WorkoutRange, response: { 200: z.array(Workout) } } }, async (req) => {
    const u = requireCoach(req);
    const rows = await db
      .select({ w: workouts, name: clientProfiles.name })
      .from(workouts)
      .innerJoin(clientProfiles, eq(clientProfiles.id, workouts.clientId))
      .where(and(eq(workouts.studioId, u.studioId), gte(workouts.date, req.query.from), lte(workouts.date, req.query.to)))
      .orderBy(asc(clientProfiles.name), asc(workouts.date));
    return rows.map(({ w, name }) => toWorkout(w, name));
  });

  /** Entrenos de hoy de todos los clientes (panel «Hoy»). */
  api.get("/today/workouts", { schema: { tags: ["entrenamiento"], querystring: z.object({ date: DateOnly }), response: { 200: z.array(Workout) } } }, async (req) => {
    const u = requireCoach(req);
    const rows = await db
      .select({ w: workouts, name: clientProfiles.name })
      .from(workouts)
      .innerJoin(clientProfiles, eq(clientProfiles.id, workouts.clientId))
      .where(and(eq(workouts.studioId, u.studioId), eq(workouts.date, req.query.date)))
      .orderBy(asc(clientProfiles.name));
    return rows.map(({ w, name }) => toWorkout(w, name));
  });
}
