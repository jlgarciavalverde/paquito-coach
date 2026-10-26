import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { studioAccess } from "@coach/shared";
import type { App } from "./app";
import { studios } from "./db/schema";
import { createFakeGateway } from "./lib/stripe";
import { Agent, PASSWORD, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
const gw = createFakeGateway("whsec_test_platform");
async function webhook(event: Record<string, unknown>) {
  const payload = JSON.stringify({ object: "event", ...event });
  const r = await app.inject({ method: "POST", url: "/api/v1/stripe/webhook", payload, headers: { "content-type": "application/json", "stripe-signature": gw.sign(payload) } });
  return r.statusCode;
}
const signup = (a: Agent, over: Record<string, unknown> = {}) =>
  a.post("/api/v1/auth/signup", { studioName: "Fuerza Ana", slug: "fuerza-ana", name: "Ana", email: "ana@example.com", password: PASSWORD, acceptTerms: true, ...over });

beforeAll(async () => {
  await resetDb();
  app = await testApp({}, { gateway: gw });
});
afterAll(() => app.close());

describe("plataforma: alta de estudios", () => {
  let ana: Agent;
  it("la primera instalación queda como fundadora y con dirección propia", async () => {
    const paquito = await setupCoach(app);
    const me = await paquito.get("/api/v1/me");
    expect(me.body.studio).toMatchObject({ slug: "estudio-paquito", access: "ok" });
    expect(me.body.platformAdmin).toBe(false);
    const b = await paquito.get("/api/v1/studio/billing");
    expect(b.body).toMatchObject({ plan: "fundador", status: "comp", maxClients: null });
  });

  it("dirección: reservadas, mal escritas y ocupadas no valen", async () => {
    const a = new Agent(app);
    expect((await a.get("/api/v1/auth/slug/admin")).body).toMatchObject({ available: false });
    expect((await a.get("/api/v1/auth/slug/Mal%20Escrita")).body).toMatchObject({ available: false });
    expect((await a.get("/api/v1/auth/slug/estudio-paquito")).body).toMatchObject({ available: false, reason: "Esa dirección ya la usa otro estudio" });
    expect((await a.get("/api/v1/auth/slug/fuerza-ana")).body).toMatchObject({ available: true, reason: null });
  });

  it("un entrenador se da de alta solo: prueba de 14 días con sesión iniciada", async () => {
    ana = new Agent(app);
    const r = await signup(ana);
    expect(r.status).toBe(200);
    expect(r.body.studio).toMatchObject({ name: "Fuerza Ana", slug: "fuerza-ana", access: "ok" });
    const b = await ana.get("/api/v1/studio/billing");
    expect(b.body).toMatchObject({ plan: "prueba", status: "trial", maxClients: 5, activeClients: 0, canPay: true });
    const days = (new Date(b.body.trialEndsAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
  });

  it("no repite correo ni dirección; el campo trampa y el alta cerrada se rechazan", async () => {
    expect((await signup(new Agent(app))).status).toBe(409);
    expect((await signup(new Agent(app), { email: "otra@example.com" })).status).toBe(409);
    expect((await signup(new Agent(app), { slug: "otra-ana", email: "robot@example.com", website: "http://spam" })).status).toBe(400);
    const closed = await testApp({ signupOpen: false });
    try {
      const r = await new Agent(closed).post("/api/v1/auth/signup", { studioName: "X", slug: "cerrado", name: "X", email: "x@example.com", password: PASSWORD, acceptTerms: true });
      expect(r.status).toBe(403);
    } finally {
      await closed.close();
    }
  });

  it("la página pública y el aviso legal se piden por dirección; sin dirección es la plataforma", async () => {
    const a = new Agent(app);
    expect((await a.get("/api/v1/public/studio?estudio=fuerza-ana")).status).toBe(404); // sin publicar
    await ana.req("PUT", "/api/v1/studio/profile", { name: "Fuerza Ana", published: true, tagline: "Fuerza para todas", bio: "Soy Ana." });
    const p = await a.get("/api/v1/public/studio?estudio=fuerza-ana");
    expect(p.body).toMatchObject({ name: "Fuerza Ana", slug: "fuerza-ana", coachName: "Ana" });
    expect((await a.get("/api/v1/public/legal?estudio=fuerza-ana")).body).toMatchObject({ studioName: "Fuerza Ana", legalName: "Ana" });
    expect((await a.get("/api/v1/public/legal")).body).toMatchObject({ studioName: "Plataforma", legalName: "Titular de la plataforma" });
    expect((await a.get("/api/v1/public/legal?estudio=no-existe")).status).toBe(404);
    const st = await a.get("/api/v1/auth/setup-status?estudio=fuerza-ana");
    expect(st.body).toMatchObject({ studioName: "Fuerza Ana", slug: "fuerza-ana", published: true, platformName: "Plataforma", signupOpen: true, needsSetup: false });
    expect((await a.get("/api/v1/auth/setup-status")).body).toMatchObject({ studioName: null, slug: null });
  });

  it("dominio propio del estudio (HOST_STUDIOS)", async () => {
    const own = await testApp({ hostStudios: { "ana.example.com": "fuerza-ana", "solo.example.com": "@first" } });
    try {
      const at = (host: string, url: string) => own.inject({ method: "GET", url, headers: { host } }).then((r) => r.json());
      expect(await at("ana.example.com", "/api/v1/public/studio")).toMatchObject({ slug: "fuerza-ana" });
      expect(await at("solo.example.com", "/api/v1/auth/setup-status")).toMatchObject({ slug: "estudio-paquito" });
      expect(await at("otro.example.com", "/api/v1/auth/setup-status")).toMatchObject({ slug: null });
    } finally {
      await own.close();
    }
  });

  it("el plan limita los clientes a la vez (los archivados y los pendientes no cuentan)", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await ana.post("/api/v1/clients", { name: `Cliente ${i}`, invite: false });
      expect(r.status).toBe(200);
      ids.push(r.body.client.id);
    }
    const sixth = await ana.post("/api/v1/clients", { name: "Sexto", invite: false });
    expect(sixth.status).toBe(402);
    expect(sixth.body.error).toBe("plan_limit");
    await ana.post(`/api/v1/clients/${ids[0]}/archive`);
    expect((await ana.post("/api/v1/clients", { name: "Sexto", invite: false })).status).toBe(200);
    expect((await ana.post(`/api/v1/clients/${ids[0]}/unarchive`)).status).toBe(402);
  });

  it("dos altas a la vez no pasan las dos del límite", async () => {
    const [s] = await app.db.select().from(studios).where(eq(studios.slug, "fuerza-ana"));
    await app.db.update(studios).set({ plan: "basico" }).where(eq(studios.id, s!.id)); // 15 plazas, 5 ocupadas
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => ana.post("/api/v1/clients", { name: `Prisa ${i}`, invite: false })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(10);
    expect(rs.filter((r) => r.status === 402)).toHaveLength(2);
    await app.db.update(studios).set({ plan: "prueba" }).where(eq(studios.id, s!.id));
  });

  it("acabada la prueba: se consulta, no se cambia nada salvo cuenta y plan", async () => {
    const [s] = await app.db.select().from(studios).where(eq(studios.slug, "fuerza-ana"));
    await app.db.update(studios).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(studios.id, s!.id));
    expect((await ana.get("/api/v1/me")).body.studio.access).toBe("locked");
    expect((await ana.get("/api/v1/clients")).status).toBe(200);
    const blocked = await ana.post("/api/v1/clients", { name: "Bloqueado", invite: false });
    expect(blocked.status).toBe(402);
    expect(blocked.body.error).toBe("studio_locked");
    expect((await ana.patch("/api/v1/me/preferences", { reminders: false })).status).toBe(200);
    expect((await ana.get("/api/v1/studio/billing")).body.access).toBe("locked");
  });

  it("pagar el plan (webhook de Stripe) desbloquea; un impago da 7 días de gracia; la baja bloquea al acabar el periodo", async () => {
    const r = await ana.post("/api/v1/studio/billing/checkout", { plan: "estudio" });
    expect(r.status).toBe(200);
    const c = gw.checkouts.at(-1)!;
    expect(c.metadata).toMatchObject({ scope: "platform", plan: "estudio" });
    expect(c.amountCents).toBe(7900);
    // Un importe que no es el del plan no activa nada.
    expect(await webhook({ id: "evt_p0", type: "checkout.session.completed", data: { object: { id: c.id, mode: "subscription", amount_total: 100, subscription: "sub_x", customer: "cus_x", metadata: c.metadata } } })).toBe(200);
    expect((await ana.get("/api/v1/me")).body.studio.access).toBe("locked");
    expect(await webhook({ id: "evt_p1", type: "checkout.session.completed", data: { object: { id: c.id, mode: "subscription", amount_total: 7900, subscription: "sub_ana", customer: "cus_ana", metadata: c.metadata } } })).toBe(200);
    expect((await ana.get("/api/v1/studio/billing")).body).toMatchObject({ plan: "estudio", status: "active", access: "ok", maxClients: null, hasPortal: true });
    expect((await ana.post("/api/v1/clients", { name: "Ya puedo", invite: false })).status).toBe(200);
    expect((await ana.post("/api/v1/studio/billing/checkout", { plan: "pro" })).status).toBe(409);
    expect((await ana.post("/api/v1/studio/billing/portal")).body.url).toContain("stripe.com");

    const now = Math.floor(Date.now() / 1000);
    await webhook({ id: "evt_p2", type: "invoice.payment_failed", data: { object: { id: "in_1", subscription: "sub_ana" } } });
    await webhook({ id: "evt_p3", type: "customer.subscription.updated", data: { object: { id: "sub_ana", status: "past_due", current_period_end: now - 3 * 86400, items: { data: [{ price: { unit_amount: 7900 } }] } } } });
    expect((await ana.get("/api/v1/studio/billing")).body).toMatchObject({ status: "past_due", access: "ok" });
    await webhook({ id: "evt_p4", type: "customer.subscription.updated", data: { object: { id: "sub_ana", status: "past_due", current_period_end: now - 8 * 86400, items: { data: [{ price: { unit_amount: 7900 } }] } } } });
    expect((await ana.get("/api/v1/studio/billing")).body.access).toBe("locked");
    // Cambio de plan en el portal (el importe dice cuál) y cobro al día.
    await webhook({ id: "evt_p5", type: "customer.subscription.updated", data: { object: { id: "sub_ana", status: "active", current_period_end: now + 30 * 86400, items: { data: [{ price: { unit_amount: 3900 } }] } } } });
    expect((await ana.get("/api/v1/studio/billing")).body).toMatchObject({ plan: "pro", status: "active", access: "ok" });
    await webhook({ id: "evt_p6", type: "customer.subscription.deleted", data: { object: { id: "sub_ana", status: "canceled", current_period_end: now + 10 * 86400 } } });
    expect((await ana.get("/api/v1/studio/billing")).body).toMatchObject({ status: "canceled", access: "ok" });
    expect(studioAccess({ billingStatus: "canceled", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() - 1000), suspendedAt: null })).toBe("locked");
  });

  it("los eventos de cobros de los estudios siguen llegando a su sitio", async () => {
    expect(await webhook({ id: "evt_s1", type: "invoice.paid", data: { object: { id: "in_2", subscription: "sub_de_un_cliente" } } })).toBe(200);
  });
});

