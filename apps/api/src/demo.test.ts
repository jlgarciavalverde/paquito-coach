import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import type { App } from "./app";
import { clientProfiles, questionnaires, workouts } from "./db/schema";
import { msUntilNextReset, resetDemo } from "./demo/seed";
import { Agent, resetDb, testApp } from "./test-utils";

let app: App;
beforeAll(async () => {
  await resetDb();
  app = await testApp({ seedExercises: true, demoMode: true });
  await resetDemo(app.db);
});
afterAll(() => app.close());

describe("demo", () => {
  it("siembra un estudio realista y se puede re-sembrar sin duplicar", async () => {
    await resetDemo(app.db);
    const [c] = await app.db.select({ n: count() }).from(clientProfiles);
    expect(c!.n).toBe(6);
    const [w] = await app.db.select({ n: count() }).from(workouts);
    expect(w!.n).toBeGreaterThan(20);
    const [q] = await app.db.select({ n: count() }).from(questionnaires);
    expect(q!.n).toBe(4);
  });

  it("entrar con un clic como entrenador y como clienta; se ve su actividad", async () => {
    const status = await new Agent(app).get("/api/v1/auth/setup-status");
    expect(status.body).toEqual({ needsSetup: false, demo: true, mail: false }); // la demo nunca envía correos
    const coach = new Agent(app);
    expect((await coach.post("/api/v1/auth/demo", { as: "coach" })).body.role).toBe("coach");
    expect((await coach.get("/api/v1/activity")).body.length).toBeGreaterThan(3);
    expect((await coach.get("/api/v1/questionnaires/unreviewed")).body).toHaveLength(1);
    const client = new Agent(app);
    expect((await client.post("/api/v1/auth/demo", { as: "client" })).body).toMatchObject({ role: "client", clientStatus: "active" });
    expect((await client.get("/api/v1/me/progress/exercises")).body.length).toBeGreaterThan(0);
  });

  it("bloquea lo que podría romper la demo para los demás", async () => {
    const coach = new Agent(app);
    await coach.post("/api/v1/auth/demo", { as: "coach" });
    expect((await coach.post("/api/v1/auth/password/change", { current: "x", next: "yyyyyyyyyyyy" })).status).toBe(403);
    expect((await coach.post("/api/v1/studio/join-code/rotate")).status).toBe(403);
    const client = new Agent(app);
    await client.post("/api/v1/auth/demo", { as: "client" });
    expect((await client.post("/api/v1/me/delete", { password: "x" })).status).toBe(403);
    expect((await client.post("/api/v1/media")).status).toBe(403);
    expect((await new Agent(app).post("/api/v1/auth/register", {})).status).toBe(403);
  });

  it("la próxima re-siembra es a las 4:00 de Madrid", () => {
    const now = new Date("2026-10-05T10:00:00Z"); // 12:00 en Madrid
    const next = new Date(now.getTime() + msUntilNextReset(now));
    expect(next.toISOString()).toBe("2026-10-06T02:00:00.000Z");
  });
});

describe("fuera de la demo", () => {
  it("no existe la entrada con un clic", async () => {
    const prod = await testApp();
    expect((await new Agent(prod).post("/api/v1/auth/demo", { as: "coach" })).status).toBe(404);
    await prod.close();
  });
});
