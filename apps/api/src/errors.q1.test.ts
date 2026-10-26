import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { errorReports } from "./db/schema";
import { fingerprint, scrub } from "./lib/error-log";
import { Agent, ORIGIN, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let admin: Agent;
let lucia: Agent;

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  // Ruta que revienta (solo en esta prueba) para ver el camino de un 500 de verdad.
  app.get("/api/v1/clients/boom/now", async () => {
    throw new Error("No se pudo leer la ficha de paquito@example.com (cliente 123e4567-e89b-12d3-a456-426614174000)");
  });
  coach = await setupCoach(app);
  ({ client: lucia } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  admin = new Agent(app);
  await admin.post("/api/v1/auth/signup", { studioName: "Admin", slug: "administracion", name: "Admin", email: "admin@example.com", password: "una-contraseña-larga", acceptTerms: true });
});
afterAll(() => app.close());

describe("registro propio de errores", () => {
  it("cada respuesta lleva x-request-id", async () => {
    const r = await coach.get("/api/v1/me");
    expect(r.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("un 500 del servidor se registra sin datos personales y devuelve el request id", async () => {
    const r = await coach.get("/api/v1/clients/boom/now");
    expect(r.status).toBe(500);
    expect(r.body.requestId).toBe(r.headers["x-request-id"]);
    expect(r.body.message).toBe("Algo ha fallado en el servidor");
    await new Promise((ok) => setTimeout(ok, 50));
    const [row] = await app.db.select().from(errorReports);
    expect(row).toMatchObject({ source: "api", count: 1, lastRequestId: r.body.requestId, path: "GET /api/v1/clients/boom/now" });
    expect(row!.message).not.toContain("paquito@example.com");
    expect(row!.message).toContain("[correo]");
    expect(row!.message).toContain("[id]");
  });

  it("la web informa (también sin sesión) y el mismo error se agrupa", async () => {
    const send = (a: Agent) => a.post("/api/v1/client-errors", { message: "TypeError: x is undefined at línea 12", stack: "TypeError\n    at Cuaderno (index-abc.js:1:2345)", path: "/app/entreno/123?token=secreto", version: "2.3.0", kind: "error" });
    expect((await send(new Agent(app))).status).toBe(204);
    expect((await send(lucia)).status).toBe(204);
    const web = (await app.db.select().from(errorReports)).filter((r) => r.source === "web");
    expect(web).toHaveLength(1);
    expect(web[0]).toMatchObject({ count: 2, path: "/app/entreno/123" });
  });

  it("sin origen permitido no se acepta (CSRF) y hay límite por IP", async () => {
    const r = await app.inject({ method: "POST", url: "/api/v1/client-errors", payload: { message: "x" }, headers: { origin: "https://malo.example" } });
    expect(r.statusCode).toBe(403);
    const codes: number[] = [];
    for (let i = 0; i < 22; i++) codes.push((await app.inject({ method: "POST", url: "/api/v1/client-errors", payload: { message: `spam ${i}` }, headers: { origin: ORIGIN }, remoteAddress: "10.9.9.9" })).statusCode);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  });

  it("solo la administración ve y resuelve; si vuelve a pasar, se reabre", async () => {
    expect((await coach.get("/api/v1/admin/errors")).status).toBe(404);
    const list = await admin.get("/api/v1/admin/errors");
    expect(list.status).toBe(200);
    const web = list.body.find((e: { source: string; message: string }) => e.source === "web" && e.message.startsWith("TypeError"));
    expect((await admin.post(`/api/v1/admin/errors/${web.id}/resolve`)).body.resolved).toBe(true);
    expect((await admin.get("/api/v1/admin/errors")).body.find((e: { id: string }) => e.id === web.id)).toBeUndefined();
    await lucia.post("/api/v1/client-errors", { message: "TypeError: x is undefined at línea 99", stack: "TypeError\n    at Cuaderno (index-abc.js:1:9999)" });
    expect((await admin.get("/api/v1/admin/errors")).body.find((e: { id: string }) => e.id === web.id)).toMatchObject({ resolved: false, count: 3 });
  });
});

describe("limpieza y huella", () => {
  it("oculta correos, ids, claves de Stripe y teléfonos", () => {
    expect(scrub("a@b.es acct_1AbCdEfGh +34 612 345 678 sk_test_abcdefgh", 500)).toBe("[correo] [stripe] [número] [stripe]");
  });
  it("las cifras y posiciones no cambian la huella", () => {
    expect(fingerprint("web", "error", "falló la serie 3", "at A (x.js:1:20)")).toBe(fingerprint("web", "error", "falló la serie 7", "at A (x.js:9:99)"));
    expect(fingerprint("web", "error", "falló la serie", "")).not.toBe(fingerprint("api", "error", "falló la serie", ""));
  });
});
