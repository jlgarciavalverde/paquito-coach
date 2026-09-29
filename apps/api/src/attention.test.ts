import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { madridClock } from "./lib/scheduler";
import { Agent, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
const day = (n: number) => {
  const d = new Date(`${madridClock(new Date()).date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
});
afterAll(() => app.close());

describe("necesitan atención", () => {
  it("reúne entrenos sin hacer, inactividad, PAR-Q con alerta y mensajes sin contestar", async () => {
    const { client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com");
    const { clientId: pepeId } = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com");
    const { client: ana, clientId: anaId } = await inviteAndRegister(app, coach, "Ana", "ana@example.com");
    await inviteAndRegister(app, coach, "Todo bien", "ok@example.com");
    const r = await coach.post("/api/v1/routines", { name: "R", blocks: [] });
    // Lucía: 2 sin hacer esta semana
    await coach.post(`/api/v1/routines/${r.body.id}/assign`, { clientIds: [luciaId], dates: [day(-2), day(-4)] });
    // Pepe: uno hace 9 días sin hacer (inactivo, no «2 esta semana»)
    await coach.post(`/api/v1/routines/${r.body.id}/assign`, { clientIds: [pepeId], dates: [day(-9)] });
    // Ana: PAR-Q con alerta y un mensaje de hace dos días sin contestar
    await ana.post("/api/v1/me/questionnaire", { parq: [true, false, false, false, false, false, false], anamnesis: {} });
    await ana.post("/api/v1/me/messages", { body: "¿Mañana a qué hora?" });
    await app.db.execute(sql`update messages set created_at = now() - interval '2 days'`);
    // Lucía escribe hoy: reciente, no cuenta
    await lucia.post("/api/v1/me/messages", { body: "Hola" });

    const a = await coach.get("/api/v1/attention");
    const by = Object.fromEntries(a.body.map((x: { clientName: string; reasons: { kind: string }[] }) => [x.clientName, x.reasons.map((r) => r.kind)]));
    expect(by).toEqual({ Ana: ["health", "unanswered"], Lucía: ["missed"], Pepe: ["inactive"] });
    expect(a.body[0].clientName).toBe("Ana"); // más motivos, primero
    void anaId;
  });

  it("marcar todo como revisado", async () => {
    await app.db.execute(sql`update workouts set status = 'done', completed_at = now(), seen_by_coach = false`);
    expect((await coach.get("/api/v1/activity")).body.some((x: { unseen: boolean }) => x.unseen)).toBe(true);
    await coach.post("/api/v1/activity/seen");
    expect((await coach.get("/api/v1/activity")).body.some((x: { unseen: boolean }) => x.unseen)).toBe(false);
  });

  it("aislamiento y permisos", async () => {
    const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBB8" }).returning();
    await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro8@example.com", passwordHash: await hashPassword(PASSWORD) });
    const other = new Agent(app);
    await other.post("/api/v1/auth/login", { email: "otro8@example.com", password: PASSWORD });
    expect((await other.get("/api/v1/attention")).body).toEqual([]);
    await other.post("/api/v1/activity/seen");
    const { client } = await inviteAndRegister(app, coach, "Cliente", "c@example.com");
    expect((await client.get("/api/v1/attention")).status).toBe(403);
  });
});