describe("plataforma: administración", () => {
  let admin: Agent;
  beforeAll(async () => {
    admin = new Agent(app);
    await signup(admin, { studioName: "Admin", slug: "administracion", name: "José Luis", email: "admin@example.com" });
  });

  it("solo los correos de PLATFORM_ADMIN_EMAILS; al resto el panel no existe", async () => {
    expect((await admin.get("/api/v1/me")).body.platformAdmin).toBe(true);
    const ana = new Agent(app);
    await ana.post("/api/v1/auth/login", { email: "ana@example.com", password: PASSWORD });
    expect((await ana.get("/api/v1/admin/studios")).status).toBe(404);
    expect((await new Agent(app).get("/api/v1/admin/studios")).status).toBe(401);
  });

  it("lista los estudios con su plan y sus clientes; resume", async () => {
    const r = await admin.get("/api/v1/admin/studios");
    expect(r.status).toBe(200);
    const ana = r.body.find((s: { slug: string }) => s.slug === "fuerza-ana");
    expect(ana).toMatchObject({ coachEmail: "ana@example.com", plan: "pro", status: "canceled" });
    expect(ana.activeClients).toBeGreaterThan(5);
    const sum = await admin.get("/api/v1/admin/summary");
    expect(sum.body.studios).toBe(3);
  });

  it("alarga la prueba, pone una cortesía y suspende (queda en la auditoría)", async () => {
    const list = (await admin.get("/api/v1/admin/studios")).body as { id: string; slug: string }[];
    const paquito = list.find((s) => s.slug === "estudio-paquito")!;
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    let r = await admin.patch(`/api/v1/admin/studios/${paquito.id}`, { trialEndsOn: tomorrow });
    expect(r.body).toMatchObject({ plan: "prueba", status: "trial", access: "ok" });
    r = await admin.patch(`/api/v1/admin/studios/${paquito.id}`, { plan: "fundador" });
    expect(r.body).toMatchObject({ plan: "fundador", status: "comp" });
    r = await admin.patch(`/api/v1/admin/studios/${paquito.id}`, { suspended: true });
    expect(r.body).toMatchObject({ suspended: true, access: "locked" });
    r = await admin.patch(`/api/v1/admin/studios/${paquito.id}`, { suspended: false });
    expect(r.body.access).toBe("ok");
  });
});
