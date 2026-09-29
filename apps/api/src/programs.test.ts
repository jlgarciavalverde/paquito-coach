import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { madridClock } from "./lib/scheduler";
import { Agent, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let other: Agent;
let luciaId: string;
let lucia: Agent;
let legId: string;
let upId: string;
let programId: string;

const today = () => madridClock(new Date()).date;
const add = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const nextMonday = () => {
  const t = today();
  const wd = ((new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return add(t, 8 - wd);
};
const block = (exerciseId: string, load: string) => ({
  id: "b1",
  name: "Fuerza",
  items: [{ id: "i1", exerciseId, exerciseName: "Sentadilla", sets: 3, reps: "5", load, effort: "", tempo: "", restSec: null, notes: "", group: null }],
});

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  const ex = await coach.post("/api/v1/exercises", { name: "Sentadilla", muscle: "quads", equipment: "barbell" });
  legId = (await coach.post("/api/v1/routines", { name: "Pierna", blocks: [block(ex.body.id, "80")] })).body.id;
  upId = (await coach.post("/api/v1/routines", { name: "Torso", blocks: [block(ex.body.id, "banda roja")] })).body.id;
  const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBC1" }).returning();
  await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro10@example.com", passwordHash: await hashPassword(PASSWORD) });
  other = new Agent(app);
  await other.post("/api/v1/auth/login", { email: "otro10@example.com", password: PASSWORD });
});
afterAll(() => app.close());

describe("programas de varias semanas", () => {
  it("crea un programa y rechaza rutinas ajenas", async () => {
    const body = {
      name: "Readaptación LCA, fase 2",
      weeks: 3,
      slots: [1, 2, 3].flatMap((w) => [{ week: w, weekday: 1, routineId: legId }, { week: w, weekday: 4, routineId: upId }]),
      progression: { kind: "kg", step: 2.5 },
    };
    const p = await coach.post("/api/v1/programs", body);
    expect(p.status).toBe(200);
    programId = p.body.id;
    expect((await other.post("/api/v1/programs", body)).status).toBe(400);
    expect((await other.get(`/api/v1/programs/${programId}`)).status).toBe(404);
    expect((await other.req("PUT", `/api/v1/programs/${programId}`, body)).status).toBe(404);
    expect((await lucia.get("/api/v1/programs")).status).toBe(403);
  });

  it("aplicarlo genera los entrenos con la carga de cada semana", async () => {
    const start = nextMonday();
    const r = await coach.post(`/api/v1/programs/${programId}/assign`, { clientIds: [luciaId], start });
    expect(r.body.created).toBe(6);
    const ws = (await coach.get(`/api/v1/clients/${luciaId}/workouts?from=${start}&to=${add(start, 30)}`)).body as { date: string; title: string; blocks: { items: { load: string }[] }[] }[];
    const legs = ws.filter((w) => w.title.startsWith("Pierna")).map((w) => [w.date, w.title, w.blocks[0]!.items[0]!.load]);
    expect(legs).toEqual([
      [start, "Pierna, semana 1 de 3", "80"],
      [add(start, 7), "Pierna, semana 2 de 3", "82,5"],
      [add(start, 14), "Pierna, semana 3 de 3", "85"],
    ]);
    expect(ws.find((w) => w.title === "Torso, semana 3 de 3")!.blocks[0]!.items[0]!.load).toBe("banda roja");
    expect((await coach.get("/api/v1/programs")).body[0].activeRuns).toBe(1);
    expect((await other.post(`/api/v1/programs/${programId}/assign`, { clientIds: [luciaId], start })).status).toBe(404);
  });

  it("en curso: progreso y terminar antes de tiempo quita solo lo pendiente", async () => {
    const [run] = (await coach.get(`/api/v1/clients/${luciaId}/program-runs`)).body;
    expect(run).toMatchObject({ name: "Readaptación LCA, fase 2", total: 6, done: 0, pending: 6, ended: false });
    // Uno ya empezado (con series anotadas) no se borra
    await app.db.execute(sql`update workouts set log = '{"i1":[{"reps":"5","load":"80","rpe":null,"done":true}]}'::jsonb where id = (select id from workouts order by date limit 1)`);
    expect((await other.post(`/api/v1/program-runs/${run.id}/end`)).status).toBe(404);
    expect((await coach.post(`/api/v1/program-runs/${run.id}/end`)).body.removed).toBe(5);
    const [after] = (await coach.get(`/api/v1/clients/${luciaId}/program-runs`)).body;
    expect(after).toMatchObject({ total: 1, ended: true });
    expect((await other.get(`/api/v1/clients/${luciaId}/program-runs`)).status).toBe(404);
  });

  it("borrar el programa no toca lo aplicado", async () => {
    await coach.del(`/api/v1/programs/${programId}`);
    const [run] = (await coach.get(`/api/v1/clients/${luciaId}/program-runs`)).body;
    expect(run.programId).toBeNull();
    expect(run.total).toBe(1);
  });
});
