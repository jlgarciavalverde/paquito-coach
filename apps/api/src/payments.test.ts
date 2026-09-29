import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { createFakeGateway } from "./lib/stripe";
import { Agent, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let other: Agent;
let lucia: Agent;
let luciaId: string;
let pepe: Agent;
const gw = createFakeGateway("whsec_test_unit");
async function webhook(event: Record<string, unknown>, sig?: string) {
  const payload = JSON.stringify({ object: "event", ...event });
  const r = await app.inject({ method: "POST", url: "/api/v1/stripe/webhook", payload, headers: { "content-type": "application/json", "stripe-signature": sig ?? gw.sign(payload) } });
  return { status: r.statusCode, body: r.json() };
}
const completed = (checkoutId: string, over: Record<string, unknown> = {}) => {
  const c = gw.checkouts.find((x) => x.id === checkoutId)!;
  return { id: `evt_${checkoutId}_${Math.random()}`, type: "checkout.session.completed", data: { object: { id: c.id, object: "checkout.session", amount_total: c.amountCents, currency: "eur", payment_status: "paid", payment_intent: `pi_${checkoutId}`, metadata: c.metadata, ...over } } };
};

beforeAll(async () => {
  await resetDb();
  app = await testApp({}, { gateway: gw });
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  ({ client: pepe } = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com"));
  const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBC6" }).returning();
  await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro15@example.com", passwordHash: await hashPassword(PASSWORD) });
  other = new Agent(app);
  await other.post("/api/v1/auth/login", { email: "otro15@example.com", password: PASSWORD });
});
afterAll(() => app.close());

describe("cobros con Stripe", () => {
  let bonoId: string;
  it("tarifas: el entrenador las crea; el cliente ve las activas (sin cuotas)", async () => {
    const b = await coach.post("/api/v1/prices", { name: "Bono 10 sesiones", kind: "pack", amount: 300, sessions: 10, validDays: 90 });
    expect(b.body).toMatchObject({ amount: 300, sessions: 10 });
    bonoId = b.body.id;
    await coach.post("/api/v1/prices", { name: "Sesión suelta", kind: "session", amount: 35 });
    await coach.post("/api/v1/prices", { name: "Cuota online", kind: "subscription", amount: 60 });
    await coach.post("/api/v1/prices", { name: "Oculta", kind: "session", amount: 1, active: false });
    expect((await lucia.get("/api/v1/me/prices")).body.map((p: { name: string }) => p.name).sort()).toEqual(["Bono 10 sesiones", "Sesión suelta"]);
    expect((await lucia.post("/api/v1/prices", { name: "x", kind: "session", amount: 1 })).status).toBe(403);
    expect((await coach.post("/api/v1/prices", { name: "x", kind: "pack", amount: 10 })).status).toBe(400); // sin sesiones
  });

  it("el cliente compra un bono: el importe lo pone el servidor; pagado por webhook crea el bono pagado", async () => {
    const r = await lucia.post("/api/v1/me/checkout", { priceId: bonoId, amount: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "pending", amount: 300 });
    expect(r.body.url).toBeTruthy();
    const co = gw.checkouts.at(-1)!;
    expect(co.amountCents).toBe(30000);
    expect((await webhook(completed(co.id))).status).toBe(200);
    const [p] = (await lucia.get("/api/v1/me/payments")).body;
    expect(p).toMatchObject({ status: "paid", receiptUrl: "https://pay.stripe.com/receipts/fake", url: null });
    const packs = (await coach.get(`/api/v1/clients/${luciaId}/packs`)).body;
    expect(packs[0]).toMatchObject({ name: "Bono 10 sesiones", total: 10, paid: true, remaining: 10, price: 300 });
  });

  it("firma inválida, evento repetido e importe manipulado", async () => {
    expect((await webhook({ id: "evt_x", type: "checkout.session.completed", data: { object: {} } }, "t=1,v1=nope")).status).toBe(400);
    const r = await lucia.post("/api/v1/me/checkout", { priceId: bonoId });
    const co = gw.checkouts.at(-1)!;
    const ev = completed(co.id, { amount_total: 100 });
    await webhook(ev);
    expect((await lucia.get("/api/v1/me/payments")).body.find((x: { id: string }) => x.id === r.body.id).status).toBe("failed");
    expect((await webhook(ev)).body.duplicate).toBe(true);
    expect((await coach.get(`/api/v1/clients/${luciaId}/packs`)).body).toHaveLength(1);
  });

  it("enlace de pago del entrenador (concepto libre) y reembolso", async () => {
    const r = await coach.post(`/api/v1/clients/${luciaId}/payment-links`, { description: "Valoración inicial", amount: 45 });
    expect(r.body).toMatchObject({ kind: "link", amount: 45, status: "pending" });
    const co = gw.checkouts.at(-1)!;
    await webhook(completed(co.id));
    expect((await coach.get("/api/v1/payments")).body.find((x: { id: string }) => x.id === r.body.id).status).toBe("paid");
    await webhook({ id: "evt_refund", type: "charge.refunded", data: { object: { object: "charge", payment_intent: `pi_${co.id}`, refunded: true } } });
    expect((await coach.get(`/api/v1/clients/${luciaId}/payments`)).body.find((x: { id: string }) => x.id === r.body.id).status).toBe("refunded");
    const csv = await app.inject({ method: "GET", url: "/api/v1/payments.csv", headers: { cookie: coach.cookie } });
    expect(csv.body).toContain("Valoración inicial");
    expect(csv.body).toContain("devuelto");
  });

  it("aislamiento y permisos", async () => {
    expect((await other.post(`/api/v1/clients/${luciaId}/payment-links`, { description: "x", amount: 10 })).status).toBe(404);
    expect((await other.get(`/api/v1/clients/${luciaId}/payments`)).body).toHaveLength(0);
    expect((await other.req("PUT", `/api/v1/prices/${bonoId}`, { name: "x", kind: "session", amount: 1 })).status).toBe(404);
    expect((await pepe.get("/api/v1/me/payments")).body).toHaveLength(0);
    expect((await lucia.post(`/api/v1/clients/${luciaId}/payment-links`, { description: "x", amount: 10 })).status).toBe(403);
    // Un evento con el paymentId de un pago pero otro checkout no hace nada
    const r = await lucia.post("/api/v1/me/checkout", { priceId: bonoId });
    await webhook({ id: "evt_forged", type: "checkout.session.completed", data: { object: { id: "cs_other", object: "checkout.session", amount_total: 30000, currency: "eur", payment_status: "paid", payment_intent: "pi_x", metadata: { paymentId: r.body.id } } } });
    expect((await lucia.get("/api/v1/me/payments")).body.find((x: { id: string }) => x.id === r.body.id).status).toBe("pending");
  });
});

describe("sin claves", () => {
  it("cobros desactivados", async () => {
    const off = await testApp({}, { gateway: null });
    const c = new Agent(off);
    await c.post("/api/v1/auth/login", { email: "paquito@example.com", password: PASSWORD });
    expect((await c.get("/api/v1/payments/info")).body).toEqual({ enabled: false, testMode: false });
    expect((await c.post(`/api/v1/clients/${luciaId}/payment-links`, { description: "x", amount: 10 })).status).toBe(409);
    expect((await off.inject({ method: "POST", url: "/api/v1/stripe/webhook", payload: "{}", headers: { "content-type": "application/json" } })).statusCode).toBe(404);
    await off.close();
  });
});
