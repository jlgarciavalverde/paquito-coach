import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { canonicalPath } from "./lib/path";
import { resetThrottle } from "./lib/throttle";
import { ORIGIN, PASSWORD, resetDb, setupCoach, testApp } from "./test-utils";

/** Rodeos de las defensas por la forma de la URL o de las cabeceras. */
let app: App;
beforeAll(async () => {
  await resetDb();
  resetThrottle();
  app = await testApp({ authRateLimit: 3 });
  await setupCoach(app);
});
afterAll(() => app.close());

let n = 0;
// Un correo distinto cada vez: así solo actúa el límite por IP (no el bloqueo por cuenta).
const login = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: "POST", url, payload: { email: `nadie${++n}@example.com`, password: "x".repeat(12) }, headers: { origin: ORIGIN, ...headers } });

describe("rodeos de URL", () => {
  it("ruta canónica: decodifica %XX y quita la consulta", () => {
    expect(canonicalPath("/%61pi/v1/auth/login?x=1")).toBe("/api/v1/auth/login");
    expect(canonicalPath("/api/v1/%E0%A4%A")).toBe("/api/v1/%E0%A4%A");
  });

  it("el límite de intentos de entrar cuenta igual con /%61pi/… (antes se lo saltaba)", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await login(i % 2 ? "/%61pi/v1/auth/login" : "/api/v1/auth/login")).statusCode);
    expect(codes).toContain(429);
    expect((await login("/%61pi/v1/auth/login")).statusCode).toBe(429);
  });

  it("X-Forwarded-For no da intentos nuevos (sin túnel no se confía en esa cabecera)", async () => {
    const r = await login("/api/v1/auth/login", { "x-forwarded-for": "203.0.113.99" });
    expect(r.statusCode).toBe(429);
  });

  it("la API sigue con no-store aunque se pida con %XX", async () => {
    const r = await app.inject({ method: "GET", url: "/%61pi/v1/auth/setup-status" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("CSRF: la exención del webhook no vale para otras rutas con el mismo prefijo", async () => {
    const r = await app.inject({ method: "POST", url: "/api/v1/stripe/webhookx", payload: "{}", headers: { "content-type": "application/json" } });
    expect(r.statusCode).toBe(403);
  });
});

describe("demo", () => {
  it("la lista negra también para /%61pi/… y cubre sesiones, archivar y ajustes", async () => {
    const demo = await testApp({ demoMode: true });
    for (const url of ["/%61pi/v1/me/sessions/revoke-others", "/api/v1/me/sessions/revoke-others", "/api/v1/clients/3f1c1b9e-7d2a-4c1e-9a3b-2b8f4d6e1a55/archive", "/api/v1/studio/booking", "/api/v1/prices"]) {
      const r = await demo.inject({ method: url.endsWith("booking") ? "PUT" : "POST", url, payload: {}, headers: { origin: ORIGIN } });
      expect(r.statusCode, url).toBe(403);
    }
    await demo.close();
  });
});

describe("modos simulados en producción", () => {
  it("no arranca con PAYMENTS_FAKE ni AI_FAKE", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(testApp({ paymentsFake: true })).rejects.toThrow(/producción/);
      await expect(testApp({ aiFake: true })).rejects.toThrow(/producción/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
void PASSWORD;
