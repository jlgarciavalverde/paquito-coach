import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import type { App } from "./app";
import { clientProfiles, users } from "./db/schema";
import { Agent, ORIGIN, PASSWORD, TEST_DATA_DIR, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex");
async function upload(agent: Agent) {
  const boundary = "----x";
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="f.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const r = await app.inject({ method: "POST", url: "/api/v1/media", payload, headers: { origin: ORIGIN, cookie: agent.cookie, "content-type": `multipart/form-data; boundary=${boundary}` } });
  return r.json().id as string;
}
const count = async (table: string, clientId: string) =>
  Number((Array.from((await app.db.execute(sql.raw(`select count(*)::int as n from ${table} where client_id = '${clientId}'`))) as unknown as { n: number }[])[0]!.n));

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
});
afterAll(() => app.close());

describe("RGPD", () => {
  it("el cliente descarga todos sus datos en JSON", async () => {
    const { client: lucia, clientId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com");
    await coach.patch(`/api/v1/clients/${clientId}`, { healthNotes: "LCA", privateNotes: "Motivar" });
    await coach.post(`/api/v1/conversations/${clientId}/messages`, { body: "Hola" });
    const r = await lucia.req("GET", "/api/v1/me/export");
    expect(r.status).toBe(200);
    expect(String(r.headers["content-disposition"])).toContain("mis-datos.json");
    expect(r.body.ficha).toMatchObject({ nombre: "Lucía", lesionesYLimitaciones: "LCA", notasDelEntrenador: "Motivar" });
    expect(r.body.cuenta.correo).toBe("lucia@example.com");
    expect(r.body.mensajes[0].texto).toBe("Hola");
    expect((await coach.req("GET", "/api/v1/me/export")).status).toBe(403);
  });

  it("borrar mi cuenta: pide la contraseña y lo borra todo, fotos del disco incluidas", async () => {
    const { client: pepe, clientId } = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com");
    const mediaId = await upload(pepe);
    await pepe.post("/api/v1/me/messages", { body: "", mediaId });
    await coach.post("/api/v1/appointments", { clientId, kind: "session", startsAt: "2026-10-06T08:00:00Z", endsAt: "2026-10-06T09:00:00Z" });
    expect(existsSync(join(TEST_DATA_DIR, "media", mediaId))).toBe(true);

    expect((await pepe.post("/api/v1/me/delete", { password: "incorrecta-larga" })).status).toBe(400);
    const r = await pepe.post("/api/v1/me/delete", { password: PASSWORD });
    expect(r.status).toBe(200);
    expect(existsSync(join(TEST_DATA_DIR, "media", mediaId))).toBe(false);
    expect(await app.db.select().from(clientProfiles).where(eq(clientProfiles.id, clientId))).toEqual([]);
    expect(await app.db.select().from(users).where(eq(users.email, "pepe@example.com"))).toEqual([]);
    for (const t of ["messages", "appointments", "media", "workouts"]) expect(await count(t, clientId)).toBe(0);
    expect((await pepe.get("/api/v1/me")).status).toBe(401);
    expect((await new Agent(app).post("/api/v1/auth/login", { email: "pepe@example.com", password: PASSWORD })).status).toBe(401);
  });

  it("el entrenador exporta y borra definitivamente solo clientes archivados y confirmando el nombre", async () => {
    const c = await coach.post("/api/v1/clients", { name: "Ana Ruiz", invite: false });
    const id = c.body.client.id;
    const ex = await coach.req("GET", `/api/v1/clients/${id}/export`);
    expect(ex.status).toBe(200);
    expect(String(ex.headers["content-disposition"])).toContain("datos-ana-ruiz.json");
    expect((await coach.post(`/api/v1/clients/${id}/delete`, { confirmName: "Ana Ruiz" })).status).toBe(409);
    await coach.post(`/api/v1/clients/${id}/archive`);
    expect((await coach.post(`/api/v1/clients/${id}/delete`, { confirmName: "Otra" })).status).toBe(400);
    expect((await coach.post(`/api/v1/clients/${id}/delete`, { confirmName: "ana ruiz" })).status).toBe(200);
    expect((await coach.get(`/api/v1/clients/${id}`)).status).toBe(404);
    // Queda rastro en la auditoría, sin datos personales
    const logs = Array.from((await app.db.execute(sql.raw(`select action from audit_log where target_id = '${id}'`))) as unknown as { action: string }[]).map((l) => l.action);
    expect(logs).toContain("privacy.delete.client");
  });

  it("la cuenta del entrenador no se borra por aquí", async () => {
    expect((await coach.post("/api/v1/me/delete", { password: PASSWORD })).status).toBe(403);
  });
});
