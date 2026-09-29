import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { madridClock, runReminders } from "./lib/scheduler";
import type { PushPayload } from "./lib/push";
import { Agent, ORIGIN, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
let pepe: Agent;
let other: Agent;
const today = () => madridClock(new Date()).date;
const day = (n: number) => {
  const d = new Date(`${today()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex");
async function upload(agent: Agent, query = "") {
  const boundary = "----x";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="foto.png"\r\nContent-Type: image/png\r\n\r\n`),
    PNG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await app.inject({ method: "POST", url: `/api/v1/media${query}`, payload, headers: { origin: ORIGIN, cookie: agent.cookie, "content-type": `multipart/form-data; boundary=${boundary}` } });
  return res.json().id as string;
}

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  ({ client: pepe } = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com"));
  const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBB9" }).returning();
  await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro9@example.com", passwordHash: await hashPassword(PASSWORD) });
  other = new Agent(app);
  await other.post("/api/v1/auth/login", { email: "otro9@example.com", password: PASSWORD });
});
afterAll(() => app.close());

describe("fotos de progreso", () => {
  it("el cliente sube la suya; el entrenador la ve; nadie más", async () => {
    const mediaId = await upload(lucia);
    const p = await lucia.post("/api/v1/me/photos", { mediaId, date: today(), pose: "front" });
    expect(p.status).toBe(200);
    expect((await coach.get(`/api/v1/clients/${luciaId}/photos`)).body).toHaveLength(1);
    // Una foto de otro cliente no se puede colgar como propia
    expect((await pepe.post("/api/v1/me/photos", { mediaId, date: today(), pose: "side" })).status).toBe(400);
    expect((await pepe.get("/api/v1/me/photos")).body).toHaveLength(0);
    expect((await other.get(`/api/v1/clients/${luciaId}/photos`)).status).toBe(404);
    expect((await other.del(`/api/v1/clients/${luciaId}/photos/${p.body.id}`)).status).toBe(404);
    // El entrenador sube una en la consulta
    const m2 = await upload(coach, `?clientId=${luciaId}`);
    expect((await coach.post(`/api/v1/clients/${luciaId}/photos`, { mediaId: m2, date: today(), pose: "side" })).status).toBe(200);
    expect((await lucia.del(`/api/v1/me/photos/${p.body.id}`)).status).toBe(200);
    expect((await lucia.get("/api/v1/me/photos")).body.map((x: { pose: string }) => x.pose)).toEqual(["side"]);
    expect((await app.inject({ method: "GET", url: `/api/v1/media/${mediaId}`, headers: { cookie: lucia.cookie } })).statusCode).toBe(404);
  });
});

describe("métricas propias", () => {
  it("define, anota y respeta lo que el cliente puede anotar", async () => {
    const eva = await coach.post("/api/v1/metric-defs", { name: "Dolor (EVA)", unit: "/10", higherIsBetter: false });
    const rom = await coach.post("/api/v1/metric-defs", { name: "Flexión de rodilla", unit: "°", clientCanLog: false });
    expect((await lucia.req("PUT", "/api/v1/me/custom-metrics", { metricId: eva.body.id, date: today(), value: 4 })).status).toBe(200);
    expect((await lucia.req("PUT", "/api/v1/me/custom-metrics", { metricId: rom.body.id, date: today(), value: 120 })).status).toBe(404);
    expect((await coach.req("PUT", `/api/v1/clients/${luciaId}/custom-metrics`, { metricId: rom.body.id, date: today(), value: 118 })).status).toBe(200);
    // Mismo día: se sustituye
    await coach.req("PUT", `/api/v1/clients/${luciaId}/custom-metrics`, { metricId: rom.body.id, date: today(), value: 121 });
    const mine = (await lucia.get("/api/v1/me/custom-metrics")).body;
    expect(mine.defs.map((d: { name: string }) => d.name)).toEqual(["Dolor (EVA)", "Flexión de rodilla"]); // la ve porque tiene datos
    expect(mine.values.find((v: { metricId: string }) => v.metricId === rom.body.id).value).toBe(121);
    expect((await pepe.get("/api/v1/me/custom-metrics")).body.defs.map((d: { name: string }) => d.name)).toEqual(["Dolor (EVA)"]);
    // Otro estudio ni ve ni toca
    expect((await other.get("/api/v1/metric-defs")).body).toHaveLength(0);
    expect((await other.req("PUT", `/api/v1/metric-defs/${eva.body.id}`, { name: "x" })).status).toBe(404);
    expect((await other.get(`/api/v1/clients/${luciaId}/custom-metrics`)).status).toBe(404);
    // Archivar: deja de ofrecerse pero se conserva la historia
    await coach.req("PUT", `/api/v1/metric-defs/${eva.body.id}`, { name: "Dolor (EVA)", unit: "/10", higherIsBetter: false, archived: true });
    expect((await pepe.get("/api/v1/me/custom-metrics")).body.defs).toHaveLength(0);
    expect((await lucia.get("/api/v1/me/custom-metrics")).body.defs.find((d: { id: string }) => d.id === eva.body.id).archived).toBe(true);
  });
});

