import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { createFakeGateway } from "./lib/stripe";
import { createFakeAi } from "./lib/ai/fake";
import { Agent, ORIGIN, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

/**
 * Fuzz: datos basura contra TODAS las rutas (sacadas del registro de rutas, no de una lista a mano).
 * Va en su propio archivo e instancia: agota los límites de peticiones a propósito.
 */
let app: App;
let coach: Agent;
let lucia: Agent;
const UUID = "3f1c1b9e-7d2a-4c1e-9a3b-2b8f4d6e1a55";

beforeAll(async () => {
  await resetDb();
  app = await testApp({ globalRateLimit: 100_000 }, { gateway: createFakeGateway(), ai: createFakeAi(() => ({ basura: true })) });
  coach = await setupCoach(app);
  ({ client: lucia } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
});
afterAll(() => app.close());

const GARBAGE: unknown[] = [
  null,
  [],
  "texto",
  12345,
  true,
  { a: 1 },
  { name: 123, email: [], date: "ayer", amount: "mucho", id: { $ne: null } },
  { name: "x".repeat(10_000) },
  { clientIds: Array(500).fill(UUID), dates: Array(500).fill("2026-10-01") },
  { blocks: [{ id: "b", name: "", items: [{ id: "i", exerciseId: "no-uuid", sets: -5 }] }] },
  { startsAt: "no es fecha", endsAt: "2026-13-45T99:99:99Z" },
  { amount: -10, total: 0, sessions: 1e9 },
  { answers: { "a b": 1, "": 2 } },
];
// Las que cierran la sesión no se prueban aquí (dejarían sin sesión al resto).
const SKIP = ["/api/v1/auth/logout", "/api/v1/me/sessions/revoke-others", "/api/v1/auth/password/change"];

describe("datos basura en todas las rutas que escriben", () => {
  it("nunca 500: siempre un 4xx con mensaje", async () => {
    const bad: string[] = [];
    const routes = app.routeList.filter((r) => r.url.startsWith("/api/v1/") && ["POST", "PUT", "PATCH"].includes(r.method) && !SKIP.includes(r.url) && !r.url.includes("webhook") && !r.url.includes("/upload") && !r.url.endsWith("/documents") && r.url !== "/api/v1/media" && !r.url.endsWith("/photos"));
    expect(routes.length).toBeGreaterThan(60);
    for (const r of routes) {
      const url = r.url.replace(/:[a-zA-Z]+/g, UUID);
      for (const who of [coach, lucia]) {
        for (const body of GARBAGE) {
          const res = await app.inject({ method: r.method as "POST", url, payload: JSON.stringify(body), headers: { origin: ORIGIN, cookie: who.cookie, "content-type": "application/json" } });
          if (res.statusCode >= 500) bad.push(`${r.method} ${r.url} ${JSON.stringify(body).slice(0, 60)} → ${res.statusCode} ${res.body.slice(0, 120)}`);
          else if (res.statusCode >= 400 && !res.json().message) bad.push(`${r.method} ${r.url} → ${res.statusCode} sin mensaje`);
        }
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it("parámetros de consulta basura en las lecturas: nunca 500", async () => {
    const bad: string[] = [];
    const routes = app.routeList.filter((r) => r.url.startsWith("/api/v1/") && r.method === "GET" && !r.url.includes("/docs"));
    for (const r of routes) {
      const url = r.url.replace(/:[a-zA-Z]+/g, "no-es-un-id");
      for (const q of ["", "?from=2026-99-99&to=x", "?limit=-1&q=%00", "?exerciseIds=a,b,c&days=9999", "?from[]=1&to[$gt]=2"]) {
        const res = await app.inject({ method: "GET", url: url + q, headers: { cookie: coach.cookie } });
        if (res.statusCode >= 500) bad.push(`${r.url}${q} → ${res.statusCode}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

