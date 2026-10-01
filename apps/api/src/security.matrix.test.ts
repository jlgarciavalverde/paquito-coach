import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { createFakeGateway } from "./lib/stripe";
import { createFakeAi } from "./lib/ai/fake";
import { Agent, ORIGIN, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";
import { CLIENT_ROUTES, PUBLIC_ROUTES } from "./lib/access";

/**
 * Matriz de autorización generada a partir de TODAS las rutas registradas: si alguien añade un endpoint y se olvida de
 * protegerlo, este test falla sin que haya que acordarse de escribir uno nuevo.
 */
let app: App;
let coach: Agent;
let lucia: Agent;
const UUID = "3f1c1b9e-7d2a-4c1e-9a3b-2b8f4d6e1a55";

const PUBLIC = [...PUBLIC_ROUTES, "GET /health"];
const ANY_USER = CLIENT_ROUTES;

const fill = (url: string) => url.replace(/:token/g, "x".repeat(40)).replace(/:code/g, "ABCDEFGH").replace(/:date/g, "2026-10-01").replace(/:[a-zA-Z]+/g, UUID);
const key = (r: { method: string; url: string }) => `${r.method} ${r.url}`;
const apiRoutes = () =>
  app.routeList.filter((r) => (r.url.startsWith("/api/v1/") || r.url === "/health") && !r.url.includes("/docs") && r.method !== "OPTIONS" && !r.url.endsWith("*"));

beforeAll(async () => {
  await resetDb();
  app = await testApp({}, { gateway: createFakeGateway(), ai: createFakeAi(() => ({})) });
  coach = await setupCoach(app);
  ({ client: lucia } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
});
afterAll(() => app.close());

async function call(r: { method: string; url: string }, cookie?: string) {
  const res = await app.inject({
    method: r.method as "GET",
    url: fill(r.url),
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}), ...(r.method === "GET" || r.method === "DELETE" ? {} : { "content-type": "application/json" }) },
    ...(r.method === "GET" || r.method === "DELETE" ? {} : { payload: "{}" }),
  });
  return res.statusCode;
}

describe("matriz de autorización", () => {
  it("hay rutas que comprobar (el registro funciona)", () => {
    expect(apiRoutes().length).toBeGreaterThan(120);
  });

  it("sin sesión: todo lo que no es público da 401 (nunca 200 ni 500)", async () => {
    const bad: string[] = [];
    for (const r of apiRoutes()) {
      if (PUBLIC.includes(key(r))) continue;
      const s = await call(r);
      if (s !== 401) bad.push(`${key(r)} → ${s}`);
    }
    expect(bad).toEqual([]);
  });

  it("como cliente: lo del entrenador da 403 antes de mirar nada (nunca 200 ni 500)", async () => {
    const bad: string[] = [];
    for (const r of apiRoutes()) {
      const k = key(r);
      if (PUBLIC.includes(k) || ANY_USER.has(k) || r.url.startsWith("/api/v1/me/") || r.url === "/api/v1/me") continue;
      const s = await call(r, lucia.cookie);
      if (s !== 403) bad.push(`${k} → ${s}`);
    }
    expect(bad).toEqual([]);
  });

  it("las listas de acceso no tienen rutas fantasma (todas existen)", () => {
    const all = new Set(apiRoutes().map(key));
    const ghosts = [...PUBLIC_ROUTES, ...CLIENT_ROUTES].filter((k) => !all.has(k) && !k.includes("/auth/demo") && !k.includes("/stripe/simulate") && !k.includes("/test/mails"));
    expect(ghosts).toEqual([]);
  });

  it("ninguna ruta pública ni de usuario revienta con un cuerpo vacío (sin 500)", async () => {
    const bad: string[] = [];
    for (const r of apiRoutes()) {
      for (const who of [undefined, coach.cookie, lucia.cookie]) {
        const s = await call(r, who);
        if (s >= 500) bad.push(`${key(r)} (${who === coach.cookie ? "entrenador" : who ? "cliente" : "anónimo"}) → ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
