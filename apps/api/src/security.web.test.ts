import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import Stripe from "stripe";
import type { App } from "./app";
import { sessions } from "./db/schema";
import { createFakeGateway } from "./lib/stripe";
import { redactUrl } from "./lib/redact";
import { hashToken } from "./lib/tokens";
import { recordFailure, resetThrottle, trackedKeys } from "./lib/throttle";
import { Agent, ORIGIN, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

/** Ataques web habituales (OWASP Top 10), sesiones y tokens. */
let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
const gw = createFakeGateway("whsec_sec");
const sidOf = (setCookie: string | string[] | undefined) => String([setCookie].flat()[0] ?? "").split(";")[0]!;

beforeAll(async () => {
  await resetDb();
  resetThrottle();
  app = await testApp({}, { gateway: gw });
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
});
afterAll(() => app.close());

const login = (email: string, password: string, cookie?: string) =>
  app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password }, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) } });

describe("sesiones", () => {
  it("cookie HttpOnly, SameSite=Lax y Path=/; el token no se guarda en claro", async () => {
    const r = await login("paquito@example.com", PASSWORD);
    const c = String(r.headers["set-cookie"]);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\//);
    const token = sidOf(r.headers["set-cookie"]).split("=")[1]!;
    expect(token.length).toBeGreaterThanOrEqual(43); // 256 bits en base64url
    const rows = await app.db.select({ h: sessions.tokenHash }).from(sessions);
    expect(rows.some((x) => x.h === token)).toBe(false);
    expect(rows.every((x) => /^[0-9a-f]{64}$/.test(x.h))).toBe(true);
  });

  it("en producción: prefijo __Host- y Secure", async () => {
    const prod = await testApp({ secureCookies: true });
    const r = await prod.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "paquito@example.com", password: PASSWORD }, headers: { origin: ORIGIN } });
    expect(String(r.headers["set-cookie"])).toMatch(/^__Host-sid=.*Secure/i);
    expect(r.headers["strict-transport-security"]).toMatch(/max-age=31536000/);
    await prod.close();
  });

  it("al volver a entrar, la sesión anterior del navegador deja de valer (sin reutilizar tokens)", async () => {
    const first = sidOf((await login("paquito@example.com", PASSWORD)).headers["set-cookie"]);
    const second = sidOf((await login("paquito@example.com", PASSWORD, first)).headers["set-cookie"]);
    expect(second).not.toBe(first);
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: first } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: second } })).statusCode).toBe(200);
  });

  it("cerrar sesión la invalida en el servidor (reutilizar la cookie no sirve)", async () => {
    const sid = sidOf((await login("paquito@example.com", PASSWORD)).headers["set-cookie"]);
    await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { origin: ORIGIN, cookie: sid } });
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: sid } })).statusCode).toBe(401);
  });

  it("caduca por inactividad (60 días) y por edad máxima (180 días) aunque se use", async () => {
    const a = sidOf((await login("paquito@example.com", PASSWORD)).headers["set-cookie"]);
    const b = sidOf((await login("paquito@example.com", PASSWORD)).headers["set-cookie"]);
    const hashOf = (sid: string) => hashToken(decodeURIComponent(sid.split("=")[1]!));
    await app.db.execute(sql`update sessions set last_used_at = now() - interval '61 days' where token_hash = ${hashOf(a)}`);
    await app.db.execute(sql`update sessions set created_at = now() - interval '181 days' where token_hash = ${hashOf(b)}`);
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: a } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: b } })).statusCode).toBe(401);
  });

  it("tokens de sesión inventados, larguísimos o raros: 401 sin romper nada", async () => {
    for (const t of ["x", "a".repeat(5000), "../../etc/passwd", "' OR 1=1 --", "%00", "😀"]) {
      const r = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: `sid=${encodeURIComponent(t)}` } });
      expect(r.statusCode).toBe(401);
    }
  });

  it("cambiar la contraseña cierra las demás sesiones", async () => {
    const other = sidOf((await login("lucia@example.com", PASSWORD)).headers["set-cookie"]);
    const r = await lucia.post("/api/v1/auth/password/change", { current: PASSWORD, next: "otra-contraseña-segura-1" });
    expect(r.status).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: other } })).statusCode).toBe(401);
    expect((await lucia.get("/api/v1/me")).status).toBe(200);
  });

  it("«cerrar las demás sesiones» deja solo la actual", async () => {
    const other = sidOf((await login("paquito@example.com", PASSWORD)).headers["set-cookie"]);
    const r = await coach.post("/api/v1/me/sessions/revoke-others");
    expect(r.body.closed).toBeGreaterThanOrEqual(1);
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: other } })).statusCode).toBe(401);
    expect((await coach.get("/api/v1/me")).status).toBe(200);
  });

  it("archivar a un cliente lo saca de todas sus sesiones", async () => {
    const { client: ana, clientId: anaId } = await inviteAndRegister(app, coach, "Ana", "ana@example.com");
    expect((await ana.get("/api/v1/me")).status).toBe(200);
    await coach.post(`/api/v1/clients/${anaId}/archive`);
    expect((await ana.get("/api/v1/me/workouts?from=2026-10-01&to=2026-10-07")).status).toBeGreaterThanOrEqual(401);
  });
});

