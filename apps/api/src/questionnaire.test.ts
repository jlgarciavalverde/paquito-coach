import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { Agent, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
const anamnesis = { pastInjuries: "Rotura de LCA izquierda (2025)", surgeries: "Plastia LCA marzo 2026", medication: "", painNow: 2, painArea: "Rodilla", currentActivity: "Bici estática", goal: "Volver a correr", other: "" };

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
});
afterAll(() => app.close());

describe("cuestionario de salud", () => {
  it("recién registrado está pendiente; al enviarlo, las respuestas «sí» son alertas", async () => {
    expect((await lucia.get("/api/v1/me/questionnaire")).body).toEqual({ pending: true, last: null });
    expect((await lucia.post("/api/v1/me/questionnaire", { parq: [false, false], anamnesis })).status).toBe(400);
    const r = await lucia.post("/api/v1/me/questionnaire", { parq: [false, false, false, false, false, true, false], anamnesis });
    expect(r.status).toBe(200);
    expect(r.body.alerts).toEqual([5]);
    expect((await lucia.get("/api/v1/me/questionnaire")).body.pending).toBe(false);
  });

  it("el entrenador lo ve en pendientes de revisar, lo revisa y puede pedir que lo repita", async () => {
    const un = await coach.get("/api/v1/questionnaires/unreviewed");
    expect(un.body).toEqual([expect.objectContaining({ clientId: luciaId, clientName: "Lucía", alerts: 1 })]);
    const st = await coach.get(`/api/v1/clients/${luciaId}/questionnaire`);
    expect(st.body.last.anamnesis.surgeries).toBe("Plastia LCA marzo 2026");
    await coach.post(`/api/v1/clients/${luciaId}/questionnaire/review`);
    expect((await coach.get("/api/v1/questionnaires/unreviewed")).body).toEqual([]);
    await coach.post(`/api/v1/clients/${luciaId}/questionnaire/request`);
    expect((await lucia.get("/api/v1/me/questionnaire")).body.pending).toBe(true);
    const again = await lucia.post("/api/v1/me/questionnaire", { parq: Array(7).fill(false), anamnesis: { ...anamnesis, painNow: 6 } });
    expect(again.body.alerts).toEqual([-1]); // dolor ≥ 5 también es alerta
    expect((await lucia.get("/api/v1/me/questionnaire")).body.pending).toBe(false);
  });

  it("va en la copia de datos del cliente", async () => {
    const ex = await lucia.req("GET", "/api/v1/me/export");
    expect(ex.body.cuestionariosDeSalud).toHaveLength(2);
  });

  it("permisos y aislamiento", async () => {
    expect((await lucia.get(`/api/v1/clients/${luciaId}/questionnaire`)).status).toBe(403);
    expect((await coach.post("/api/v1/me/questionnaire", { parq: Array(7).fill(false), anamnesis })).status).toBe(403);
    const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBB7" }).returning();
    await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro7@example.com", passwordHash: await hashPassword(PASSWORD) });
    const other = new Agent(app);
    await other.post("/api/v1/auth/login", { email: "otro7@example.com", password: PASSWORD });
    expect((await other.get(`/api/v1/clients/${luciaId}/questionnaire`)).status).toBe(404);
    expect((await other.post(`/api/v1/clients/${luciaId}/questionnaire/review`)).status).toBe(404);
    expect((await other.post(`/api/v1/clients/${luciaId}/questionnaire/request`)).status).toBe(404);
    expect((await other.get("/api/v1/questionnaires/unreviewed")).body).toEqual([]);
  });
});
