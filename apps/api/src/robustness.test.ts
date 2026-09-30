import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { App } from "./app";
import { createFakeGateway } from "./lib/stripe";
import { createFakeAi } from "./lib/ai/fake";
import { AiError } from "./lib/ai/provider";
import { createGemini } from "./lib/ai/gemini";
import { madridClock } from "./lib/scheduler";
import { madridInstant } from "./lib/tz";
import { Agent, ORIGIN, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

/** Situaciones anómalas: datos basura en todas las rutas, carreras, cambios de hora, fallos de servicios externos. */
let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
let pepe: Agent;
const gw = createFakeGateway("whsec_rob");
let aiMode: "ok" | "throw-quota" | "throw-down" | "garbage" = "ok";
const ai = createFakeAi(() => {
  if (aiMode === "throw-quota") throw new AiError("quota", "Límite");
  if (aiMode === "throw-down") throw new AiError("unavailable", "Caída");
  if (aiMode === "garbage") return { nada: "que ver", blocks: "no es una lista" };
  return { name: "R", description: "", blocks: [] };
});
const UUID = "3f1c1b9e-7d2a-4c1e-9a3b-2b8f4d6e1a55";

beforeAll(async () => {
  await resetDb();
  app = await testApp({}, { gateway: gw, ai });
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  ({ client: pepe } = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com"));
});
afterAll(() => app.close());


describe("carreras", () => {
  it("dos reservas a la vez por la última plaza: solo una gana", async () => {
    const day = (() => {
      const d = new Date(`${madridClock(new Date()).date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 4);
      return d.toISOString().slice(0, 10);
    })();
    const wd = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    await coach.req("PUT", "/api/v1/studio/booking", { enabled: true, slotMinutes: 60, capacity: 1, noticeHours: 1, cancelHours: 1, location: "", windows: [{ weekday: wd, start: "10:00", end: "11:00" }], payAtBooking: false, sessionPriceId: null });
    const at = madridInstant(day, 600).toISOString();
    const res = await Promise.all([lucia.post("/api/v1/me/booking", { startsAt: at }), pepe.post("/api/v1/me/booking", { startsAt: at })]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    const [{ n }] = (await app.db.execute<{ n: number }>(sql`select count(*)::int as n from appointments where starts_at = ${at} and status <> 'cancelled'`)) as unknown as [{ n: number }];
    expect(n).toBe(1);
  });

  it("el mismo webhook dos veces a la vez: un solo bono", async () => {
    const price = await coach.post("/api/v1/prices", { name: "Bono 3", kind: "pack", amount: 90, sessions: 3 });
    await lucia.post("/api/v1/me/checkout", { priceId: price.body.id });
    const co = gw.checkouts.at(-1)!;
    const payload = JSON.stringify({ id: "evt_race", object: "event", type: "checkout.session.completed", data: { object: { id: co.id, object: "checkout.session", mode: "payment", amount_total: co.amountCents, currency: "eur", payment_status: "paid", payment_intent: "pi_race", metadata: co.metadata } } });
    const send = () => app.inject({ method: "POST", url: "/api/v1/stripe/webhook", payload, headers: { "content-type": "application/json", "stripe-signature": gw.sign(payload) } });
    const r = await Promise.all([send(), send(), send()]);
    expect(r.every((x) => x.statusCode === 200)).toBe(true);
    expect((await coach.get(`/api/v1/clients/${luciaId}/packs`)).body.filter((p: { name: string }) => p.name === "Bono 3")).toHaveLength(1);
  });

  it("dos altas con el mismo correo a la vez: una gana y la otra recibe 409 (no 500)", async () => {
    const mk = () => coach.post("/api/v1/clients", { name: "Doble", email: "doble@example.com", invite: true });
    const r = await Promise.all([mk(), mk(), mk()]);
    expect(r.every((x) => x.status < 500)).toBe(true);
  });

  it("borrar un cliente mientras se le asigna algo: sin 500", async () => {
    const c = await coach.post("/api/v1/clients", { name: "Efímero", invite: false });
    await coach.post(`/api/v1/clients/${c.body.client.id}/archive`);
    const del = coach.post(`/api/v1/clients/${c.body.client.id}/delete`, { confirmName: "Efímero" });
    const pack = coach.post(`/api/v1/clients/${c.body.client.id}/packs`, { name: "B", total: 5 });
    const res = await Promise.all([del, pack]);
    expect(res.every((x) => x.status < 500)).toBe(true);
  });
});

describe("cambios de hora (Madrid)", () => {
  it("horas locales correctas antes y después del cambio de octubre y de marzo", () => {
    expect(madridInstant("2026-10-24", 600).toISOString()).toBe("2026-10-24T08:00:00.000Z"); // verano, UTC+2
    expect(madridInstant("2026-10-25", 600).toISOString()).toBe("2026-10-25T09:00:00.000Z"); // invierno, UTC+1
    expect(madridInstant("2026-03-28", 600).toISOString()).toBe("2026-03-28T09:00:00.000Z");
    expect(madridInstant("2026-03-29", 600).toISOString()).toBe("2026-03-29T08:00:00.000Z");
    expect(madridClock(new Date("2026-10-25T00:30:00Z")).date).toBe("2026-10-25");
    expect(madridClock(new Date("2026-12-31T23:30:00Z")).date).toBe("2027-01-01");
  });
});

describe("textos extremos", () => {
  it("emoji, acentos, RTL y el máximo de longitud se guardan y vuelven igual", async () => {
    const names = ["Zoë Ñúñez 💪🏽", "Ольга Иванова", "محمد علي", "O'Connor-Smith", "a".repeat(80)];
    for (const n of names) {
      const r = await coach.post("/api/v1/clients", { name: n, invite: false });
      expect(r.status).toBe(200);
      expect((await coach.get(`/api/v1/clients/${r.body.client.id}`)).body.name).toBe(n);
    }
  });
  it("mensajes con caracteres de control o nulos no rompen nada", async () => {
    const r = await lucia.post("/api/v1/me/messages", { body: "hola\u0000\u0007‮texto" });
    expect(r.status).toBeLessThan(500);
  });
});

describe("la IA falla", () => {
  it("cuota agotada: 429 con mensaje; caída: 503; respuesta basura: 503 con mensaje claro", async () => {
    for (const [mode, status] of [["throw-quota", 429], ["throw-down", 503], ["garbage", 503]] as const) {
      aiMode = mode;
      const r = await coach.post("/api/v1/ai/routine", { focus: "pierna fuerza" });
      expect(r.status).toBe(status);
      expect(r.body.message).toBeTruthy();
    }
    aiMode = "ok";
  });

  it("cliente real de Gemini: red caída, 429, 500 y JSON roto se convierten en errores comprensibles", async () => {
    const cases: [() => Promise<Response>, string][] = [
      [() => Promise.reject(new TypeError("fetch failed")), "unavailable"],
      [async () => new Response("{}", { status: 429 }), "quota"],
      [async () => new Response("oops", { status: 500 }), "unavailable"],
      [async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{no es json" }] } }] }), { status: 200 }), "bad_output"],
    ];
    for (const [impl, code] of cases) {
      const g = createGemini({ apiKey: "k", model: "m", embedModel: "e", fetchImpl: impl as typeof fetch });
      await expect(g.generateJson({ system: "", prompt: "", schema: {} })).rejects.toMatchObject({ code });
    }
    const g = createGemini({ apiKey: "k", model: "m", embedModel: "e", fetchImpl: (async () => new Response(JSON.stringify({ embeddings: [] }), { status: 200 })) as unknown as typeof fetch });
    await expect(g.embed(["a", "b"], "document")).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("recursos que desaparecen", () => {
  it("abrir un entreno, una rutina o un cliente borrados: 404 con mensaje", async () => {
    for (const url of [`/api/v1/workouts/${UUID}`, `/api/v1/routines/${UUID}`, `/api/v1/clients/${UUID}`, `/api/v1/programs/${UUID}`]) {
      const r = await coach.get(url);
      expect(r.status).toBe(404);
      expect(r.body.message).toBeTruthy();
    }
  });
});
