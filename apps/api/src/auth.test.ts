import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "./app";
import { Agent, ORIGIN, PASSWORD, SETUP_CODE, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
beforeAll(async () => {
  await resetDb();
  app = await testApp();
});
afterAll(() => app.close());
beforeEach(async () => {
  await app.close();
  await resetDb();
  app = await testApp();
});

describe("alta inicial", () => {
  it("crea estudio y entrenador una sola vez y con el código correcto", async () => {
    const a = new Agent(app);
    expect((await a.get("/api/v1/auth/setup-status")).body).toEqual({ needsSetup: true });
    const bad = await a.post("/api/v1/auth/setup", { setupCode: "no", studioName: "X", name: "P", email: "p@x.com", password: PASSWORD });
    expect(bad.status).toBe(403);
    await setupCoach(app);
    const again = await a.post("/api/v1/auth/setup", { setupCode: SETUP_CODE, studioName: "Y", name: "Q", email: "q@x.com", password: PASSWORD });
    expect(again.status).toBe(409);
    expect((await a.get("/api/v1/auth/setup-status")).body).toEqual({ needsSetup: false });
  });

  it("rechaza contraseñas cortas o comunes", async () => {
    const a = new Agent(app);
    const short = await a.post("/api/v1/auth/setup", { setupCode: SETUP_CODE, studioName: "X", name: "P", email: "p@x.com", password: "corta" });
    expect(short.status).toBe(400);
    const common = await a.post("/api/v1/auth/setup", { setupCode: SETUP_CODE, studioName: "X", name: "P", email: "p@x.com", password: "1234567890" });
    expect(common.status).toBe(400);
  });
});

describe("sesión", () => {
  it("login, /me, logout; la cookie es HttpOnly y SameSite=Lax", async () => {
    await setupCoach(app);
    const a = new Agent(app);
    const r = await a.post("/api/v1/auth/login", { email: "PAQUITO@example.com", password: PASSWORD });
    expect(r.status).toBe(200);
    const setCookie = String(r.headers["set-cookie"]);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect((await a.get("/api/v1/me")).body.role).toBe("coach");
    await a.post("/api/v1/auth/logout");
    expect((await a.get("/api/v1/me")).status).toBe(401);
  });

  it("mismo error para correo inexistente y contraseña mala", async () => {
    await setupCoach(app);
    const a = new Agent(app);
    const r1 = await a.post("/api/v1/auth/login", { email: "nadie@example.com", password: PASSWORD });
    const r2 = await a.post("/api/v1/auth/login", { email: "paquito@example.com", password: "mala-contraseña" });
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r1.body).toEqual(r2.body);
  });

  it("bloquea la cuenta tras 5 fallos aunque luego acierte", async () => {
    await setupCoach(app);
    const a = new Agent(app);
    for (let i = 0; i < 5; i++) await a.post("/api/v1/auth/login", { email: "paquito@example.com", password: "mala-contraseña" });
    const r = await a.post("/api/v1/auth/login", { email: "paquito@example.com", password: PASSWORD });
    expect(r.status).toBe(429);
    expect(r.body.error).toBe("locked");
  });

  it("límite por IP en /auth: el intento 11 del minuto devuelve 429", async () => {
    await app.close();
    await resetDb();
    app = await testApp({ authRateLimit: 10 });
    const a = new Agent(app);
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await a.post("/api/v1/auth/login", { email: `x${i}@example.com`, password: "loquesea123" })).status);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it("cambiar la contraseña cierra las demás sesiones", async () => {
    const coach = await setupCoach(app);
    const other = new Agent(app);
    await other.post("/api/v1/auth/login", { email: "paquito@example.com", password: PASSWORD });
    const r = await coach.post("/api/v1/auth/password/change", { current: PASSWORD, next: "otra-contraseña-larga" });
    expect(r.status).toBe(200);
    expect((await other.get("/api/v1/me")).status).toBe(401);
    expect((await coach.get("/api/v1/me")).status).toBe(200);
  });
});

