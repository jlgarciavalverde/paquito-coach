import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { Agent, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
let apptId: string;
const range = "from=2026-10-05T00:00:00Z&to=2026-10-12T00:00:00Z";

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
});
afterAll(() => app.close());

describe("agenda", () => {
  it("crea citas con y sin cliente y valida horas", async () => {
    const r = await coach.post("/api/v1/appointments", { clientId: luciaId, kind: "session", startsAt: "2026-10-06T08:00:00Z", endsAt: "2026-10-06T09:00:00Z", notes: "Revisar rodilla" });
    expect(r.status).toBe(200);
    expect(r.body.clientName).toBe("Lucía");
    apptId = r.body.id;
    expect((await coach.post("/api/v1/appointments", { clientId: null, kind: "other", title: "Formación", startsAt: "2026-10-07T16:00:00+02:00", endsAt: "2026-10-07T18:00:00+02:00" })).status).toBe(200);
    expect((await coach.post("/api/v1/appointments", { clientId: null, kind: "other", startsAt: "2026-10-07T18:00:00Z", endsAt: "2026-10-07T17:00:00Z" })).status).toBe(400);
    const list = await coach.get(`/api/v1/appointments?${range}`);
    expect(list.body).toHaveLength(2);
    expect((await coach.get(`/api/v1/appointments?${range}&clientId=${luciaId}`)).body).toHaveLength(1);
  });

  it("mover (arrastrar) cambia inicio y fin; no deja fin antes de inicio", async () => {
    const r = await coach.patch(`/api/v1/appointments/${apptId}`, { startsAt: "2026-10-08T10:00:00Z", endsAt: "2026-10-08T11:00:00Z" });
    expect(r.body.startsAt).toBe("2026-10-08T10:00:00.000Z");
    expect((await coach.patch(`/api/v1/appointments/${apptId}`, { endsAt: "2026-10-08T09:00:00Z" })).status).toBe(400);
  });

  it("el cliente ve sus citas sin las notas internas; no ve las del estudio", async () => {
    const r = await lucia.get(`/api/v1/me/appointments?${range}`);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].notes).toBe("");
    expect((await lucia.get(`/api/v1/appointments?${range}`)).status).toBe(403);
    expect((await lucia.patch(`/api/v1/appointments/${apptId}`, { title: "x" })).status).toBe(403);
  });

  it("rechaza rangos enormes", async () => {
    expect((await coach.get("/api/v1/appointments?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z")).status).toBe(400);
  });

  it("aislamiento: otro estudio no ve, mueve ni asigna citas a clientes ajenos", async () => {
    const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBB4" }).returning();
    await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro4@example.com", passwordHash: await hashPassword(PASSWORD) });
    const other = new Agent(app);
    await other.post("/api/v1/auth/login", { email: "otro4@example.com", password: PASSWORD });
    expect((await other.get(`/api/v1/appointments?${range}`)).body).toEqual([]);
    expect((await other.patch(`/api/v1/appointments/${apptId}`, { title: "hack" })).status).toBe(404);
    expect((await other.del(`/api/v1/appointments/${apptId}`)).status).toBe(404);
    expect((await other.post("/api/v1/appointments", { clientId: luciaId, kind: "session", startsAt: "2026-10-06T08:00:00Z", endsAt: "2026-10-06T09:00:00Z" })).status).toBe(404);
    expect((await coach.del(`/api/v1/appointments/${apptId}`)).status).toBe(200);
  });
});
