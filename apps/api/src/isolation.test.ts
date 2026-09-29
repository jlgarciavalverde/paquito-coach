import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { App } from "./app";
import { studios, users, clientProfiles } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { Agent, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

/**
 * Aislamiento: un segundo estudio (otro entrenador) y un cliente no pueden ver ni tocar nada ajeno.
 * La app solo permite un alta inicial, así que el segundo estudio se crea directamente en la BD.
 */
let app: App;
let coachA: Agent;
let coachB: Agent;
let clientA: Agent;
let clientAId: string;
let clientB2Id: string;

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coachA = await setupCoach(app);
  ({ client: clientA, clientId: clientAId } = await inviteAndRegister(app, coachA, "Lucía", "lucia@example.com"));
  const [st] = await app.db.insert(studios).values({ name: "Estudio B", joinCode: "BBBBBBBB" }).returning();
  await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro@example.com", passwordHash: await hashPassword(PASSWORD) });
  coachB = new Agent(app);
  await coachB.post("/api/v1/auth/login", { email: "otro@example.com", password: PASSWORD });
  const b2 = await coachB.post("/api/v1/clients", { name: "Cliente de B", invite: false });
  clientB2Id = b2.body.client.id;
});
afterAll(() => app.close());

describe("aislamiento entre estudios", () => {
  it("el entrenador B no ve la lista ni la ficha de A", async () => {
    const list = await coachB.get("/api/v1/clients");
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(["Cliente de B"]);
    expect((await coachB.get(`/api/v1/clients/${clientAId}`)).status).toBe(404);
  });

  it("el entrenador B no puede modificar, invitar, archivar ni aceptar clientes de A", async () => {
    expect((await coachB.patch(`/api/v1/clients/${clientAId}`, { name: "Hackeado" })).status).toBe(404);
    expect((await coachB.post(`/api/v1/clients/${clientAId}/invite`)).status).toBe(404);
    expect((await coachB.post(`/api/v1/clients/${clientAId}/archive`)).status).toBe(404);
    expect((await coachB.post(`/api/v1/clients/${clientAId}/accept`)).status).toBe(404);
    const [row] = await app.db.select().from(clientProfiles).where(eq(clientProfiles.id, clientAId));
    expect(row!.name).toBe("Lucía");
  });

  it("el entrenador A tampoco ve al cliente de B", async () => {
    expect((await coachA.get(`/api/v1/clients/${clientB2Id}`)).status).toBe(404);
  });
});

describe("permisos de cliente", () => {
  it("un cliente no accede a rutas de entrenador", async () => {
    expect((await clientA.get("/api/v1/clients")).status).toBe(403);
    expect((await clientA.get(`/api/v1/clients/${clientAId}`)).status).toBe(403);
    expect((await clientA.get("/api/v1/studio/join-code")).status).toBe(403);
    expect((await clientA.post("/api/v1/clients", { name: "X", invite: false })).status).toBe(403);
  });

  it("sin sesión todo devuelve 401", async () => {
    const anon = new Agent(app);
    expect((await anon.get("/api/v1/clients")).status).toBe(401);
    expect((await anon.get("/api/v1/me")).status).toBe(401);
  });

  it("las notas privadas y de salud se guardan y queda rastro en audit_log", async () => {
    await coachA.patch(`/api/v1/clients/${clientAId}`, { healthNotes: "Tendinopatía rotuliana", privateNotes: "Motivar con objetivos cortos" });
    const r = await coachA.get(`/api/v1/clients/${clientAId}`);
    expect(r.body.healthNotes).toBe("Tendinopatía rotuliana");
    const logs = await app.db.execute<{ action: string }>(`select action from audit_log where target_id = '${clientAId}'` as never);
    expect(Array.from(logs as unknown as { action: string }[]).map((l) => l.action)).toEqual(expect.arrayContaining(["client.update", "client.view"]));
  });
});
