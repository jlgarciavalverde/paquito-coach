import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { App } from "./app";
import { clientProfiles, studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { createFakeGateway } from "./lib/stripe";
import { Agent, PASSWORD, connectStripe, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
let other: Agent;
const gw = createFakeGateway("whsec_connect");
async function webhook(event: Record<string, unknown>) {
  const payload = JSON.stringify({ object: "event", id: `evt_${Math.random()}`, ...event });
  return (await app.inject({ method: "POST", url: "/api/v1/stripe/webhook", payload, headers: { "content-type": "application/json", "stripe-signature": gw.sign(payload) } })).statusCode;
}
const paidEvent = (co: { id: string; amountCents: number; metadata: Record<string, string> }, account: string | undefined) => ({
  account,
  type: "checkout.session.completed",
  data: { object: { id: co.id, object: "checkout.session", mode: "payment", amount_total: co.amountCents, currency: "eur", payment_status: "paid", payment_intent: `pi_${co.id}`, metadata: co.metadata } },
});

beforeAll(async () => {
  await resetDb();
  app = await testApp({}, { gateway: gw });
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBCN1" }).returning();
  await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro-cn@example.com", passwordHash: await hashPassword(PASSWORD) });
  other = new Agent(app);
  await other.post("/api/v1/auth/login", { email: "otro-cn@example.com", password: PASSWORD });
});
afterAll(() => app.close());

describe("Stripe Connect: cada estudio cobra en su cuenta", () => {
  let acct: string;
  let otherAcct: string;

  it("sin cuenta conectada no se cobra (pero hay Stripe en el servidor)", async () => {
    expect((await coach.get("/api/v1/payments/info")).body).toMatchObject({ enabled: false, available: true });
    expect((await coach.get("/api/v1/studio/connect")).body).toMatchObject({ available: true, connected: false, chargesEnabled: false });
    const r = await coach.post(`/api/v1/clients/${luciaId}/payment-links`, { description: "Sesión", amount: 30 });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("payments_not_connected");
    await coach.post("/api/v1/prices", { name: "Sesión", kind: "session", amount: 30 });
    expect((await lucia.get("/api/v1/me/prices")).body).toHaveLength(0);
    expect((await coach.post("/api/v1/studio/connect/dashboard")).status).toBe(409);
  });

  it("el alta crea UNA cuenta Express por estudio (dos clics no crean dos) y al volver queda activa", async () => {
    const [a, b] = await Promise.all([coach.post("/api/v1/studio/connect/onboard"), coach.post("/api/v1/studio/connect/onboard")]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const [s] = await app.db.select().from(studios).where(eq(studios.name, "Estudio Paquito"));
    acct = s!.stripeAccountId!;
    expect(acct).toMatch(/^acct_fake_/);
    expect(new URL(a.body.url).searchParams.get("simulado")).toBe(acct);
    expect(new URL(b.body.url).searchParams.get("simulado")).toBe(acct);
    expect((await coach.get("/api/v1/studio/connect")).body).toMatchObject({ connected: true, chargesEnabled: true, payoutsEnabled: true });
    expect((await coach.get("/api/v1/payments/info")).body.enabled).toBe(true);
    expect((await lucia.get("/api/v1/payments/info")).body.enabled).toBe(true);
    expect((await coach.post("/api/v1/studio/connect/dashboard")).body.url).toContain("stripe.com");
    otherAcct = await connectStripe(other);
    expect(otherAcct).not.toBe(acct);
  });

  it("el cobro, el cliente de Stripe y la página de pago se crean en la cuenta del estudio", async () => {
    await coach.post(`/api/v1/clients/${luciaId}/payment-links`, { description: "Sesión", amount: 30 });
    const co = gw.checkouts.at(-1)!;
    expect(co.account).toBe(acct);
    const [cp] = await app.db.select().from(clientProfiles).where(eq(clientProfiles.id, luciaId));
    expect(cp!.stripeCustomerAccount).toBe(acct);
  });

  it("un evento de otra cuenta (otro estudio o la plataforma) no puede dar por pagado el cobro", async () => {
    await coach.post(`/api/v1/clients/${luciaId}/payment-links`, { description: "Bono", amount: 90 });
    const co = gw.checkouts.at(-1)!;
    const status = async () => (await coach.get(`/api/v1/clients/${luciaId}/payments`)).body.find((p: { amount: number }) => p.amount === 90).status;
    expect(await webhook(paidEvent(co, otherAcct))).toBe(200);
    expect(await status()).toBe("pending");
    expect(await webhook(paidEvent(co, undefined))).toBe(200);
    expect(await status()).toBe("pending");
    expect(await webhook(paidEvent(co, acct))).toBe(200);
    expect(await status()).toBe("paid");
  });

  it("si Stripe deshabilita la cuenta (account.updated), el estudio deja de cobrar", async () => {
    await webhook({ account: acct, type: "account.updated", data: { object: { id: acct, object: "account", charges_enabled: false, payouts_enabled: false, details_submitted: true } } });
    gw.accounts.set(acct, { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: true });
    expect((await coach.get("/api/v1/payments/info")).body.enabled).toBe(false);
    expect((await coach.post(`/api/v1/clients/${luciaId}/payment-links`, { description: "x", amount: 10 })).status).toBe(409);
    // Vuelve a completar el alta.
    await coach.post("/api/v1/studio/connect/onboard");
    expect((await coach.get("/api/v1/studio/connect")).body.chargesEnabled).toBe(true);
  });

  it("si el estudio cambia de cuenta, el cliente de Stripe se crea de nuevo en la nueva", async () => {
    const [s] = await app.db.select().from(studios).where(eq(studios.stripeAccountId, acct));
    const newAcct = await gw.createAccount({ email: "x", businessName: "x", metadata: {} });
    gw.accounts.set(newAcct, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
    await app.db.update(studios).set({ stripeAccountId: newAcct }).where(eq(studios.id, s!.id));
    await coach.post(`/api/v1/clients/${luciaId}/payment-links`, { description: "Otra", amount: 20 });
    expect(gw.checkouts.at(-1)!.account).toBe(newAcct);
    const [cp] = await app.db.select().from(clientProfiles).where(eq(clientProfiles.id, luciaId));
    expect(cp!.stripeCustomerAccount).toBe(newAcct);
  });

  it("solo el entrenador gestiona la cuenta", async () => {
    expect((await lucia.post("/api/v1/studio/connect/onboard")).status).toBe(403);
    expect((await new Agent(app).get("/api/v1/studio/connect")).status).toBe(401);
  });
});
