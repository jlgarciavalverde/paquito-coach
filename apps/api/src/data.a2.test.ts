import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { App } from "./app";
import type { PushPayload } from "./lib/push";
import { madridClock, purgeExpired, purgeOrphanMedia, runReminders } from "./lib/scheduler";
import { Agent, ORIGIN, TEST_DATA_DIR, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

/** Auditoría A2 (datos): un test por hallazgo. */
let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
const mediaDir = join(TEST_DATA_DIR, "media");
const rows = async <T>(q: ReturnType<typeof sql>) => Array.from((await app.db.execute(q)) as unknown as T[]);

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex");
async function upload(agent: Agent) {
  const boundary = "----x";
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="f.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const r = await app.inject({ method: "POST", url: "/api/v1/media", payload, headers: { origin: ORIGIN, cookie: agent.cookie, "content-type": `multipart/form-data; boundary=${boundary}` } });
  return r.json().id as string;
}
const age = (mediaId: string) => app.db.execute(sql`update media set created_at = now() - interval '2 days' where id = ${mediaId}`);

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
});
afterAll(() => app.close());

describe("limpieza", () => {
  it("archivos huérfanos de más de un día se borran (fila y disco); los usados y los recientes, no", async () => {
    const orphan = await upload(lucia);
    const recent = await upload(lucia);
    const inChat = await upload(lucia);
    await lucia.post("/api/v1/me/messages", { body: "", mediaId: inChat });
    // Foto usada solo como respuesta de un check-in (el id va dentro del JSON)
    const inCheckin = await upload(lucia);
    const f = await coach.post("/api/v1/checkin-forms", { name: "Semanal", questions: [{ id: "foto", kind: "photo", label: "Foto" }] });
    await coach.post(`/api/v1/checkin-forms/${f.body.id}/assign`, { clientIds: [luciaId], everyDays: 7, start: madridClock(new Date()).date });
    const [pending] = (await lucia.get("/api/v1/me/checkins")).body;
    expect((await lucia.post(`/api/v1/me/checkins/${pending.assignmentId}`, { answers: { foto: inCheckin } })).status).toBe(200);
    for (const id of [orphan, inChat, inCheckin]) await age(id);

    expect(await purgeOrphanMedia(app.db, mediaDir)).toBe(1);
    expect(existsSync(join(mediaDir, orphan))).toBe(false);
    for (const id of [recent, inChat, inCheckin]) expect(existsSync(join(mediaDir, id)), id).toBe(true);
    const left = await rows<{ id: string }>(sql`select id from media where id in (${orphan}, ${recent}, ${inChat}, ${inCheckin})`);
    expect(left.map((r) => r.id).sort()).toEqual([recent, inChat, inCheckin].sort());
  });

  it("el registro de auditoría se conserva 2 años", async () => {
    await app.db.execute(sql`insert into audit_log (action, created_at) values ('viejo', now() - interval '2 years 1 day'), ('reciente', now() - interval '700 days')`);
    const r = await purgeExpired(app.db);
    expect(r.audit).toBe(1);
    expect((await rows<{ action: string }>(sql`select action from audit_log where action in ('viejo', 'reciente')`)).map((x) => x.action)).toEqual(["reciente"]);
  });
});

describe("recordatorios", () => {
  // 7 de octubre de 2026 (miércoles) en Madrid (UTC+2)
  const at = (h: number) => new Date(`2026-10-07T${String(h - 2).padStart(2, "0")}:00:00Z`);
  const sent: { to: string[]; p: PushPayload }[] = [];
  const push = async (to: string[], p: PushPayload) => void sent.push({ to, p });

  it("con dos entrenos el mismo día, un solo aviso que nombra los dos; y nada a mediodía", async () => {
    const r1 = await coach.post("/api/v1/routines", { name: "Fuerza", blocks: [] });
    const r2 = await coach.post("/api/v1/routines", { name: "Movilidad", blocks: [] });
    for (const r of [r1, r2]) await coach.post(`/api/v1/routines/${r.body.id}/assign`, { clientIds: [luciaId], dates: ["2026-10-07"] });
    // El servidor arranca a las 12: ya no toca «Hoy toca entrenar»
    expect(await runReminders(app.db, push, at(12))).toEqual([]);
    expect(await runReminders(app.db, push, at(10))).toEqual(expect.arrayContaining([expect.stringMatching(/^client-morning:/)]));
    const mine = sent.filter((s) => s.p.title === "Hoy toca entrenar");
    expect(mine).toHaveLength(1);
    expect(mine[0]!.p.body).toBe("Tienes «Fuerza» y «Movilidad». Ábrelo para ver los ejercicios.");
  });
});