describe("check-ins periódicos", () => {
  let formId: string;
  it("crea un formulario, lo asigna y el cliente lo rellena cuando le toca", async () => {
    const f = await coach.post("/api/v1/checkin-forms", {
      name: "Check-in semanal",
      questions: [
        { id: "energia", kind: "scale", label: "¿Qué tal de energía?" },
        { id: "dolor", kind: "yesno", label: "¿Has tenido dolor?" },
        { id: "foto", kind: "photo", label: "Foto de frente", required: false },
        { id: "nota", kind: "text", label: "Algo más", required: false },
      ],
    });
    formId = f.body.id;
    expect((await coach.post(`/api/v1/checkin-forms/${formId}/assign`, { clientIds: [luciaId], everyDays: 7, start: day(1) })).body.assigned).toBe(1);
    expect((await lucia.get("/api/v1/me/checkins")).body).toHaveLength(0); // mañana
    await app.db.execute(sql`update checkin_assignments set next_due = ${day(-1)}`);
    const pending = (await lucia.get("/api/v1/me/checkins")).body;
    expect(pending).toHaveLength(1);
    const id = pending[0].assignmentId;
    expect((await lucia.post(`/api/v1/me/checkins/${id}`, { answers: { energia: 8 } })).body.message).toBe("Falta: «¿Has tenido dolor?»");
    // Foto de otro cliente: no
    const pepePhoto = await upload(pepe);
    expect((await lucia.post(`/api/v1/me/checkins/${id}`, { answers: { energia: 8, dolor: false, foto: pepePhoto } })).status).toBe(400);
    const photo = await upload(lucia);
    const r = await lucia.post(`/api/v1/me/checkins/${id}`, { answers: { energia: 8, dolor: false, foto: photo, intruso: "x" } });
    expect(r.status).toBe(200);
    expect(r.body.answers).toEqual({ energia: 8, dolor: false, foto: photo });
    expect((await lucia.get("/api/v1/me/checkins")).body).toHaveLength(0);
    // Pepe no puede contestar el de Lucía
    expect((await pepe.post(`/api/v1/me/checkins/${id}`, { answers: { energia: 8, dolor: false } })).status).toBe(404);

    const mine = (await coach.get(`/api/v1/clients/${luciaId}/checkins`)).body;
    expect(mine.assignments[0].nextDue).toBe(day(6));
    expect(mine.responses[0].seen).toBe(false);
    const att = (await coach.get("/api/v1/attention")).body;
    expect(att.find((a: { clientName: string }) => a.clientName === "Lucía").reasons.map((r: { kind: string }) => r.kind)).toContain("checkin");
    await coach.post(`/api/v1/clients/${luciaId}/checkins/seen`);
    expect((await coach.get(`/api/v1/clients/${luciaId}/checkins`)).body.responses[0].seen).toBe(true);
  });

  it("recordatorio el día que toca y aviso si pasan 2 días sin contestar", async () => {
    await app.db.execute(sql`update checkin_assignments set next_due = ${today()}`);
    const pushes: { to: string[]; p: PushPayload }[] = [];
    const at9 = new Date(`${today()}T07:30:00Z`); // 9:30 en Madrid (verano) u 8:30 (invierno)
    const sent = await runReminders(app.db, async (to, p) => void pushes.push({ to, p }), at9);
    expect(sent.some((s) => s.startsWith("client-checkin:"))).toBe(true);
    expect(await runReminders(app.db, async () => {}, at9)).not.toContain(sent.find((s) => s.startsWith("client-checkin:")));
    await app.db.execute(sql`update checkin_assignments set next_due = ${day(-3)}`);
    const att = (await coach.get("/api/v1/attention")).body;
    expect(att.find((a: { clientName: string }) => a.clientName === "Lucía").reasons.find((r: { kind: string }) => r.kind === "checkin").text).toBe("Check-in sin contestar");
  });

  it("aislamiento de formularios y archivar", async () => {
    expect((await other.get("/api/v1/checkin-forms")).body).toHaveLength(0);
    expect((await other.post(`/api/v1/checkin-forms/${formId}/assign`, { clientIds: [luciaId], everyDays: 7, start: today() })).status).toBe(404);
    expect((await other.get(`/api/v1/clients/${luciaId}/checkins`)).status).toBe(404);
    const a = (await coach.get(`/api/v1/clients/${luciaId}/checkins`)).body.assignments[0];
    expect((await other.del(`/api/v1/checkin-assignments/${a.id}`)).status).toBe(404);
    expect((await lucia.get("/api/v1/checkin-forms")).status).toBe(403);
    await coach.del(`/api/v1/checkin-forms/${formId}`);
    const after = (await coach.get(`/api/v1/clients/${luciaId}/checkins`)).body;
    expect(after.assignments).toHaveLength(0);
    expect(after.responses).toHaveLength(1); // lo contestado se conserva
  });
});
