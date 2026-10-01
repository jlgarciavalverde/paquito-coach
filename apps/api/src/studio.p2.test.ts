import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { createFakeTransport } from "./lib/mail";
import { hashPassword } from "./lib/passwords";
import { purgeOrphanMedia } from "./lib/scheduler";
import { Agent, ORIGIN, PASSWORD, TEST_DATA_DIR, resetDb, setupCoach, testApp } from "./test-utils";

/** P2: perfil y página pública del estudio, solicitudes, aviso legal, buscadores y manifest. */
let app: App;
let coach: Agent;
const fake = createFakeTransport();
const WEB = join(TEST_DATA_DIR, "web-p2");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex");
const PROFILE = {
  name: "Estudio Paquito",
  accent: "verde",
  published: true,
  tagline: "Fuerza y readaptación en Murcia",
  bio: "Graduado en CAFYD. Te ayudo a volver a entrenar sin dolor.",
  specialties: ["Readaptación de rodilla", "Fuerza", "Fuerza"],
  location: "Murcia centro",
  hours: "L–V 8:00–21:00",
  phone: "600 000 000",
  contactEmail: "hola@paquito.es",
  instagram: "@paquito.entrena",
  legalName: "Francisco Pérez",
  taxId: "12345678Z",
  legalAddress: "C/ Mayor 1, Murcia",
};
let ip = 0;
const contact = (body: object) =>
  app.inject({ method: "POST", url: "/api/v1/public/contact", payload: { consent: true, ...body }, headers: { origin: ORIGIN }, remoteAddress: `10.7.0.${++ip}` });
