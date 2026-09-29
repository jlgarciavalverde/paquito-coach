import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import type { PushPayload } from "./lib/push";
import { madridClock, runReminders } from "./lib/scheduler";
import { Agent, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let lucia: Agent;
const sent: { to: string[]; p: PushPayload }[] = [];
const push = async (to: string[], p: PushPayload) => void sent.push({ to, p });
// 5 de octubre de 2026 (lunes) en Madrid (UTC+2)
const at = (h: number) => new Date(`2026-10-05T${String(h - 2).padStart(2, "0")}:00:00Z`);

beforeAll(async () => {
  await resetDb();
  app = await testApp();
  coach = await setupCoach(app);
  const r = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com");
  lucia = r.client;
  const routine = await coach.post("/api/v1/routines", { name: "Pierna A", blocks: [] });
  await coach.post(`/api/v1/routines/${routine.body.id}/assign`, { clientIds: [r.clientId], dates: ["2026-10-05"] });
  await coach.post("/api/v1/appointments", { clientId: r.clientId, kind: "session", startsAt: "2026-10-05T07:00:00Z", endsAt: "2026-10-05T08:00:00Z" });
});
afterAll(() => app.close());

describe("recordatorios", () => {
  it("la hora de Madrid", () => expect(madridClock(at(8))).toMatchObject({ date: "2026-10-05", hour: 8 }));

  it("antes de las 8 no manda nada", async () => {
    expect(await runReminders(app.db, push, at(7))).toEqual([]);
  });

  it("a las 8: entreno a la clienta y resumen al entrenador, una sola vez", async () => {
    const s1 = await runReminders(app.db, push, at(8));
    expect(s1).toHaveLength(2);
    expect(sent.map((x) => x.p.title).sort()).toEqual(["Hoy toca entrenar", "Tu día"]);
    expect(sent.find((x) => x.p.title === "Tu día")!.p.body).toBe("Hoy tienes 1 cita y 1 entreno de tus clientes.");
    expect(await runReminders(app.db, push, at(9))).toEqual([]); // ya enviados
  });

  it("a las 20: solo si sigue sin registrar; respeta la preferencia", async () => {
    await lucia.patch("/api/v1/me/preferences", { reminders: false });
    expect(await runReminders(app.db, push, at(20))).toEqual([]);
    await lucia.patch("/api/v1/me/preferences", { reminders: true });
    const s = await runReminders(app.db, push, at(21));
    expect(s).toHaveLength(1);
    expect(sent.at(-1)!.p.title).toBe("¿Has entrenado hoy?");
  });
});
