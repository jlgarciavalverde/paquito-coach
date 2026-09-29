import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import type { PushPayload } from "./lib/push";
import { Agent, ORIGIN, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let lucia: Agent;
let pepe: Agent;
let luciaId: string;
let pepeId: string;
const pushes: { to: string[]; p: PushPayload }[] = [];

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex");

async function upload(agent: Agent, buf: Buffer, query = "") {
  const boundary = "----x";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="foto.png"\r\nContent-Type: image/png\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await app.inject({ method: "POST", url: `/api/v1/media${query}`, payload, headers: { origin: ORIGIN, cookie: agent.cookie, "content-type": `multipart/form-data; boundary=${boundary}` } });
  return { status: res.statusCode, body: res.json() };
}

beforeAll(async () => {
  await resetDb();
  // Emisor de avisos push falso: se guardan para comprobar a quién se habrían mandado.
  app = await testApp({}, { push: async (to, p) => void pushes.push({ to, p }) });
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  ({ client: pepe, clientId: pepeId } = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com"));
});
afterAll(() => app.close());

describe("mensajes", () => {
  it("entrenador y cliente se escriben; contadores de no leídos y «visto»", async () => {
    const m1 = await coach.post(`/api/v1/conversations/${luciaId}/messages`, { body: "¿Qué tal la rodilla?" });
    expect(m1.status).toBe(200);
    expect(m1.body).toMatchObject({ fromCoach: true, senderName: "Paquito" });
    expect((await lucia.get("/api/v1/me/unread")).body.unread).toBe(1);
    // Lucía no estaba conectada: le llega un push
    expect(pushes.at(-1)).toMatchObject({ p: { title: "Paquito", url: "/app/chat" } });

    await lucia.post("/api/v1/me/messages", { body: "Bien, sin dolor" });
    const convs = await coach.get("/api/v1/conversations");
    const cl = convs.body.find((c: { clientId: string }) => c.clientId === luciaId);
    expect(cl).toMatchObject({ unread: 1, lastMessage: { body: "Bien, sin dolor" } });
    expect(convs.body[0].clientId).toBe(luciaId); // la de último mensaje, primero

    await coach.post(`/api/v1/conversations/${luciaId}/read`);
    expect((await coach.get("/api/v1/conversations")).body.find((c: { clientId: string }) => c.clientId === luciaId).unread).toBe(0);
    const page = await lucia.get("/api/v1/me/messages");
    expect(page.body.messages.map((m: { body: string }) => m.body)).toEqual(["¿Qué tal la rodilla?", "Bien, sin dolor"]);
    expect(page.body.otherReadAt).not.toBeNull(); // Paquito ya lo ha visto
  });

  it("paginación hacia atrás", async () => {
    for (let i = 0; i < 5; i++) await coach.post(`/api/v1/conversations/${pepeId}/messages`, { body: `m${i}` });
    const p1 = await pepe.get("/api/v1/me/messages?limit=3");
    expect(p1.body.messages.map((m: { body: string }) => m.body)).toEqual(["m2", "m3", "m4"]);
    expect(p1.body.hasMore).toBe(true);
    const p2 = await pepe.get(`/api/v1/me/messages?limit=3&before=${encodeURIComponent(p1.body.messages[0].createdAt)}`);
    expect(p2.body.messages.map((m: { body: string }) => m.body)).toEqual(["m0", "m1"]);
    expect(p2.body.hasMore).toBe(false);
  });

  it("no se puede escribir a una ficha sin cuenta ni mandar un mensaje vacío", async () => {
    const nf = await coach.post("/api/v1/clients", { name: "Sin cuenta", invite: false });
    expect((await coach.post(`/api/v1/conversations/${nf.body.client.id}/messages`, { body: "hola" })).status).toBe(409);
    expect((await lucia.post("/api/v1/me/messages", { body: "   " })).status).toBe(400);
  });

  it("fotos: tipo real por los bytes; solo la ve quien participa", async () => {
    expect((await upload(lucia, Buffer.from("<script>alert(1)</script> no soy una imagen"))).status).toBe(415);
    const up = await upload(lucia, PNG);
    expect(up.status).toBe(200);
    const msg = await lucia.post("/api/v1/me/messages", { body: "", mediaId: up.body.id });
    expect(msg.status).toBe(200);
    const asCoach = await app.inject({ method: "GET", url: `/api/v1/media/${up.body.id}`, headers: { cookie: coach.cookie } });
    expect(asCoach.statusCode).toBe(200);
    expect(asCoach.headers["content-type"]).toBe("image/png");
    const asPepe = await app.inject({ method: "GET", url: `/api/v1/media/${up.body.id}`, headers: { cookie: pepe.cookie } });
    expect(asPepe.statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/v1/media/${up.body.id}` })).statusCode).toBe(401);
    // Pepe no puede reutilizar la foto de Lucía en su conversación
    expect((await pepe.post("/api/v1/me/messages", { body: "", mediaId: up.body.id })).status).toBe(400);
  });

  it("tiempo real: el mensaje llega por el socket; otro origen no puede abrirlo", async () => {
    const bad = await app.injectWS("/ws", { headers: { cookie: lucia.cookie, origin: "https://malo.example" } });
    const closed = await new Promise<number>((ok) => bad.on("close", (code) => ok(code)));
    expect(closed).toBe(4401);

    const ws = await app.injectWS("/ws", { headers: { cookie: lucia.cookie, origin: ORIGIN } });
    const events: { type: string; message?: { body: string } }[] = [];
    ws.on("message", (d) => events.push(JSON.parse(String(d))));
    await new Promise((r) => setTimeout(r, 50));
    const before = pushes.length;
    await coach.post(`/api/v1/conversations/${luciaId}/messages`, { body: "En directo" });
    await new Promise((r) => setTimeout(r, 50));
    expect(events.find((e) => e.type === "message.new")?.message?.body).toBe("En directo");
    // Conectada: no se le manda push
    expect(pushes.slice(before).some((p) => p.to.length > 0)).toBe(false);
    ws.terminate();
  });

  it("aislamiento: otro estudio no ve conversaciones ni fotos; un cliente no lee la de otro", async () => {
    const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBB5" }).returning();
    await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro5@example.com", passwordHash: await hashPassword(PASSWORD) });
    const other = new Agent(app);
    await other.post("/api/v1/auth/login", { email: "otro5@example.com", password: PASSWORD });
    expect((await other.get("/api/v1/conversations")).body).toEqual([]);
    expect((await other.get(`/api/v1/conversations/${luciaId}/messages`)).status).toBe(404);
    expect((await other.post(`/api/v1/conversations/${luciaId}/messages`, { body: "hola" })).status).toBe(404);
    expect((await upload(other, PNG, `?clientId=${luciaId}`)).status).toBe(404);
    expect((await lucia.get(`/api/v1/conversations/${pepeId}/messages`)).status).toBe(403);
  });
});