async function upload(url: string, buf: Buffer, type = "image/png") {
  const boundary = "----x";
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="f"\r\nContent-Type: ${type}\r\n\r\n`), buf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return app.inject({ method: "POST", url, payload, headers: { origin: ORIGIN, cookie: coach.cookie, "content-type": `multipart/form-data; boundary=${boundary}` } });
}

beforeAll(async () => {
  await resetDb();
  mkdirSync(WEB, { recursive: true });
  writeFileSync(join(WEB, "index.html"), `<!doctype html><html lang="es"><head><meta name="description" content="x" /><title>Paquito Coach</title></head><body><div id="root"></div></body></html>`);
  app = await testApp({ webDir: WEB }, { mail: fake.send });
  coach = await setupCoach(app);
});
afterAll(() => app.close());

describe("perfil del estudio", () => {
  it("sin publicar no hay página (404) y el estado lo dice", async () => {
    expect((await new Agent(app).get("/api/v1/public/studio")).status).toBe(404);
    expect((await new Agent(app).get("/api/v1/auth/setup-status")).body).toMatchObject({ studioName: "Estudio Paquito", accent: "azul", published: false });
  });

  it("para publicar hace falta presentación; se guardan sin duplicados y el @ se quita", async () => {
    expect((await coach.req("PUT", "/api/v1/studio/profile", { ...PROFILE, bio: "" })).status).toBe(400);
    expect((await coach.req("PUT", "/api/v1/studio/profile", { ...PROFILE, accent: "fucsia" })).status).toBe(400);
    const r = await coach.req("PUT", "/api/v1/studio/profile", PROFILE);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ specialties: ["Readaptación de rodilla", "Fuerza"], instagram: "paquito.entrena", accent: "verde" });
    expect((await new Agent(app).get("/api/v1/auth/setup-status")).body).toMatchObject({ accent: "verde", published: true });
  });

  it("la página pública enseña solo lo público: nada de datos fiscales, código de alta ni tarifas privadas", async () => {
    await coach.post("/api/v1/prices", { name: "Bono 10", kind: "pack", amount: 300, sessions: 10, public: true });
    await coach.post("/api/v1/prices", { name: "Precio amigo", kind: "session", amount: 10, public: false });
    await coach.post("/api/v1/prices", { name: "Antigua", kind: "session", amount: 40, public: true, active: false });
    const r = await new Agent(app).get("/api/v1/public/studio");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: "Estudio Paquito", coachName: "Paquito", tagline: PROFILE.tagline, hasPhoto: false });
    expect(r.body.prices.map((p: { name: string }) => p.name)).toEqual(["Bono 10"]);
    const json = JSON.stringify(r.body);
    for (const secret of ["12345678Z", "C/ Mayor", "joinCode", "paquito@example.com"]) expect(json).not.toContain(secret);
  });

  it("aviso legal: datos del responsable, públicos aunque la página no esté publicada", async () => {
    const r = await new Agent(app).get("/api/v1/public/legal");
    expect(r.body).toEqual({ studioName: "Estudio Paquito", legalName: "Francisco Pérez", taxId: "12345678Z", legalAddress: "C/ Mayor 1, Murcia", contactEmail: "hola@paquito.es" });
  });

  it("foto: solo imágenes; al cambiarla se borra la anterior y la limpieza de huérfanos no la toca", async () => {
    expect((await upload("/api/v1/studio/photo", Buffer.from("%PDF-1.4"), "application/pdf")).statusCode).toBe(415);
    expect((await upload("/api/v1/studio/photo", PNG)).statusCode).toBe(200);
    const [first] = await app.db.select({ id: studios.photoMediaId }).from(studios);
    expect((await upload("/api/v1/studio/photo", PNG)).statusCode).toBe(200);
    const [second] = await app.db.select({ id: studios.photoMediaId }).from(studios);
    expect(existsSync(join(TEST_DATA_DIR, "media", first!.id!))).toBe(false);
    await app.db.execute(sql`update media set created_at = now() - interval '3 days'`);
    await purgeOrphanMedia(app.db, join(TEST_DATA_DIR, "media"));
    const photo = await app.inject({ method: "GET", url: "/api/v1/public/studio/photo" });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/png");
    expect(second!.id).toBeTruthy();
    expect((await new Agent(app).get("/api/v1/public/studio")).body.hasPhoto).toBe(true);
  });
});

describe("«Quiero empezar»", () => {
  it("crea una solicitud y avisa al entrenador por correo; la lista y «atendida»", async () => {
    expect((await contact({ name: "Rosa", email: "rosa@example.com", phone: "611", message: "Me duele la rodilla al correr" })).statusCode).toBe(200);
    await app.mail.flush();
    const m = fake.sent.find((x) => x.subject === "Rosa quiere empezar contigo")!;
    expect(m.to).toBe("paquito@example.com");
    expect(m.text).toContain("Me duele la rodilla");
    const list = (await coach.get("/api/v1/leads")).body;
    expect(list).toEqual([expect.objectContaining({ name: "Rosa", email: "rosa@example.com", phone: "611" })]);
    expect((await coach.post(`/api/v1/leads/${list[0].id}/handle`)).status).toBe(200);
    expect((await coach.get("/api/v1/leads")).body).toEqual([]);
  });

  it("campo trampa relleno: se dice que sí y no se guarda nada; la misma persona dos veces el mismo día, una solicitud", async () => {
    expect((await contact({ name: "Bot", email: "bot@example.com", website: "http://spam" })).statusCode).toBe(200);
    await contact({ name: "Luis", email: "luis@example.com" });
    await contact({ name: "Luis", email: "LUIS@example.com" });
    const names = (await coach.get("/api/v1/leads")).body.map((l: { name: string }) => l.name);
    expect(names).toEqual(["Luis"]);
  });

  it("sin consentimiento, 400; desde la misma IP, como mucho 3 cada 10 minutos", async () => {
    const r = await app.inject({ method: "POST", url: "/api/v1/public/contact", payload: { name: "X", email: "x@example.com" }, headers: { origin: ORIGIN }, remoteAddress: "10.6.6.6" });
    expect(r.statusCode).toBe(400);
    const codes: number[] = [];
    for (let i = 0; i < 4; i++)
      codes.push((await app.inject({ method: "POST", url: "/api/v1/public/contact", payload: { name: "Y", email: `y${i}@example.com`, consent: true }, headers: { origin: ORIGIN }, remoteAddress: "10.5.5.5" })).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
  });

  it("otro estudio no ve ni atiende las solicitudes", async () => {
    const [st] = await app.db.insert(studios).values({ name: "Otro", joinCode: "OTROSTU2" }).returning();
    await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro@example.com", passwordHash: await hashPassword(PASSWORD) });
    const other = new Agent(app);
    await other.post("/api/v1/auth/login", { email: "otro@example.com", password: PASSWORD });
    expect((await other.get("/api/v1/leads")).body).toEqual([]);
    const id = (await coach.get("/api/v1/leads")).body[0].id;
    expect((await other.post(`/api/v1/leads/${id}/handle`)).status).toBe(404);
  });
});

describe("buscadores y compartir", () => {
  it("`/` lleva título, descripción y Open Graph del estudio, escapados", async () => {
    await coach.req("PUT", "/api/v1/studio/profile", { ...PROFILE, tagline: `Fuerza "real" <script>alert(1)</script>` });
    const r = await app.inject({ method: "GET", url: "/" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["x-robots-tag"]).toBeUndefined();
    expect(r.body).toContain("<title>Estudio Paquito · Fuerza &quot;real&quot; &lt;script&gt;alert(1)&lt;/script&gt;</title>");
    expect(r.body).not.toContain("<script>alert(1)");
    expect(r.body).toContain('<meta property="og:image" content="http://test.local/api/v1/public/studio/photo" />');
    expect(r.body.match(/<title>/g)).toHaveLength(1);
    expect(r.body.match(/name="description"/g)).toHaveLength(1);
  });

  it("los paneles no se indexan; robots y sitemap solo con las páginas públicas", async () => {
    expect((await app.inject({ method: "GET", url: "/coach/clientes" })).headers["x-robots-tag"]).toBe("noindex");
    const robots = (await app.inject({ method: "GET", url: "/robots.txt" })).body;
    expect(robots).toContain("Allow: /aviso-legal");
    expect(robots).toContain("Disallow: /");
    const sitemap = (await app.inject({ method: "GET", url: "/sitemap.xml" })).body;
    expect(sitemap).toContain("<loc>http://test.local/</loc>");
    expect(sitemap).not.toContain("/coach");
  });

  it("el manifest (lo que se ve al instalar la app) lleva el nombre del estudio", async () => {
    const m = (await app.inject({ method: "GET", url: "/manifest.webmanifest" })).json();
    expect(m).toMatchObject({ name: "Estudio Paquito", short_name: "Estudio", display: "standalone" });
  });
});