describe("CSRF y cabeceras", () => {
  it("rechaza peticiones que modifican datos sin Origin o con Origin ajeno", async () => {
    await setupCoach(app);
    const noOrigin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "paquito@example.com", password: PASSWORD } });
    expect(noOrigin.statusCode).toBe(403);
    const evil = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "https://malo.example" },
      payload: { email: "paquito@example.com", password: PASSWORD },
    });
    expect(evil.statusCode).toBe(403);
    const ok = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin: ORIGIN }, payload: { email: "paquito@example.com", password: PASSWORD } });
    expect(ok.statusCode).toBe(200);
  });

  it("envía CSP estricta, frame-ancestors none y nosniff", async () => {
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ status: "ok", db: "ok" });
    expect(r.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(r.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("registro de clientes", () => {
  it("con invitación: queda activo; la invitación no se puede reutilizar", async () => {
    const coach = await setupCoach(app);
    const c = await coach.post("/api/v1/clients", { name: "Lucía", email: "lucia@example.com", invite: true });
    expect(c.body.client.status).toBe("invited");
    const token = new URL(c.body.invite.url).searchParams.get("invitacion")!;
    const pub = new Agent(app);
    const preview = await pub.get(`/api/v1/auth/invites/${token}`);
    expect(preview.body).toMatchObject({ studioName: "Estudio Paquito", coachName: "Paquito", clientName: "Lucía" });

    const lucia = new Agent(app);
    const r = await lucia.post("/api/v1/auth/register", { inviteToken: token, name: "Lucía", email: "lucia@example.com", password: PASSWORD, healthDataConsent: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ role: "client", clientStatus: "active" });

    const again = await new Agent(app).post("/api/v1/auth/register", { inviteToken: token, name: "Otra", email: "otra@example.com", password: PASSWORD, healthDataConsent: true });
    expect(again.status).toBe(410);
  });

  it("sin consentimiento de datos de salud no hay registro", async () => {
    const coach = await setupCoach(app);
    const c = await coach.post("/api/v1/clients", { name: "Lucía", invite: true });
    const token = new URL(c.body.invite.url).searchParams.get("invitacion")!;
    const r = await new Agent(app).post("/api/v1/auth/register", { inviteToken: token, name: "Lucía", email: "l@example.com", password: PASSWORD, healthDataConsent: false });
    expect(r.status).toBe(400);
  });

  it("regenerar la invitación invalida la anterior", async () => {
    const coach = await setupCoach(app);
    const c = await coach.post("/api/v1/clients", { name: "Lucía", invite: true });
    const old = new URL(c.body.invite.url).searchParams.get("invitacion")!;
    await coach.post(`/api/v1/clients/${c.body.client.id}/invite`);
    expect((await new Agent(app).get(`/api/v1/auth/invites/${old}`)).status).toBe(410);
  });

  it("con código público: queda pendiente hasta que el entrenador acepta", async () => {
    const coach = await setupCoach(app);
    const { body: jc } = await coach.get("/api/v1/studio/join-code");
    const pepe = new Agent(app);
    const r = await pepe.post("/api/v1/auth/register", { joinCode: jc.code.toLowerCase(), name: "Pepe", email: "pepe@example.com", password: PASSWORD, healthDataConsent: true });
    expect(r.status).toBe(200);
    expect(r.body.clientStatus).toBe("pending");
    const pending = await coach.get("/api/v1/clients?status=pending");
    expect(pending.body).toHaveLength(1);
    const acc = await coach.post(`/api/v1/clients/${pending.body[0].id}/accept`);
    expect(acc.body.status).toBe("active");
    expect((await pepe.get("/api/v1/me")).body.clientStatus).toBe("active");
  });

  it("rotar el código público invalida el anterior", async () => {
    const coach = await setupCoach(app);
    const { body: jc } = await coach.get("/api/v1/studio/join-code");
    await coach.post("/api/v1/studio/join-code/rotate");
    expect((await new Agent(app).get(`/api/v1/auth/join/${jc.code}`)).status).toBe(404);
  });

  it("rechazar una solicitud borra la cuenta; archivar cierra sus sesiones", async () => {
    const coach = await setupCoach(app);
    const { body: jc } = await coach.get("/api/v1/studio/join-code");
    const pepe = new Agent(app);
    await pepe.post("/api/v1/auth/register", { joinCode: jc.code, name: "Pepe", email: "pepe@example.com", password: PASSWORD, healthDataConsent: true });
    const [p] = (await coach.get("/api/v1/clients?status=pending")).body;
    await coach.post(`/api/v1/clients/${p.id}/reject`);
    expect((await pepe.get("/api/v1/me")).status).toBe(401);

    const { client: lucia, clientId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com");
    await coach.post(`/api/v1/clients/${clientId}/archive`);
    expect((await lucia.get("/api/v1/me")).status).toBe(401);
  });

  it("enlace de restablecer: un uso, cierra sesiones y solo para clientes con cuenta del estudio", async () => {
    const coach = await setupCoach(app);
    const { client: lucia, clientId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com");
    const r = await coach.post(`/api/v1/clients/${clientId}/reset-link`);
    expect(r.status).toBe(200);
    const token = new URL(r.body.url).searchParams.get("token")!;
    const fresh = new Agent(app);
    const ok = await fresh.post("/api/v1/auth/password/reset", { token, password: "contraseña-nueva-larga" });
    expect(ok.status).toBe(200);
    expect(ok.body.role).toBe("client");
    expect((await lucia.get("/api/v1/me")).status).toBe(401);
    expect((await new Agent(app).post("/api/v1/auth/password/reset", { token, password: "otra-mas-larga-aun" })).status).toBe(410);
    expect((await new Agent(app).post("/api/v1/auth/login", { email: "lucia@example.com", password: "contraseña-nueva-larga" })).status).toBe(200);
    const nf = await coach.post("/api/v1/clients", { name: "Sin cuenta", invite: false });
    expect((await coach.post(`/api/v1/clients/${nf.body.client.id}/reset-link`)).status).toBe(409);
  });

  it("no permite dos cuentas con el mismo correo", async () => {
    const coach = await setupCoach(app);
    const { body: jc } = await coach.get("/api/v1/studio/join-code");
    const r = await new Agent(app).post("/api/v1/auth/register", { joinCode: jc.code, name: "X", email: "Paquito@Example.com", password: PASSWORD, healthDataConsent: true });
    expect(r.status).toBe(409);
  });
});
