import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { Agent, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let other: Agent;
let lucia: Agent;
let luciaId: string;
const at = (d: number, h = 10) => new Date(Date.UTC(2026, 8, d, h)).toISOString();
async function appt(day: number) {
  return (await coach.post("/api/v1/appointments", { clientId: luciaId, kind: "session", startsAt: at(day), endsAt: at(day, 11) })).body.id as string;
}

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBC2" }).returning();
  await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro11@example.com", passwordHash: await hashPassword(PASSWORD) });
  other = new Agent(app);
  await other.post("/api/v1/auth/login", { email: "otro11@example.com", password: PASSWORD });
});
afterAll(() => app.close());

describe("bonos de sesiones", () => {
  it("las citas hechas o sin avisar descuentan; las canceladas no; se puede deshacer", async () => {
    expect((await coach.post(`/api/v1/clients/${luciaId}/packs`, { name: "Bono 3", total: 3, price: 120, paid: true })).status).toBe(200);
    const [a1, a2, a3] = [await appt(1), await appt(2), await appt(3)];
    expect((await coach.post(`/api/v1/appointments/${a1}/attendance`, { status: "done" })).body.packId).toBeTruthy();
    await coach.post(`/api/v1/appointments/${a2}/attendance`, { status: "no_show" });
    await coach.post(`/api/v1/appointments/${a3}/attendance`, { status: "cancelled" });
    let [p] = (await coach.get(`/api/v1/clients/${luciaId}/packs`)).body;
    expect(p).toMatchObject({ used: 2, remaining: 1 });
    const att = (await coach.get("/api/v1/attention")).body;
    expect(att[0].reasons).toContainEqual({ kind: "pack", text: "Bono: queda 1 sesión" });
    // Deshacer: vuelve a programada y devuelve la sesión
    await coach.post(`/api/v1/appointments/${a2}/attendance`, { status: "scheduled" });
    [p] = (await coach.get(`/api/v1/clients/${luciaId}/packs`)).body;
    expect(p.remaining).toBe(2);
    expect((await lucia.get("/api/v1/me/packs")).body[0].remaining).toBe(2);
  });

  it("agotado: la siguiente sesión va al bono nuevo; no se borra un bono usado", async () => {
    const [p1] = (await coach.get(`/api/v1/clients/${luciaId}/packs`)).body;
    for (const d of [4, 5]) await coach.post(`/api/v1/appointments/${await appt(d)}/attendance`, { status: "done" });
    expect((await coach.get("/api/v1/attention")).body[0].reasons).toContainEqual({ kind: "pack", text: "Bono agotado: toca renovar" });
    // Sin bono utilizable, la cita se marca igual pero no descuenta
    const extra = await appt(6);
    expect((await coach.post(`/api/v1/appointments/${extra}/attendance`, { status: "done" })).body.packId).toBeNull();
    await coach.post(`/api/v1/clients/${luciaId}/packs`, { name: "Bono 10", total: 10 });
    const a = await appt(7);
    const r = await coach.post(`/api/v1/appointments/${a}/attendance`, { status: "done" });
    expect(r.body.packId).not.toBe(p1.id);
    expect((await coach.del(`/api/v1/packs/${p1.id}`)).status).toBe(409);
  });

  it("caducado no cuenta", async () => {
    await coach.post(`/api/v1/clients/${luciaId}/packs`, { name: "Viejo", total: 5, expires: "2026-08-31" });
    const packs = (await coach.get(`/api/v1/clients/${luciaId}/packs`)).body;
    const viejo = packs.find((p: { name: string }) => p.name === "Viejo");
    const a = await appt(8);
    expect((await coach.post(`/api/v1/appointments/${a}/attendance`, { status: "done" })).body.packId).not.toBe(viejo.id);
  });

  it("aislamiento", async () => {
    const [p] = (await coach.get(`/api/v1/clients/${luciaId}/packs`)).body;
    expect((await other.get(`/api/v1/clients/${luciaId}/packs`)).status).toBe(404);
    expect((await other.post(`/api/v1/clients/${luciaId}/packs`, { name: "x", total: 1 })).status).toBe(404);
    expect((await other.req("PUT", `/api/v1/packs/${p.id}`, { name: "x", total: 1 })).status).toBe(404);
    expect((await other.del(`/api/v1/packs/${p.id}`)).status).toBe(404);
    const a = await appt(9);
    expect((await other.post(`/api/v1/appointments/${a}/attendance`, { status: "done" })).status).toBe(404);
    expect((await lucia.post(`/api/v1/appointments/${a}/attendance`, { status: "done" })).status).toBe(403);
  });
});
