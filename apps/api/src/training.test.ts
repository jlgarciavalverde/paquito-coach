import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { Agent, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
let pepeId: string;
let squatId: string;
let routineId: string;

const block = (exerciseId: string, name = "Sentadilla") => ({
  id: "b1",
  name: "Fuerza",
  items: [{ id: "i1", exerciseId, exerciseName: name, sets: 3, reps: "5", load: "80 kg", effort: "RIR 2", tempo: "30X1", restSec: 180, notes: "", group: null }],
});

beforeAll(async () => {
  await resetDb();
  app = await testApp({ seedExercises: true });
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  pepeId = (await coach.post("/api/v1/clients", { name: "Pepe", invite: false })).body.client.id;
});
afterAll(() => app.close());

describe("biblioteca de ejercicios", () => {
  it("la semilla común está cargada y se busca en español", async () => {
    const r = await coach.get("/api/v1/exercises?q=sentadilla");
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(3);
    expect(r.body[0].name.toLowerCase()).toContain("sentadilla");
    squatId = r.body[0].id;
    expect(r.body[0].own).toBe(false);
  });

  it("filtra por músculo", async () => {
    const r = await coach.get("/api/v1/exercises?muscle=glutes&limit=10");
    expect(r.body.every((e: { muscle: string }) => e.muscle === "glutes")).toBe(true);
  });

  it("crea, edita y archiva un ejercicio propio; los comunes no se editan", async () => {
    const c = await coach.post("/api/v1/exercises", { name: "Step-down excéntrico", muscle: "quads", equipment: "bodyweight", videoUrl: "https://youtu.be/abc123" });
    expect(c.status).toBe(200);
    expect(c.body.own).toBe(true);
    const own = await coach.get("/api/v1/exercises?own=1");
    expect(own.body.map((e: { name: string }) => e.name)).toEqual(["Step-down excéntrico"]);
    expect((await coach.patch(`/api/v1/exercises/${c.body.id}`, { name: "Step-down excéntrico 4 s" })).body.name).toBe("Step-down excéntrico 4 s");
    expect((await coach.patch(`/api/v1/exercises/${squatId}`, { name: "Mía" })).status).toBe(404);
    expect((await coach.post("/api/v1/exercises", { name: "Vídeo raro", muscle: "quads", equipment: "other", videoUrl: "https://evil.example/x" })).status).toBe(400);
    expect((await coach.del(`/api/v1/exercises/${c.body.id}`)).status).toBe(200);
    expect((await coach.get("/api/v1/exercises?own=1")).body).toEqual([]);
  });
});

describe("rutinas y asignación", () => {
  it("crea, edita y duplica una rutina", async () => {
    const r = await coach.post("/api/v1/routines", { name: "Pierna A", description: "", blocks: [block(squatId)] });
    expect(r.status).toBe(200);
    expect(r.body.exerciseCount).toBe(1);
    routineId = r.body.id;
    const d = await coach.post(`/api/v1/routines/${routineId}/duplicate`);
    expect(d.body.name).toBe("Pierna A (copia)");
    expect((await coach.get("/api/v1/routines")).body).toHaveLength(2);
  });

  it("rechaza ejercicios inexistentes", async () => {
    const r = await coach.post("/api/v1/routines", { name: "X", blocks: [block("00000000-0000-4000-8000-000000000000")] });
    expect(r.status).toBe(400);
  });

  it("asigna a dos clientes en dos días (4 entrenos) y es una copia congelada", async () => {
    const r = await coach.post(`/api/v1/routines/${routineId}/assign`, { clientIds: [luciaId, pepeId], dates: ["2026-10-05", "2026-10-07"] });
    expect(r.body.created).toBe(4);
    // Editar la rutina no cambia lo ya asignado
    await coach.req("PUT", `/api/v1/routines/${routineId}`, { name: "Pierna A v2", description: "", blocks: [] });
    const ws = await coach.get(`/api/v1/clients/${luciaId}/workouts?from=2026-10-01&to=2026-10-31`);
    expect(ws.body).toHaveLength(2);
    expect(ws.body[0].title).toBe("Pierna A");
    expect(ws.body[0].blocks[0].items[0].load).toBe("80 kg");
    expect((await coach.get("/api/v1/routines")).body.find((x: { id: string }) => x.id === routineId).assignedCount).toBe(2);
  });
});

describe("el cliente registra su entreno", () => {
  it("ve solo sus entrenos, anota series, completa y el entrenador lo ve en actividad", async () => {
    const mine = await lucia.get("/api/v1/me/workouts?from=2026-10-01&to=2026-10-31");
    expect(mine.body).toHaveLength(2);
    const w = mine.body[0];
    const log = { i1: [{ reps: "5", load: "80", rpe: 7, done: true }, { reps: "5", load: "82.5", rpe: 8, done: true }], intruso: [{ reps: "1", load: "1", rpe: null, done: true }] };
    expect((await lucia.req("PUT", `/api/v1/workouts/${w.id}/log`, log)).status).toBe(200);
    const done = await lucia.post(`/api/v1/workouts/${w.id}/complete`, { sessionRpe: 8, comment: "Rodilla bien", skipped: false });
    expect(done.body.status).toBe("done");
    expect(Object.keys(done.body.log)).toEqual(["i1"]); // descarta ids que no están en el entreno

    const act = await coach.get("/api/v1/activity");
    expect(act.body[0]).toMatchObject({ clientName: "Lucía", sessionRpe: 8, clientComment: "Rodilla bien", unseen: true });
    await coach.get(`/api/v1/workouts/${w.id}`);
    expect((await coach.get("/api/v1/activity")).body[0].unseen).toBe(false);
  });

  it("el entrenador mueve y borra un entreno; el cliente no puede editar la prescripción", async () => {
    const [, second] = (await coach.get(`/api/v1/clients/${luciaId}/workouts?from=2026-10-01&to=2026-10-31`)).body;
    expect((await lucia.patch(`/api/v1/workouts/${second.id}`, { date: "2026-10-09" })).status).toBe(403);
    expect((await coach.patch(`/api/v1/workouts/${second.id}`, { date: "2026-10-09" })).body.date).toBe("2026-10-09");
    expect((await lucia.del(`/api/v1/workouts/${second.id}`)).status).toBe(403);
    expect((await coach.del(`/api/v1/workouts/${second.id}`)).status).toBe(200);
  });

  it("un cliente no ve entrenos de otro cliente", async () => {
    const [pw] = (await coach.get(`/api/v1/clients/${pepeId}/workouts?from=2026-10-01&to=2026-10-31`)).body;
    expect((await lucia.get(`/api/v1/workouts/${pw.id}`)).status).toBe(404);
    expect((await lucia.req("PUT", `/api/v1/workouts/${pw.id}/log`, {})).status).toBe(404);
    expect((await lucia.post(`/api/v1/workouts/${pw.id}/complete`, { sessionRpe: 5, comment: null })).status).toBe(404);
  });
});

describe("aislamiento entre estudios (entrenamiento)", () => {
  it("otro entrenador no ve ni asigna rutinas, entrenos ni ejercicios propios ajenos", async () => {
    const own = await coach.post("/api/v1/exercises", { name: "Secreto de Paquito", muscle: "abs", equipment: "other" });
    const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBB2" }).returning();
    await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro2@example.com", passwordHash: await hashPassword(PASSWORD) });
    const other = new Agent(app);
    await other.post("/api/v1/auth/login", { email: "otro2@example.com", password: PASSWORD });

    expect((await other.get("/api/v1/routines")).body).toEqual([]);
    expect((await other.get(`/api/v1/routines/${routineId}`)).status).toBe(404);
    expect((await other.post(`/api/v1/routines/${routineId}/assign`, { clientIds: [luciaId], dates: ["2026-10-10"] })).status).toBe(404);
    expect((await other.get(`/api/v1/clients/${luciaId}/workouts?from=2026-10-01&to=2026-10-31`)).status).toBe(404);
    expect((await other.get("/api/v1/exercises?q=Secreto")).body).toEqual([]);
    expect((await other.get("/api/v1/activity")).body).toEqual([]);
    expect((await other.get("/api/v1/workouts?from=2026-10-01&to=2026-10-31")).body).toEqual([]);
    expect((await coach.get("/api/v1/workouts?from=2026-10-01&to=2026-10-31")).body.length).toBeGreaterThan(0);
    expect((await lucia.get("/api/v1/workouts?from=2026-10-01&to=2026-10-31")).status).toBe(403);
    // No puede usar un ejercicio propio de otro estudio en su rutina
    expect((await other.post("/api/v1/routines", { name: "X", blocks: [block(own.body.id)] })).status).toBe(400);
    // Ni asignar una rutina suya a un cliente ajeno
    const mine = await other.post("/api/v1/routines", { name: "Mía", blocks: [] });
    expect((await other.post(`/api/v1/routines/${mine.body.id}/assign`, { clientIds: [luciaId], dates: ["2026-10-10"] })).status).toBe(404);
    const [u] = await app.db.select().from(users).where(eq(users.email, "otro2@example.com"));
    expect(u).toBeTruthy();
  });
});
