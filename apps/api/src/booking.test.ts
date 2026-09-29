import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import type { PushPayload } from "./lib/push";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { madridClock } from "./lib/scheduler";
import { madridInstant } from "./lib/tz";
import { Agent, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let other: Agent;
let lucia: Agent;
let pepe: Agent;
const pushes: { to: string[]; p: PushPayload }[] = [];
const add = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const today = () => madridClock(new Date()).date;
const wd = (d: string) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
// Dentro de 3 días (fuera del margen de antelación y de cancelación)
const day = () => add(today(), 3);

beforeAll(async () => {
  await resetDb();
  app = await testApp({}, { push: async (to, p) => void pushes.push({ to, p }) });
  coach = await setupCoach(app);
  ({ client: lucia } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  ({ client: pepe } = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com"));
  const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBC3" }).returning();
  await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro12@example.com", passwordHash: await hashPassword(PASSWORD) });
  other = new Agent(app);
  await other.post("/api/v1/auth/login", { email: "otro12@example.com", password: PASSWORD });
});
afterAll(() => app.close());

describe("hora de Madrid", () => {
  it("convierte hora local a instante en verano e invierno", () => {
    expect(madridInstant("2026-07-01", 10 * 60).toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(madridInstant("2026-12-01", 10 * 60).toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });
});

describe("reservas", () => {
  it("desactivadas: no hay huecos ni se puede reservar", async () => {
    const r = await lucia.get(`/api/v1/me/booking?from=${day()}&days=1`);
    expect(r.body).toMatchObject({ enabled: false, slots: [] });
    expect((await lucia.post("/api/v1/me/booking", { startsAt: madridInstant(day(), 600).toISOString() })).status).toBe(409);
  });

  it("franjas, plazas y bloqueos", async () => {
    const s = { enabled: true, slotMinutes: 60, capacity: 1, noticeHours: 12, cancelHours: 24, location: "Estudio", windows: [{ weekday: wd(day()), start: "09:00", end: "12:00" }] };
    expect((await coach.req("PUT", "/api/v1/studio/booking", s)).status).toBe(200);
    expect((await lucia.req("PUT", "/api/v1/studio/booking", s)).status).toBe(403);
    let slots = (await lucia.get(`/api/v1/me/booking?from=${day()}&days=1`)).body.slots;
    expect(slots.map((x: { startsAt: string }) => x.startsAt)).toEqual([540, 600, 660].map((m) => madridInstant(day(), m).toISOString()));
    // Una cita sin cliente (bloqueo) de 10:30 a 11:30 quita las 10 y las 11
    await coach.post("/api/v1/appointments", { clientId: null, kind: "other", title: "Médico", startsAt: madridInstant(day(), 630).toISOString(), endsAt: madridInstant(day(), 690).toISOString() });
    slots = (await lucia.get(`/api/v1/me/booking?from=${day()}&days=1`)).body.slots;
    expect(slots).toHaveLength(1);
    // Lucía reserva las 9; Pepe ya no la ve (1 plaza) y no puede quitársela
    const r = await lucia.post("/api/v1/me/booking", { startsAt: slots[0].startsAt });
    expect(r.status).toBe(200);
    expect(r.body.location).toBe("Estudio");
    expect(pushes.at(-1)!.p.body).toContain("Lucía ha reservado");
    expect((await pepe.get(`/api/v1/me/booking?from=${day()}&days=1`)).body.slots).toHaveLength(0);
    expect((await pepe.post("/api/v1/me/booking", { startsAt: slots[0].startsAt })).body.error).toBe("slot_taken");
    // Una hora que no es un hueco tampoco
    expect((await pepe.post("/api/v1/me/booking", { startsAt: madridInstant(day(), 545).toISOString() })).status).toBe(409);
  });

  it("grupo reducido: dos plazas", async () => {
    const s = (await coach.get("/api/v1/studio/booking")).body;
    await coach.req("PUT", "/api/v1/studio/booking", { ...s, capacity: 2 });
    const slots = (await pepe.get(`/api/v1/me/booking?from=${day()}&days=1`)).body.slots;
    expect(slots[0]).toMatchObject({ startsAt: madridInstant(day(), 540).toISOString(), free: 1 });
    expect((await pepe.post("/api/v1/me/booking", { startsAt: slots[0].startsAt })).status).toBe(200);
    // Lucía no ve el hueco que ya tiene
    expect((await lucia.get(`/api/v1/me/booking?from=${day()}&days=1`)).body.slots).toHaveLength(0);
  });

  it("cancelar: con antelación sí; tarde, no; y la plaza vuelve", async () => {
    const mine = (await lucia.get(`/api/v1/me/appointments?from=${madridInstant(day(), 0).toISOString()}&to=${madridInstant(add(day(), 1), 0).toISOString()}`)).body;
    expect((await pepe.post(`/api/v1/me/appointments/${mine[0].id}/cancel`)).status).toBe(404);
    expect((await lucia.post(`/api/v1/me/appointments/${mine[0].id}/cancel`)).status).toBe(200);
    expect((await lucia.get(`/api/v1/me/booking?from=${day()}&days=1`)).body.slots).toHaveLength(1);
    const s = (await coach.get("/api/v1/studio/booking")).body;
    // Pasado mañana a las 9 está siempre a menos de 72 h
    const soon = add(today(), 2);
    await coach.req("PUT", "/api/v1/studio/booking", { ...s, cancelHours: 72, windows: [...s.windows, { weekday: wd(soon), start: "09:00", end: "10:00" }] });
    const again = await lucia.post("/api/v1/me/booking", { startsAt: madridInstant(soon, 540).toISOString() });
    expect(again.status).toBe(200);
    expect((await lucia.post(`/api/v1/me/appointments/${again.body.id}/cancel`)).body.error).toBe("too_late");
  });

  it("aislamiento", async () => {
    expect((await other.get("/api/v1/studio/booking")).body.enabled).toBe(false);
  });
});
