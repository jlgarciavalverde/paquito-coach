import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { madridClock } from "./lib/scheduler";
import { Agent, ORIGIN, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let other: Agent;
let lucia: Agent;
let luciaId: string;
let pepe: Agent;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex");
async function upload(agent: Agent, buf: Buffer, name: string, type: string) {
  const boundary = "----x";
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`), buf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const res = await app.inject({ method: "POST", url: "/api/v1/resources/upload", payload, headers: { origin: ORIGIN, cookie: agent.cookie, "content-type": `multipart/form-data; boundary=${boundary}` } });
  return { status: res.statusCode, body: res.json() };
}
const get = (a: Agent, id: string) => app.inject({ method: "GET", url: `/api/v1/media/${id}`, headers: { cookie: a.cookie } }).then((r) => r.statusCode);

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  ({ client: pepe } = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com"));
  const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBC4" }).returning();
  await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro13@example.com", passwordHash: await hashPassword(PASSWORD) });
  other = new Agent(app);
  await other.post("/api/v1/auth/login", { email: "otro13@example.com", password: PASSWORD });
});
afterAll(() => app.close());

describe("biblioteca de material", () => {
  it("PDF solo para Lucía: ella lo ve y lo abre; Pepe y otro estudio no", async () => {
    expect((await upload(coach, PNG, "x.pdf", "application/pdf")).status).toBe(415);
    expect((await upload(lucia, PDF, "x.pdf", "application/pdf")).status).toBe(403);
    const up = await upload(coach, PDF, "pauta.pdf", "application/pdf");
    const r = await coach.post("/api/v1/resources", { title: "Pauta de rodilla", kind: "pdf", mediaId: up.body.id, forAll: false, clientIds: [luciaId] });
    expect(r.status).toBe(200);
    await coach.post("/api/v1/resources", { title: "Respiración", kind: "link", url: "https://www.youtube.com/watch?v=abc" });
    expect((await lucia.get("/api/v1/me/resources")).body.map((x: { title: string }) => x.title)).toEqual(["Respiración", "Pauta de rodilla"]);
    expect((await pepe.get("/api/v1/me/resources")).body.map((x: { title: string }) => x.title)).toEqual(["Respiración"]);
    expect(await get(lucia, up.body.id)).toBe(200);
    expect(await get(pepe, up.body.id)).toBe(404);
    expect(await get(other, up.body.id)).toBe(404);
    expect((await other.post("/api/v1/resources", { title: "x", kind: "pdf", mediaId: up.body.id })).status).toBe(400);
    expect((await other.post("/api/v1/resources", { title: "x", kind: "link", url: "https://a.es", forAll: false, clientIds: [luciaId] })).status).toBe(404);
    expect((await other.del(`/api/v1/resources/${r.body.id}`)).status).toBe(404);
    expect((await coach.del(`/api/v1/resources/${r.body.id}`)).status).toBe(200);
    expect(await get(lucia, up.body.id)).toBe(404);
  });
});

describe("logros e informes", () => {
  it("racha, total y récords recientes", async () => {
    const t = madridClock(new Date()).date;
    const ex = await coach.post("/api/v1/exercises", { name: "Sentadilla", muscle: "quads", equipment: "barbell" });
    const blocks = [{ id: "b", name: "", items: [{ id: "i", exerciseId: ex.body.id, exerciseName: "Sentadilla", sets: 1, reps: "5", load: "", effort: "", tempo: "", restSec: null, notes: "", group: null }] }];
    const rt = await coach.post("/api/v1/routines", { name: "R", blocks });
    const d = (n: number) => { const x = new Date(`${t}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10); };
    await coach.post(`/api/v1/routines/${rt.body.id}/assign`, { clientIds: [luciaId], dates: [d(14), d(7), d(0)] });
    await app.db.execute(sql`update workouts set status = 'done', completed_at = now(), log = jsonb_build_object('i', jsonb_build_array(jsonb_build_object('reps','5','load', (case when date = ${d(0)} then '100' else '80' end), 'rpe', null, 'done', true)))`);
    const a = (await lucia.get("/api/v1/me/achievements")).body;
    expect(a).toMatchObject({ streakWeeks: 3, totalDone: 3, recentRecords: ["Sentadilla"] });
    const rep = (await coach.get("/api/v1/reports")).body;
    expect(rep.activeClients).toBe(2);
    expect(rep.weekly).toHaveLength(8);
    expect((await lucia.get("/api/v1/reports")).status).toBe(403);
    expect((await other.get("/api/v1/reports")).body.activeClients).toBe(0);
  });
});
