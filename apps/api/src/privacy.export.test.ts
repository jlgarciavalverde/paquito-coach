import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import type { App } from "./app";
import { EXPORT_COVERAGE, NOT_EXPORTED } from "./routes/privacy";
import { Agent, ORIGIN, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

/**
 * Exportación y borrado RGPD generados desde el catálogo de Postgres: cualquier tabla con `client_id` o `user_id` tiene que
 * estar en la exportación (o excluida con motivo) y quedar vacía para esa persona tras borrarla. Una tabla nueva no se escapa.
 */
let app: App;
let coach: Agent;
let tables: { table: string; column: "client_id" | "user_id" }[];

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex");
async function upload(agent: Agent) {
  const boundary = "----x";
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="f.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const r = await app.inject({ method: "POST", url: "/api/v1/media", payload, headers: { origin: ORIGIN, cookie: agent.cookie, "content-type": `multipart/form-data; boundary=${boundary}` } });
  return r.json().id as string;
}

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
  tables = Array.from(
    (await app.db.execute(sql`
      select table_name as "table", column_name as "column" from information_schema.columns
      where table_schema = 'public' and column_name in ('client_id', 'user_id') order by 1, 2`)) as unknown as { table: string; column: "client_id" | "user_id" }[],
  ).filter((t) => t.table !== "client_profiles" || t.column === "user_id");
});
afterAll(() => app.close());

/** Un cliente con algo en casi todas partes. */
async function populated() {
  const { client, clientId } = await inviteAndRegister(app, coach, "Marta Completa", "marta@example.com");
  const mediaId = await upload(client);
  await client.post("/api/v1/me/messages", { body: "Hola", mediaId });
  await coach.post(`/api/v1/conversations/${clientId}/messages`, { body: "¿Qué tal?" });
  await client.get(`/api/v1/me/messages`);
  await client.post("/api/v1/push/subscriptions", { endpoint: "https://fcm.googleapis.com/fcm/send/marta", keys: { p256dh: "a", auth: "b" } });
  await coach.post("/api/v1/appointments", { clientId, kind: "session", startsAt: "2026-10-06T08:00:00Z", endsAt: "2026-10-06T09:00:00Z", notes: "Traer rodillera" });
  await coach.post(`/api/v1/clients/${clientId}/packs`, { name: "Bono 5", total: 5 });
  await client.post("/api/v1/me/metrics", { date: "2026-09-01", weightKg: 60 });
  return { client, clientId, mediaId };
}

describe("exportación RGPD", () => {
  it("toda tabla con datos de una persona está exportada o excluida con motivo", () => {
    const undecided = [...new Set(tables.map((t) => t.table))].filter((t) => !(t in EXPORT_COVERAGE) && !(t in NOT_EXPORTED));
    expect(undecided).toEqual([]);
  });

  it("la exportación trae todas las secciones, con lo nuevo (notas de cita, dispositivos, registro de accesos)", async () => {
    const { client } = await populated();
    const r = await client.get("/api/v1/me/export");
    expect(r.status).toBe(200);
    for (const key of Object.values(EXPORT_COVERAGE)) expect(r.body, key).toHaveProperty(key);
    expect(r.body.citas[0].notas).toBe("Traer rodillera");
    expect(r.body.dispositivosConAvisos).toEqual([expect.objectContaining({ servicio: "fcm.googleapis.com" })]);
    expect(JSON.stringify(r.body.dispositivosConAvisos)).not.toContain("marta"); // sin el endpoint completo (es una credencial)
    expect(r.body.sesionesAbiertas.length).toBeGreaterThan(0);
    expect(r.body.archivos).toHaveLength(1);
    expect(r.body.registroDeAccesos.length).toBeGreaterThan(0);
    expect(r.body.cuenta).toMatchObject({ correo: "marta@example.com", recordatorios: true });
    expect(JSON.stringify(r.body)).not.toMatch(/password|token_hash|p256dh/i);
  });

  it("el ZIP lleva los datos y sus fotos; el entrenador también puede descargarlo", async () => {
    const clientId = (Array.from((await app.db.execute(sql`select id from client_profiles where email = 'marta@example.com'`)) as unknown as { id: string }[]))[0]!.id;
    const media_id = (Array.from((await app.db.execute(sql`select media_id from messages where media_id is not null and client_id = ${clientId}`)) as unknown as { media_id: string }[]))[0]!.media_id;
    const r = await app.inject({ method: "GET", url: `/api/v1/clients/${clientId}/export.zip`, headers: { cookie: coach.cookie } });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("application/zip");
    expect(String(r.headers["content-disposition"])).toContain("datos-marta-completa.zip");
    const files = unzipSync(new Uint8Array(r.rawPayload));
    expect(JSON.parse(strFromU8(files["datos.json"]!)).ficha.nombre).toBe("Marta Completa");
    expect(Buffer.from(files[`archivos/${media_id}.png`]!).equals(PNG)).toBe(true);
    // Un cliente no descarga el ZIP de otro (la ruta es del entrenador)
    const other = await inviteAndRegister(app, coach, "Otro", "otro@example.com");
    expect((await other.client.get(`/api/v1/clients/${clientId}/export.zip`)).status).toBe(403);
  });

  it("tras borrar la cuenta no queda nada suyo en ninguna tabla (los cobros quedan anonimizados)", async () => {
    // Marta (la del primer caso, con datos en casi todas las tablas) borra su cuenta
    const client = new Agent(app);
    expect((await client.post("/api/v1/auth/login", { email: "marta@example.com", password: PASSWORD })).status).toBe(200);
    const clientId = (Array.from((await app.db.execute(sql`select id from client_profiles where email = 'marta@example.com'`)) as unknown as { id: string }[]))[0]!.id;
    const userId = (Array.from((await app.db.execute(sql`select user_id from client_profiles where id = ${clientId}`)) as unknown as { user_id: string }[]))[0]!.user_id;
    expect((await client.post("/api/v1/me/delete", { password: PASSWORD })).status).toBe(200);
    const left: string[] = [];
    for (const { table, column } of tables) {
      const id = column === "client_id" ? clientId : userId;
      const n = (Array.from((await app.db.execute(sql.raw(`select count(*)::int as n from "${table}" where "${column}" = '${id}'`))) as unknown as { n: number }[]))[0]!.n;
      if (n > 0) left.push(`${table}.${column}: ${n}`);
    }
    expect(left).toEqual([]);
  });
});
