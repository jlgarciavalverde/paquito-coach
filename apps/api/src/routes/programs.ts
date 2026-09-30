import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { Ok, Program, ProgramAssignInput, ProgramBody, ProgramRun, applyProgression, programDates, type ProgramSlot } from "@coach/shared";
import { clientProfiles, programRuns, programs, routines, workouts } from "../db/schema";
import { HttpError, notFound } from "../lib/errors";
import { audit } from "../lib/audit";
import { madridClock } from "../lib/scheduler";
import { requireCoach } from "../lib/session";
import { typed, type Ctx } from "./ctx";

const IdParams = z.object({ id: z.string().uuid() });
type Row = typeof programs.$inferSelect;
const toProgram = (p: Row, activeRuns = 0): Program => ({
  id: p.id,
  name: p.name,
  description: p.description,
  weeks: p.weeks,
  slots: p.slots,
  progression: p.progression ?? null,
  updatedAt: p.updatedAt.toISOString(),
  activeRuns,
});

/**
 * Programas de varias semanas (H2): una rejilla semanas × días con una rutina en cada casilla. Al aplicarlo a un cliente
 * se generan todos sus entrenos (copias, como al asignar una rutina) con la progresión de cargas ya aplicada.
 */
export function registerPrograms(app: FastifyInstance, { db }: Ctx) {
  const api = typed(app);

  async function owned(studioId: string, id: string) {
    const [p] = await db.select().from(programs).where(and(eq(programs.id, id), eq(programs.studioId, studioId)));
    if (!p) throw notFound("Programa");
    return p;
  }
  async function checkRoutines(studioId: string, slots: ProgramSlot[]) {
    const ids = [...new Set(slots.map((s) => s.routineId))];
    if (ids.length === 0) return new Map<string, typeof routines.$inferSelect>();
    const rows = await db.select().from(routines).where(and(eq(routines.studioId, studioId), inArray(routines.id, ids), isNull(routines.archivedAt)));
    if (rows.length !== ids.length) throw new HttpError(400, "bad_routine", "Alguna rutina del programa ya no existe");
    return new Map(rows.map((r) => [r.id, r]));
  }

  api.get("/programs", { schema: { tags: ["entrenamiento"], response: { 200: z.array(Program) } } }, async (req) => {
    const u = requireCoach(req);
    const rows = await db.select().from(programs).where(eq(programs.studioId, u.studioId)).orderBy(asc(programs.name));
    const counts = rows.length
      ? await db
          .select({ id: programRuns.programId, n: sql<number>`count(*)::int` })
          .from(programRuns)
          .where(and(inArray(programRuns.programId, rows.map((r) => r.id)), isNull(programRuns.endedAt)))
          .groupBy(programRuns.programId)
      : [];
    const by = new Map(counts.map((c) => [c.id, c.n]));
    return rows.map((r) => toProgram(r, by.get(r.id) ?? 0));
  });
  api.get("/programs/:id", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: Program } } }, async (req) => {
    const u = requireCoach(req);
    return toProgram(await owned(u.studioId, req.params.id));
  });
  api.post("/programs", { schema: { tags: ["entrenamiento"], body: ProgramBody, response: { 200: Program } } }, async (req) => {
    const u = requireCoach(req);
    await checkRoutines(u.studioId, req.body.slots);
    const [p] = await db.insert(programs).values({ ...req.body, studioId: u.studioId }).returning();
    return toProgram(p!);
  });
  api.put("/programs/:id", { schema: { tags: ["entrenamiento"], params: IdParams, body: ProgramBody, response: { 200: Program } } }, async (req) => {
    const u = requireCoach(req);
    await owned(u.studioId, req.params.id);
    await checkRoutines(u.studioId, req.body.slots);
    const [p] = await db.update(programs).set({ ...req.body, updatedAt: new Date() }).where(eq(programs.id, req.params.id)).returning();
    return toProgram(p!);
  });
  /** Borrar el programa de la biblioteca no toca lo ya aplicado a clientes. */
  api.delete("/programs/:id", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    await owned(u.studioId, req.params.id);
    await db.delete(programs).where(eq(programs.id, req.params.id));
    return { ok: true as const };
  });

  api.post(
    "/programs/:id/assign",
    { schema: { tags: ["entrenamiento"], params: IdParams, body: ProgramAssignInput, response: { 200: z.object({ created: z.number() }) } } },
    async (req) => {
      const u = requireCoach(req);
      const p = await owned(u.studioId, req.params.id);
      const byId = await checkRoutines(u.studioId, p.slots);
      const clients = await db
        .select({ id: clientProfiles.id })
        .from(clientProfiles)
        .where(and(eq(clientProfiles.studioId, u.studioId), inArray(clientProfiles.id, req.body.clientIds)));
      if (clients.length !== new Set(req.body.clientIds).size) throw notFound("Cliente");
      const dates = programDates(req.body.start, p.slots);
      if (dates.length * clients.length > 2000) throw new HttpError(400, "too_many", "Son demasiados entrenos de una vez (máximo 2.000). Aplícalo a menos clientes cada vez.");
      if (dates.length === 0) throw new HttpError(400, "empty", "El programa no tiene días a partir de esa fecha");
      let created = 0;
      await db.transaction(async (tx) => {
        for (const c of clients) {
          const [run] = await tx.insert(programRuns).values({ studioId: u.studioId, clientId: c.id, programId: p.id, name: p.name, start: req.body.start, weeks: p.weeks }).returning();
          const values = dates.map((d) => {
            const r = byId.get(d.routineId)!;
            return {
              studioId: u.studioId,
              clientId: c.id,
              routineId: r.id,
              programRunId: run!.id,
              date: d.date,
              title: p.weeks > 1 ? `${r.name}, semana ${d.week} de ${p.weeks}` : r.name,
              blocks: applyProgression(r.blocks, d.week - 1, p.progression),
            };
          });
          await tx.insert(workouts).values(values);
          created += values.length;
        }
      });
      await audit(db, req, "program.assign", { type: "program", id: p.id }, { clients: clients.length, workouts: created });
      return { created };
    },
  );

  api.get("/clients/:id/program-runs", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: z.array(ProgramRun) } } }, async (req) => {
    const u = requireCoach(req);
    const [c] = await db.select({ id: clientProfiles.id }).from(clientProfiles).where(and(eq(clientProfiles.id, req.params.id), eq(clientProfiles.studioId, u.studioId)));
    if (!c) throw notFound("Cliente");
    const today = madridClock(new Date()).date;
    const runs = await db.select().from(programRuns).where(eq(programRuns.clientId, c.id)).orderBy(desc(programRuns.start));
    if (runs.length === 0) return [];
    const stats = await db
      .select({
        runId: workouts.programRunId,
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${workouts.status} = 'done')::int`,
        pending: sql<number>`count(*) filter (where ${workouts.status} = 'planned' and ${workouts.date} >= ${today})::int`,
      })
      .from(workouts)
      .where(inArray(workouts.programRunId, runs.map((r) => r.id)))
      .groupBy(workouts.programRunId);
    const by = new Map(stats.map((s) => [s.runId, s]));
    return runs.map((r) => ({
      id: r.id,
      programId: r.programId,
      name: r.name,
      start: r.start,
      weeks: r.weeks,
      total: by.get(r.id)?.total ?? 0,
      done: by.get(r.id)?.done ?? 0,
      pending: by.get(r.id)?.pending ?? 0,
      ended: Boolean(r.endedAt) || (by.get(r.id)?.pending ?? 0) === 0,
    }));
  });

  /** Terminar un programa antes de tiempo: quita los entrenos que quedan (sin empezar, de hoy en adelante). */
  api.post("/program-runs/:id/end", { schema: { tags: ["entrenamiento"], params: IdParams, response: { 200: z.object({ removed: z.number() }) } } }, async (req) => {
    const u = requireCoach(req);
    const [run] = await db.select().from(programRuns).where(and(eq(programRuns.id, req.params.id), eq(programRuns.studioId, u.studioId)));
    if (!run) throw notFound("Programa");
    const today = madridClock(new Date()).date;
    const removed = await db
      .delete(workouts)
      .where(and(eq(workouts.programRunId, run.id), eq(workouts.status, "planned"), gte(workouts.date, today), sql`${workouts.log} = '{}'::jsonb`))
      .returning({ id: workouts.id });
    await db.update(programRuns).set({ endedAt: new Date() }).where(eq(programRuns.id, run.id));
    return { removed: removed.length };
  });
}
