import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { App } from "./app";
import { createFakeGateway } from "./lib/stripe";
import { madridClock, releaseHolds } from "./lib/scheduler";
import { madridInstant } from "./lib/tz";
import { Agent, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
let pepe: Agent;
const gw = createFakeGateway("whsec_test_billing");
async function webhook(event: Record<string, unknown>) {
  const payload = JSON.stringify({ object: "event", id: `evt_${Math.random()}`, ...event });
  const r = await app.inject({ method: "POST", url: "/api/v1/stripe/webhook", payload, headers: { "content-type": "application/json", "stripe-signature": gw.sign(payload) } });
  return r.statusCode;
}
const add = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const day = () => add(madridClock(new Date()).date, 3);
const wd = (d: string) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

beforeAll(async () => {
  await resetDb();
  app = await testApp({}, { gateway: gw });
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  ({ client: pepe } = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com"));
});
afterAll(() => app.close());

describe("cuota mensual", () => {
  it("alta, cobro mensual, impago con aviso y baja", async () => {
    const price = await coach.post("/api/v1/prices", { name: "Online", kind: "subscription", amount: 60 });
    expect((await lucia.get("/api/v1/me/prices")).body.some((p: { kind: string }) => p.kind === "subscription")).toBe(true);
    const r = await lucia.post("/api/v1/me/subscribe", { priceId: price.body.id });
    expect(r.body.url).toContain("simulado=");
    const co = gw.checkouts.at(-1)!;
    await webhook({ type: "checkout.session.completed", data: { object: { id: co.id, object: "checkout.session", mode: "subscription", subscription: "sub_1", metadata: co.metadata, payment_status: "paid" } } });
    expect((await lucia.get("/api/v1/me/subscriptions")).body[0]).toMatchObject({ name: "Online", status: "active", amount: 60 });
    expect((await lucia.post("/api/v1/me/subscribe", { priceId: price.body.id })).status).toBe(409);
    // Factura pagada (formato nuevo de la API: parent.subscription_details)
    await webhook({ type: "invoice.paid", data: { object: { id: "in_1", object: "invoice", amount_paid: 6000, hosted_invoice_url: "https://invoice.stripe.com/i/1", parent: { subscription_details: { subscription: "sub_1" } } } } });
    const pays = (await coach.get(`/api/v1/clients/${luciaId}/payments`)).body;
    expect(pays[0]).toMatchObject({ kind: "subscription", amount: 60, status: "paid", receiptUrl: "https://invoice.stripe.com/i/1" });
    // Impago: aviso en «Necesitan atención»
    await webhook({ type: "invoice.payment_failed", data: { object: { id: "in_2", object: "invoice", amount_due: 6000, subscription: "sub_1" } } });
    const att = (await coach.get("/api/v1/attention")).body.find((a: { clientName: string }) => a.clientName === "Lucía");
    expect(att.reasons[0]).toEqual({ kind: "payment", text: "Cuota sin cobrar (Online)" });
    await webhook({ type: "customer.subscription.deleted", data: { object: { id: "sub_1", object: "subscription", status: "canceled", cancel_at_period_end: false } } });
    expect((await coach.get(`/api/v1/clients/${luciaId}/subscriptions`)).body[0].status).toBe("canceled");
    expect((await lucia.post("/api/v1/me/billing-portal")).body.url).toContain("billing.stripe.com");
  });
});

describe("pagar al reservar", () => {
  it("sin bono paga al reservar; el hueco queda retenido y se confirma o se libera", async () => {
    const session = await coach.post("/api/v1/prices", { name: "Sesión suelta", kind: "session", amount: 35 });
    await coach.req("PUT", "/api/v1/studio/booking", {
      enabled: true, slotMinutes: 60, capacity: 1, noticeHours: 12, cancelHours: 24, location: "Estudio",
      windows: [{ weekday: wd(day()), start: "09:00", end: "11:00" }], payAtBooking: true, sessionPriceId: session.body.id,
    });
    const info = (await lucia.get(`/api/v1/me/booking?from=${day()}&days=1`)).body;
    expect(info.payAmount).toBe(35);
    const at9 = madridInstant(day(), 540).toISOString();
    const b = await lucia.post("/api/v1/me/booking", { startsAt: at9 });
    expect(b.body.checkoutUrl).toContain("simulado=");
    // Retenido: Pepe no ve las 9
    expect((await pepe.get(`/api/v1/me/booking?from=${day()}&days=1`)).body.slots.map((s: { startsAt: string }) => s.startsAt)).not.toContain(at9);
    const co = gw.checkouts.at(-1)!;
    await webhook({ type: "checkout.session.completed", data: { object: { id: co.id, object: "checkout.session", mode: "payment", amount_total: 3500, currency: "eur", payment_status: "paid", payment_intent: "pi_b", metadata: co.metadata } } });
    const [row] = await app.db.execute<{ payment_status: string }>(sql`select payment_status from appointments where id = ${b.body.id}`);
    expect(row!.payment_status).toBe("paid");
    // La sesión pagada (bono de 1) cubre la reserva que ya tiene: una reserva MÁS se vuelve a pagar
    expect((await lucia.get(`/api/v1/me/booking?from=${day()}&days=1`)).body.payAmount).toBe(35);

    // Pepe reserva las 10 y no paga: al caducar la retención se libera
    const at10 = madridInstant(day(), 600).toISOString();
    const p = await pepe.post("/api/v1/me/booking", { startsAt: at10 });
    expect(p.body.checkoutUrl).toBeTruthy();
    await app.db.execute(sql`update appointments set hold_expires_at = now() - interval '1 minute' where id = ${p.body.id}`);
    expect((await lucia.get(`/api/v1/me/booking?from=${day()}&days=1`)).body.slots.map((s: { startsAt: string }) => s.startsAt)).toContain(at10);
    expect(await releaseHolds(app.db)).toBe(1);
    const [st] = await app.db.execute<{ status: string }>(sql`select status from appointments where id = ${p.body.id}`);
    expect(st!.status).toBe("cancelled");
  });
});
