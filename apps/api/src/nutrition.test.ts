import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { Agent, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
let pepeId: string;
let templateId: string;

const body = (name = "Definición 2000") => ({
  name,
  notes: "Beber 2 l de agua",
  targets: { kcal: 2000, protein: 140, carbs: 200, fat: 65 },
  mode: "same",
  days: [
    {
      weekday: 0,
      meals: [
        { id: "m1", name: "Desayuno", time: "08:00", items: [{ id: "f1", food: "Avena", qty: "60 g" }], alternatives: "Pan integral con tomate", notes: "" },
        { id: "m2", name: "Comida", time: null, items: [{ id: "f2", food: "Arroz", qty: "80 g" }], alternatives: "", notes: "" },
      ],
    },
  ],
});

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  pepeId = (await coach.post("/api/v1/clients", { name: "Pepe", invite: false })).body.client.id;
});
afterAll(() => app.close());

describe("planes de comidas", () => {
  it("crea una plantilla y la valida", async () => {
    const r = await coach.post("/api/v1/meal-plans", { clientId: null, body: body() });
    expect(r.status).toBe(200);
    expect(r.body.clientId).toBeNull();
    templateId = r.body.id;
    const bad = await coach.post("/api/v1/meal-plans", { clientId: null, body: { ...body(), mode: "weekly" } });
    expect(bad.status).toBe(400);
    expect((await coach.get("/api/v1/meal-plans")).body).toHaveLength(1);
  });

  it("aplicar a dos clientes crea copias activas; volver a aplicar deja solo un plan activo", async () => {
    expect((await coach.post(`/api/v1/meal-plans/${templateId}/apply`, { clientIds: [luciaId, pepeId] })).body.applied).toBe(2);
    await coach.post("/api/v1/meal-plans", { clientId: luciaId, fromPlanId: templateId });
    const p = await coach.get(`/api/v1/clients/${luciaId}/meal-plan`);
    expect(p.body).toMatchObject({ clientId: luciaId, active: true, name: "Definición 2000" });
    const rows = await app.db.execute(`select count(*)::int as n from meal_plans where client_id = '${luciaId}' and active` as never);
    expect((rows as unknown as { n: number }[])[0]!.n).toBe(1);
    // Editar la plantilla no cambia la copia del cliente
    await coach.req("PUT", `/api/v1/meal-plans/${templateId}`, body("Otra"));
    expect((await coach.get(`/api/v1/clients/${luciaId}/meal-plan`)).body.name).toBe("Definición 2000");
  });

  it("el cliente ve su plan y marca comidas; el entrenador ve el cumplimiento", async () => {
    const mine = await lucia.get("/api/v1/me/meal-plan");
    expect(mine.body.targets.kcal).toBe(2000);
    expect((await lucia.req("PUT", "/api/v1/me/meal-checks", { date: "2026-10-05", mealId: "m1", done: true, note: null })).status).toBe(200);
    // Idempotente: volver a marcar actualiza, no duplica
    await lucia.req("PUT", "/api/v1/me/meal-checks", { date: "2026-10-05", mealId: "m1", done: true, note: "Cambié la avena por pan" });
    expect((await lucia.req("PUT", "/api/v1/me/meal-checks", { date: "2026-10-05", mealId: "nope", done: true, note: null })).status).toBe(400);
    const checks = await coach.get(`/api/v1/clients/${luciaId}/meal-checks?from=2026-10-01&to=2026-10-31`);
    expect(checks.body).toEqual([{ date: "2026-10-05", mealId: "m1", done: true, note: "Cambié la avena por pan" }]);
  });

  it("permisos: el cliente no gestiona planes; otro estudio no ve nada", async () => {
    expect((await lucia.get("/api/v1/meal-plans")).status).toBe(403);
    expect((await lucia.get(`/api/v1/clients/${luciaId}/meal-plan`)).status).toBe(403);
    const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBB3" }).returning();
    await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro3@example.com", passwordHash: await hashPassword(PASSWORD) });
    const other = new Agent(app);
    await other.post("/api/v1/auth/login", { email: "otro3@example.com", password: PASSWORD });
    expect((await other.get("/api/v1/meal-plans")).body).toEqual([]);
    expect((await other.get(`/api/v1/meal-plans/${templateId}`)).status).toBe(404);
    expect((await other.get(`/api/v1/clients/${luciaId}/meal-plan`)).status).toBe(404);
    expect((await other.get(`/api/v1/clients/${luciaId}/meal-checks?from=2026-10-01&to=2026-10-31`)).status).toBe(404);
    expect((await other.post(`/api/v1/meal-plans/${templateId}/apply`, { clientIds: [luciaId] })).status).toBe(404);
    const mine = await other.post("/api/v1/meal-plans", { clientId: null, body: body("Mía") });
    expect((await other.post(`/api/v1/meal-plans/${mine.body.id}/apply`, { clientIds: [luciaId] })).status).toBe(404);
    expect((await other.post("/api/v1/meal-plans", { clientId: null, fromPlanId: templateId })).status).toBe(404);
  });
});