describe("contraseñas y fuerza bruta", () => {
  it("mismo mensaje con correo inexistente y con contraseña mala (no se revela quién existe)", async () => {
    resetThrottle();
    const a = await login("nadie@example.com", "lo-que-sea-123");
    const b = await login("paquito@example.com", "contraseña-mala-123");
    expect(a.statusCode).toBe(b.statusCode);
    expect(a.json().message).toBe(b.json().message);
  });

  it("5 fallos bloquean la cuenta, incluso con la contraseña buena", async () => {
    resetThrottle();
    for (let i = 0; i < 5; i++) await login("lucia@example.com", `mala-${i}-xxxxxxxx`);
    const r = await login("lucia@example.com", "otra-contraseña-segura-1");
    expect(r.statusCode).toBe(429);
    resetThrottle();
  });

  it("el freno por cuenta no crece sin límite con correos inventados", () => {
    resetThrottle();
    for (let i = 0; i < 10_050; i++) recordFailure(`x${i}@spam.com`);
    expect(trackedKeys()).toBeLessThanOrEqual(10_000);
    resetThrottle();
  });

  it("contraseñas débiles o comunes no se aceptan", async () => {
    const r = await lucia.post("/api/v1/auth/password/change", { current: "otra-contraseña-segura-1", next: "123456789" });
    expect(r.status).toBe(400);
  });
});

describe("tokens de invitación y de restablecer", () => {
  it("la invitación sirve una sola vez", async () => {
    const c = await coach.post("/api/v1/clients", { name: "Iker", email: "iker@example.com", invite: true });
    const token = new URL(c.body.invite.url).searchParams.get("invitacion")!;
    const reg = (email: string) => app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Iker", email, password: "una-contraseña-larga-2", inviteToken: token, healthDataConsent: true }, headers: { origin: ORIGIN } });
    const [r1, r2] = await Promise.all([reg("iker@example.com"), reg("iker2@example.com")]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([200, 410].sort());
    expect((await app.inject({ method: "GET", url: `/api/v1/auth/invites/${token}` })).statusCode).toBeGreaterThanOrEqual(404);
  });

  it("el enlace de restablecer: un solo uso, caduca y cierra todas las sesiones", async () => {
    const link = await coach.post(`/api/v1/clients/${luciaId}/reset-link`);
    const token = new URL(link.body.url).searchParams.get("token")!;
    const before = sidOf((await login("lucia@example.com", "otra-contraseña-segura-1")).headers["set-cookie"]);
    const use = () => app.inject({ method: "POST", url: "/api/v1/auth/password/reset", payload: { token, password: "nueva-contraseña-segura-3" }, headers: { origin: ORIGIN } });
    expect((await use()).statusCode).toBe(200);
    expect((await use()).statusCode).toBe(410);
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: before } })).statusCode).toBe(401);
    const link2 = await coach.post(`/api/v1/clients/${luciaId}/reset-link`);
    const t2 = new URL(link2.body.url).searchParams.get("token")!;
    await app.db.execute(sql`update password_resets set expires_at = now() - interval '1 minute'`);
    expect((await app.inject({ method: "POST", url: "/api/v1/auth/password/reset", payload: { token: t2, password: "nueva-contraseña-segura-4" }, headers: { origin: ORIGIN } })).statusCode).toBe(410);
  });

  it("los tokens de las URL no llegan a los logs", () => {
    expect(redactUrl("/api/v1/auth/invites/abcDEF123_-xyz?x=1")).toBe("/api/v1/auth/invites/[oculto]?x=1");
    expect(redactUrl("/registro?invitacion=secreto&a=b")).toBe("/registro?invitacion=[oculto]&a=b");
    expect(redactUrl("/restablecer?token=secreto")).toBe("/restablecer?token=[oculto]");
  });
});

