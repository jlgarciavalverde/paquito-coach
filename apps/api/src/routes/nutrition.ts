import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { CreateMealPlanInput, MealCheck, MealCheckInput, MealPlan, MealPlanBody, Ok, WorkoutRange } from "@coach/shared";
import type { DB } from "../db/client";
import { clientProfiles, mealChecks, mealPlans } from "../db/schema";
import { audit } from "../lib/audit";
import { HttpError, notFound } from "../lib/errors";
import { requireActiveClient, requireCoach } from "../lib/session";
import { typed, type Ctx } from "./ctx";

const IdParams = z.object({ id: z.string().uuid() });
type PlanRow = typeof mealPlans.$inferSelect;

const toPlan = (p: PlanRow): MealPlan => ({
  id: p.id,
  clientId: p.clientId,
  name: p.name,
  notes: p.notes,
  targets: p.targets,
  mode: p.mode,
  days: p.days,
  active: p.active,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

const BLANK = { name: "Plan de comidas", notes: "", targets: { kcal: null, protein: null, carbs: null, fat: null }, mode: "same" as const, days: [{ weekday: 0, meals: [] }] };

/** Deja un único plan activo por cliente (desactiva los anteriores). */
async function activateFor(db: DB, studioId: string, clientId: string, values: Omit<typeof mealPlans.$inferInsert, "studioId" | "clientId" | "active">) {
  return db.transaction(async (tx) => {
    await tx.update(mealPlans).set({ active: false }).where(and(eq(mealPlans.clientId, clientId), eq(mealPlans.active, true)));
    const [p] = await tx.insert(mealPlans).values({ ...values, studioId, clientId, active: true }).returning();
    return p!;
  });
}

export function registerNutrition(app: FastifyInstance, { db }: Ctx) {
  const api = typed(app);

  async function ownedPlan(studioId: string, id: string) {
    const [p] = await db.select().from(mealPlans).where(and(eq(mealPlans.id, id), eq(mealPlans.studioId, studioId), isNull(mealPlans.archivedAt)));
    if (!p) throw notFound("Plan");
    return p;
  }
  async function ownedClient(studioId: string, id: string) {
    const [c] = await db.select().from(clientProfiles).where(and(eq(clientProfiles.id, id), eq(clientProfiles.studioId, studioId)));
    if (!c) throw notFound("Cliente");
    return c;
  }

  /** Plantillas de la biblioteca. */
  api.get("/meal-plans", { schema: { tags: ["nutrición"], response: { 200: z.array(MealPlan) } } }, async (req) => {
    const u = requireCoach(req);
    const rows = await db
      .select()
      .from(mealPlans)
      .where(and(eq(mealPlans.studioId, u.studioId), isNull(mealPlans.clientId), isNull(mealPlans.archivedAt)))
      .orderBy(desc(mealPlans.updatedAt));
    return rows.map(toPlan);
  });

  api.post("/meal-plans", { schema: { tags: ["nutrición"], body: CreateMealPlanInput, response: { 200: MealPlan } } }, async (req) => {
    const u = requireCoach(req);
    const { clientId, fromPlanId, body } = req.body;
    let values: Omit<typeof mealPlans.$inferInsert, "studioId" | "clientId" | "active"> = body ?? BLANK;
    if (fromPlanId) {
      const src = await ownedPlan(u.studioId, fromPlanId);
      values = { name: src.name, notes: src.notes, targets: src.targets, mode: src.mode, days: src.days };
    }
    if (clientId) {
      await ownedClient(u.studioId, clientId);
      const p = await activateFor(db, u.studioId, clientId, values);
      await audit(db, req, "meal_plan.assign", { type: "client", id: clientId });
      return toPlan(p);
    }
    const [p] = await db.insert(mealPlans).values({ ...values, studioId: u.studioId, clientId: null }).returning();
    return toPlan(p!);
  });

  api.get("/meal-plans/:id", { schema: { tags: ["nutrición"], params: IdParams, response: { 200: MealPlan } } }, async (req) => {
    const u = requireCoach(req);
    return toPlan(await ownedPlan(u.studioId, req.params.id));
  });

  api.put("/meal-plans/:id", { schema: { tags: ["nutrición"], params: IdParams, body: MealPlanBody, response: { 200: MealPlan } } }, async (req) => {
    const u = requireCoach(req);
    await ownedPlan(u.studioId, req.params.id);
    const [p] = await db.update(mealPlans).set({ ...req.body, updatedAt: new Date() }).where(eq(mealPlans.id, req.params.id)).returning();
    return toPlan(p!);
  });

  api.delete("/meal-plans/:id", { schema: { tags: ["nutrición"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    await ownedPlan(u.studioId, req.params.id);
    await db.update(mealPlans).set({ archivedAt: new Date(), active: false }).where(eq(mealPlans.id, req.params.id));
    return { ok: true as const };
  });

  /** Aplica una plantilla (o un plan) a varios clientes: cada uno recibe su copia como plan activo. */
  api.post(
    "/meal-plans/:id/apply",
    { schema: { tags: ["nutrición"], params: IdParams, body: z.object({ clientIds: z.array(z.string().uuid()).min(1).max(100) }), response: { 200: z.object({ applied: z.number() }) } } },
    async (req) => {
      const u = requireCoach(req);
      const src = await ownedPlan(u.studioId, req.params.id);
      const ids = [...new Set(req.body.clientIds)];
      const found = await db.select({ id: clientProfiles.id }).from(clientProfiles).where(and(eq(clientProfiles.studioId, u.studioId), inArray(clientProfiles.id, ids)));
      if (found.length !== ids.length) throw notFound("Cliente");
      for (const c of found) await activateFor(db, u.studioId, c.id, { name: src.name, notes: src.notes, targets: src.targets, mode: src.mode, days: src.days });
      await audit(db, req, "meal_plan.apply", { type: "meal_plan", id: src.id }, { clients: found.length });
      return { applied: found.length };
    },
  );

  api.get("/clients/:id/meal-plan", { schema: { tags: ["nutrición"], params: IdParams, response: { 200: MealPlan.nullable() } } }, async (req) => {
    const u = requireCoach(req);
    await ownedClient(u.studioId, req.params.id);
    const [p] = await db.select().from(mealPlans).where(and(eq(mealPlans.clientId, req.params.id), eq(mealPlans.active, true), isNull(mealPlans.archivedAt)));
    return p ? toPlan(p) : null;
  });

  api.get(
    "/clients/:id/meal-checks",
    { schema: { tags: ["nutrición"], params: IdParams, querystring: WorkoutRange, response: { 200: z.array(MealCheck) } } },
    async (req) => {
      const u = requireCoach(req);
      await ownedClient(u.studioId, req.params.id);
      const rows = await db
        .select()
        .from(mealChecks)
        .where(and(eq(mealChecks.clientId, req.params.id), gte(mealChecks.date, req.query.from), lte(mealChecks.date, req.query.to)))
        .orderBy(asc(mealChecks.date));
      return rows.map((r) => ({ date: r.date, mealId: r.mealId, done: r.done, note: r.note }));
    },
  );

  // ── Cliente ──
  api.get("/me/meal-plan", { schema: { tags: ["nutrición"], response: { 200: MealPlan.nullable() } } }, async (req) => {
    const c = requireActiveClient(req);
    const [p] = await db.select().from(mealPlans).where(and(eq(mealPlans.clientId, c.clientId), eq(mealPlans.studioId, c.studioId), eq(mealPlans.active, true), isNull(mealPlans.archivedAt)));
    return p ? toPlan(p) : null;
  });

  api.get("/me/meal-checks", { schema: { tags: ["nutrición"], querystring: WorkoutRange, response: { 200: z.array(MealCheck) } } }, async (req) => {
    const c = requireActiveClient(req);
    const rows = await db.select().from(mealChecks).where(and(eq(mealChecks.clientId, c.clientId), gte(mealChecks.date, req.query.from), lte(mealChecks.date, req.query.to)));
    return rows.map((r) => ({ date: r.date, mealId: r.mealId, done: r.done, note: r.note }));
  });

  api.put("/me/meal-checks", { schema: { tags: ["nutrición"], body: MealCheckInput, response: { 200: MealCheck } } }, async (req) => {
    const c = requireActiveClient(req);
    const [p] = await db.select().from(mealPlans).where(and(eq(mealPlans.clientId, c.clientId), eq(mealPlans.active, true), isNull(mealPlans.archivedAt)));
    if (!p) throw new HttpError(409, "no_plan", "No tienes un plan de comidas activo");
    if (!p.days.some((d) => d.meals.some((m) => m.id === req.body.mealId))) throw new HttpError(400, "unknown_meal", "Esa comida no está en tu plan");
    const b = req.body;
    await db
      .insert(mealChecks)
      .values({ studioId: c.studioId, clientId: c.clientId, date: b.date, mealId: b.mealId, done: b.done, note: b.note })
      .onConflictDoUpdate({ target: [mealChecks.clientId, mealChecks.date, mealChecks.mealId], set: { done: b.done, note: b.note, updatedAt: new Date() } });
    return { date: b.date, mealId: b.mealId, done: b.done, note: b.note };
  });
}
