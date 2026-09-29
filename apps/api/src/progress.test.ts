import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { Agent, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
let squatId: string;

beforeAll(async () => {
  await resetDb();
  app = await testApp({ seedExercises: true });
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  squatId = (await coach.get("/api/v1/exercises?q=sentadilla%20trasera&limit=1")).body[0].id;
});
afterAll(() => app.close());

describe("peso y medidas", () => {
  it("el cliente anota su peso; el mismo día se sobrescribe; el entrenador lo ve", async () => {
    expect((await lucia.req("PUT", "/api/v1/me/metrics", { date: "2026-10-01", weightKg: 64.2 })).status).toBe(200);
    await lucia.req("PUT", "/api/v1/me/metrics", { date: "2026-10-01", weightKg: 64, waistCm: 70 });
    await coach.req("PUT", `/api/v1/clients/${luciaId}/metrics`, { date: "2026-10-08", weightKg: 63.4, note: "Tras la semana de descarga" });
    const list = await coach.get(`/api/v1/clients/${luciaId}/metrics`);
    expect(list.body).toEqual([
      { date: "2026-10-01", weightKg: 64, waistCm: 70, hipCm: null, bodyFatPct: null, note: null },
      { date: "2026-10-08", weightKg: 63.4, waistCm: null, hipCm: null, bodyFatPct: null, note: "Tras la semana de descarga" },
    ]);
    expect((await lucia.req("PUT", "/api/v1/me/metrics", { date: "2026-10-02" })).status).toBe(400);
    expect((await coach.del(`/api/v1/clients/${luciaId}/metrics/2026-10-08`)).status).toBe(200);
    expect((await lucia.get("/api/v1/me/metrics")).body).toHaveLength(1);
  });
});

describe("progreso de cargas", () => {
  it("de los entrenos terminados salen la serie por ejercicio y el resumen", async () => {
    const block = (load: string) => [{ id: "b", name: "", items: [{ id: "i1", exerciseId: squatId, exerciseName: "Sentadilla trasera con barra", sets: 3, reps: "5", load, effort: "", tempo: "", restSec: null, notes: "", group: null }] }];
    const r = await coach.post("/api/v1/routines", { name: "Pierna", blocks: block("60 kg") });
    await coach.post(`/api/v1/routines/${r.body.id}/assign`, { clientIds: [luciaId], dates: ["2026-10-05", "2026-10-07", "2026-10-09"] });
    const ws = (await lucia.get("/api/v1/me/workouts?from=2026-10-01&to=2026-10-31")).body;
    for (const [i, kg] of [60, 65, 70].entries()) {
      await lucia.req("PUT", `/api/v1/workouts/${ws[i].id}/log`, { i1: [{ reps: "5", load: String(kg), rpe: 8, done: true }] });
      if (i < 2) await lucia.post(`/api/v1/workouts/${ws[i].id}/complete`, { sessionRpe: 8, comment: null });
    }
    // El tercero no está terminado: no cuenta
    const ex = await coach.get(`/api/v1/clients/${luciaId}/progress/exercises`);
    expect(ex.body).toHaveLength(1);
    expect(ex.body[0]).toMatchObject({ exerciseId: squatId, sessions: 2, bestE1rm: 75.8 });
    const act = await coach.get("/api/v1/activity");
    expect(act.body[0].records).toEqual(["Sentadilla trasera con barra"]); // la 2.ª sesión (65 kg) supera a la 1.ª
    expect(act.body[1].records).toEqual([]);
    const pts = await lucia.get(`/api/v1/me/progress?exerciseId=${squatId}`);
    expect(pts.body.map((p: { bestLoadKg: number }) => p.bestLoadKg)).toEqual([60, 65]);
  });

  it("aislamiento: otro estudio y otro cliente no ven nada", async () => {
    const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBB6" }).returning();
    await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro6@example.com", passwordHash: await hashPassword(PASSWORD) });
    const other = new Agent(app);
    await other.post("/api/v1/auth/login", { email: "otro6@example.com", password: PASSWORD });
    expect((await other.get(`/api/v1/clients/${luciaId}/metrics`)).status).toBe(404);
    expect((await other.req("PUT", `/api/v1/clients/${luciaId}/metrics`, { date: "2026-10-01", weightKg: 60 })).status).toBe(404);
    expect((await other.get(`/api/v1/clients/${luciaId}/progress/exercises`)).status).toBe(404);
    const { client: pepe } = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com");
    expect((await pepe.get("/api/v1/me/metrics")).body).toEqual([]);
    expect((await pepe.get("/api/v1/me/progress/exercises")).body).toEqual([]);
    expect((await pepe.get(`/api/v1/clients/${luciaId}/metrics`)).status).toBe(403);
  });
});