describe("CSRF, cabeceras y contenido", () => {
  it("sin Origin o con uno ajeno: 403 (también con text/plain, el truco de CSRF por formulario)", async () => {
    const base = { method: "POST" as const, url: "/api/v1/clients", payload: JSON.stringify({ name: "x", invite: false }), headers: { cookie: coach.cookie, "content-type": "application/json" } };
    expect((await app.inject(base)).statusCode).toBe(403);
    expect((await app.inject({ ...base, headers: { ...base.headers, origin: "https://evil.example" } })).statusCode).toBe(403);
    expect((await app.inject({ ...base, headers: { ...base.headers, origin: "null" } })).statusCode).toBe(403);
    expect((await app.inject({ ...base, headers: { ...base.headers, origin: "https://evil.example", "content-type": "text/plain" } })).statusCode).toBe(403);
  });

  it("cabeceras de seguridad en la API", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: coach.cookie } });
    const csp = String(r.headers["content-security-policy"]);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["permissions-policy"]).toContain("camera=()");
    expect(r.headers["x-powered-by"]).toBeUndefined();
  });

  it("JSON con __proto__ (contaminación del prototipo): 400 y el prototipo sigue limpio", async () => {
    const r = await app.inject({ method: "POST", url: "/api/v1/clients", payload: '{"name":"x","invite":false,"__proto__":{"polluted":true}}', headers: { origin: ORIGIN, cookie: coach.cookie, "content-type": "application/json" } });
    expect(r.statusCode).toBe(400);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("ids con nombres especiales (__proto__, constructor) no se aceptan como claves", async () => {
    const ex = await coach.post("/api/v1/exercises", { name: "Sentadilla", muscle: "quads", equipment: "barbell" });
    const block = (id: string) => ({ id: "b1", name: "", items: [{ id, exerciseId: ex.body.id, exerciseName: "S", sets: 1, reps: "", load: "", effort: "", tempo: "", restSec: null, notes: "", group: null }] });
    for (const id of ["__proto__", "constructor", "a b", "<script>"]) expect((await coach.post("/api/v1/routines", { name: "R", blocks: [block(id)] })).status).toBe(400);
  });

  it("cuerpo enorme: 413; JSON roto: 400; tipo de contenido raro: 415", async () => {
    const big = JSON.stringify({ name: "x".repeat(300_000), invite: false });
    expect((await app.inject({ method: "POST", url: "/api/v1/clients", payload: big, headers: { origin: ORIGIN, cookie: coach.cookie, "content-type": "application/json" } })).statusCode).toBe(413);
    expect((await app.inject({ method: "POST", url: "/api/v1/clients", payload: '{"name": "x",', headers: { origin: ORIGIN, cookie: coach.cookie, "content-type": "application/json" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/v1/clients", payload: "<x/>", headers: { origin: ORIGIN, cookie: coach.cookie, "content-type": "application/xml" } })).statusCode).toBe(415);
  });

  it("inyección SQL en búsquedas: se trata como texto", async () => {
    for (const q of ["' OR 1=1 --", "%", "_", "\\", "'; drop table users; --"]) {
      const r = await coach.get(`/api/v1/exercises?q=${encodeURIComponent(q)}`);
      expect(r.status).toBe(200);
      expect(r.body.length).toBe(0);
    }
    expect((await coach.get("/api/v1/me")).status).toBe(200);
  });

  it("recorrer carpetas con el id de un archivo: no", async () => {
    for (const p of ["..%2F..%2Fetc%2Fpasswd", "../../../etc/passwd", "%2e%2e%2f"]) {
      const r = await app.inject({ method: "GET", url: `/api/v1/media/${p}`, headers: { cookie: coach.cookie } });
      expect([400, 404]).toContain(r.statusCode);
    }
  });

  it("XSS almacenado: el texto vuelve tal cual (lo escapa la web) y el CSV neutraliza fórmulas", async () => {
    const evil = `<img src=x onerror=alert(1)>`;
    const c = await coach.post("/api/v1/clients", { name: evil, invite: false });
    expect((await coach.get(`/api/v1/clients/${c.body.client.id}`)).body.name).toBe(evil);
    const f = await coach.post("/api/v1/clients", { name: "=HYPERLINK(\"http://evil\",\"x\")", invite: false });
    const link = await coach.post(`/api/v1/clients/${f.body.client.id}/payment-links`, { description: "@SUM(A1)", amount: 10 });
    const co = gw.checkouts.at(-1)!;
    const payload = JSON.stringify({ id: "evt_csv", object: "event", type: "checkout.session.completed", data: { object: { id: co.id, object: "checkout.session", mode: "payment", amount_total: co.amountCents, currency: "eur", payment_status: "paid", payment_intent: "pi_csv", metadata: co.metadata } } });
    await app.inject({ method: "POST", url: "/api/v1/stripe/webhook", payload, headers: { "content-type": "application/json", "stripe-signature": gw.sign(payload) } });
    const csv = (await app.inject({ method: "GET", url: "/api/v1/payments.csv", headers: { cookie: coach.cookie } })).body;
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).toContain(`"'@SUM(A1)"`);
    void link;
  });

  it("asignación masiva: campos de más se ignoran (no se puede cambiar de estudio ni de usuario)", async () => {
    const c = await coach.post("/api/v1/clients", { name: "Masivo", invite: false, studioId: "00000000-0000-4000-8000-000000000000", userId: "00000000-0000-4000-8000-000000000000", status: "active" });
    expect(c.status).toBe(200);
    expect(c.body.client.status).toBe("no_account");
    expect((await coach.get(`/api/v1/clients/${c.body.client.id}`)).status).toBe(200);
  });

  it("fechas imposibles: 400", async () => {
    for (const d of ["2026-02-30", "2026-13-01", "0001-01-01", "2026-1-1"]) expect((await coach.get(`/api/v1/workouts?from=${d}&to=2026-10-01`)).status).toBe(400);
  });
});

describe("webhook de Stripe", () => {
  it("firma antigua (repetición de un evento viejo): rechazada", async () => {
    const payload = JSON.stringify({ id: "evt_old", object: "event", type: "checkout.session.completed", data: { object: {} } });
    const old = new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload, secret: "whsec_sec", timestamp: Math.floor(Date.now() / 1000) - 3600 });
    const r = await app.inject({ method: "POST", url: "/api/v1/stripe/webhook", payload, headers: { "content-type": "application/json", "stripe-signature": old } });
    expect(r.statusCode).toBe(400);
  });
  it("firma con otro secreto: rechazada", async () => {
    const payload = JSON.stringify({ id: "evt_x", object: "event", type: "charge.refunded", data: { object: {} } });
    const sig = new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload, secret: "whsec_otro" });
    expect((await app.inject({ method: "POST", url: "/api/v1/stripe/webhook", payload, headers: { "content-type": "application/json", "stripe-signature": sig } })).statusCode).toBe(400);
  });
});