describe("atomicidad", () => {
  it("enviar un check-in dos veces a la vez guarda una respuesta", async () => {
    const f = await coach.post("/api/v1/checkin-forms", { name: "Diario", questions: [{ id: "e", kind: "scale", label: "Energía" }] });
    await coach.post(`/api/v1/checkin-forms/${f.body.id}/assign`, { clientIds: [luciaId], everyDays: 7, start: madridClock(new Date()).date });
    const p = (await lucia.get("/api/v1/me/checkins")).body.find((x: { formName: string }) => x.formName === "Diario");
    const [a, b] = await Promise.all([1, 2].map(() => lucia.post(`/api/v1/me/checkins/${p.assignmentId}`, { answers: { e: 7 } })));
    expect([a!.status, b!.status].sort()).toEqual([200, 409]);
    const n = (await rows<{ n: number }>(sql`select count(*)::int as n from checkin_responses where assignment_id = ${p.assignmentId}`))[0]!.n;
    expect(n).toBe(1);
  });

  it("marcar dos citas a la vez con un bono de 1 sesión: solo una lo gasta", async () => {
    await coach.post(`/api/v1/clients/${luciaId}/packs`, { name: "Suelta", total: 1 });
    const mk = async (h: number) =>
      (await coach.post("/api/v1/appointments", { clientId: luciaId, kind: "session", startsAt: `2026-09-2${h}T08:00:00Z`, endsAt: `2026-09-2${h}T09:00:00Z` })).body.id as string;
    const [a1, a2] = [await mk(1), await mk(2)];
    const res = await Promise.all([a1, a2].map((id) => coach.post(`/api/v1/appointments/${id}/attendance`, { status: "done" })));
    expect(res.map((r) => r.status)).toEqual([200, 200]);
    expect(res.filter((r) => r.body.packId).length).toBe(1);
    const packs = (await coach.get(`/api/v1/clients/${luciaId}/packs`)).body;
    expect(packs.find((p: { name: string }) => p.name === "Suelta")).toMatchObject({ used: 1, remaining: 0 });
  });

  it("asignar un check-in a varios clientes es todo o nada", async () => {
    const f = await coach.post("/api/v1/checkin-forms", { name: "Mensual", questions: [{ id: "e", kind: "scale", label: "Energía" }] });
    const pepe = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com");
    const bad = "00000000-0000-4000-8000-000000000000";
    expect((await coach.post(`/api/v1/checkin-forms/${f.body.id}/assign`, { clientIds: [pepe.clientId, bad], everyDays: 28, start: "2026-11-01" })).status).toBe(404);
    const n = (await rows<{ n: number }>(sql`select count(*)::int as n from checkin_assignments where form_id = ${f.body.id}`))[0]!.n;
    expect(n).toBe(0);
  });
});

describe("rendimiento", () => {
  it("las conversaciones salen bien con el último mensaje y los no leídos por cliente", async () => {
    const pepe = (await rows<{ id: string }>(sql`select id from client_profiles where email = 'pepe@example.com'`))[0]!.id;
    await coach.post(`/api/v1/conversations/${pepe}/messages`, { body: "Hola Pepe" });
    const list = (await coach.get("/api/v1/conversations")).body as { clientName: string; unread: number; lastMessage: { body: string } | null }[];
    expect(list.find((c) => c.clientName === "Pepe")).toMatchObject({ unread: 0, lastMessage: expect.objectContaining({ body: "Hola Pepe" }) });
    expect(list.find((c) => c.clientName === "Lucía")!.unread).toBeGreaterThan(0);
  });
});
