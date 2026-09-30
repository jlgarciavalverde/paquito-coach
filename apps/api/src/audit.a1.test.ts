import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { App } from "./app";
import type { PushPayload } from "./lib/push";
import { createFakeGateway } from "./lib/stripe";
import { madridClock, releaseHolds } from "./lib/scheduler";
import { madridInstant } from "./lib/tz";
import { resetThrottle } from "./lib/throttle";
import { zipUncompressedSize, MAX_DOCX_UNCOMPRESSED } from "./lib/ai/extract";
import { resetDemo } from "./demo/seed";
import { Agent, ORIGIN, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

/** Un test por hallazgo de la auditoría (A1: seguridad y dinero). Cada uno fallaba con el código anterior. */
let app: App;
let coach: Agent;
let lucia: Agent;
let luciaId: string;
let pepe: Agent;
let pepeId: string;
const gw = createFakeGateway("whsec_a1");
const pushes: { to: string[]; p: PushPayload }[] = [];

async function webhook(event: Record<string, unknown>) {
  const payload = JSON.stringify({ object: "event", id: `evt_${Math.random()}`, ...event });
  return app.inject({ method: "POST", url: "/api/v1/stripe/webhook", payload, headers: { "content-type": "application/json", "stripe-signature": gw.sign(payload) } });
}
const paid = (co: { id: string; amountCents: number; metadata: Record<string, string> }, type = "checkout.session.completed") =>
  webhook({ type, data: { object: { id: co.id, object: "checkout.session", mode: "payment", amount_total: co.amountCents, currency: "eur", payment_status: "paid", payment_intent: `pi_${co.id}`, metadata: co.metadata } } });
const add = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const today = () => madridClock(new Date()).date;
const wd = (d: string) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

beforeAll(async () => {
  await resetDb();
  resetThrottle();
  app = await testApp({}, { gateway: gw, push: async (to, p) => void pushes.push({ to, p }) });
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  ({ client: pepe, clientId: pepeId } = await inviteAndRegister(app, coach, "Pepe", "pepe@example.com"));
});
afterAll(() => app.close());

describe("cobros", () => {
  it("dos eventos de pago del mismo cobro (completed + async_succeeded) crean UN bono", async () => {
    const price = await coach.post("/api/v1/prices", { name: "Bono 4", kind: "pack", amount: 100, sessions: 4 });
    await lucia.post("/api/v1/me/checkout", { priceId: price.body.id });
    const co = gw.checkouts.at(-1)!;
    await Promise.all([paid(co), paid(co, "checkout.session.async_payment_succeeded")]);
    expect((await coach.get(`/api/v1/clients/${luciaId}/packs`)).body.filter((p: { name: string }) => p.name === "Bono 4")).toHaveLength(1);
  });

  it("renovar un enlace caduca el viejo en Stripe", async () => {
    const r = await coach.post(`/api/v1/clients/${luciaId}/payment-links`, { description: "Valoración", amount: 40 });
    const old = gw.checkouts.at(-1)!.id;
    await coach.post(`/api/v1/payments/${r.body.id}/renew`);
    expect(gw.expired).toContain(old);
  });

  it("factura «pagada» y «fallida» de la misma cuota: una sola fila y se queda pagada", async () => {
    const price = await coach.post("/api/v1/prices", { name: "Online", kind: "subscription", amount: 60 });
    await pepe.post("/api/v1/me/subscribe", { priceId: price.body.id });
    const co = gw.checkouts.at(-1)!;
    await webhook({ type: "checkout.session.completed", data: { object: { id: co.id, object: "checkout.session", mode: "subscription", subscription: "sub_a1", metadata: co.metadata } } });
    const inv = (type: string) => webhook({ type, data: { object: { id: "in_a1", object: "invoice", amount_paid: 6000, subscription: "sub_a1" } } });
    await Promise.all([inv("invoice.paid"), inv("invoice.payment_failed")]);
    await inv("invoice.payment_failed");
    const rows = (await coach.get(`/api/v1/clients/${pepeId}/payments`)).body.filter((p: { kind: string }) => p.kind === "subscription");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("paid");
  });

  it("dos altas de cuota a la vez: solo una", async () => {
    const price = await coach.post("/api/v1/prices", { name: "Online 2", kind: "subscription", amount: 50 });
    const [a, b] = await Promise.all([lucia.post("/api/v1/me/subscribe", { priceId: price.body.id }), lucia.post("/api/v1/me/subscribe", { priceId: price.body.id })]);
    // Las dos pueden crear su página de pago (aún no hay cuota activa), pero al activarse solo puede quedar una viva.
    expect([a.status, b.status].every((s) => s === 200 || s === 409)).toBe(true);
    const cos = gw.checkouts.filter((c) => c.metadata.subscriptionRowId).slice(-2);
    for (const [i, co] of cos.entries())
      await webhook({ type: "checkout.session.completed", data: { object: { id: co.id, object: "checkout.session", mode: "subscription", subscription: `sub_dbl_${i}`, metadata: co.metadata } } });
    const live = (await lucia.get("/api/v1/me/subscriptions")).body.filter((s: { status: string }) => s.status === "active");
    expect(live.length).toBeLessThanOrEqual(1);
  });

  it("borrar un cliente lo borra en Stripe (cancela sus cuotas) y conserva sus cobros anonimizados", async () => {
    const { client: ana, clientId: anaId } = await inviteAndRegister(app, coach, "Ana Borrable", "ana@example.com");
    const l = await coach.post(`/api/v1/clients/${anaId}/payment-links`, { description: "Sesión", amount: 30 });
    const co = gw.checkouts.at(-1)!;
    await paid(co);
    void ana;
    await coach.post(`/api/v1/clients/${anaId}/archive`);
    expect((await coach.post(`/api/v1/clients/${anaId}/delete`, { confirmName: "Ana Borrable" })).status).toBe(200);
    expect(gw.deletedCustomers.length).toBeGreaterThanOrEqual(1);
    const all = (await coach.get("/api/v1/payments")).body;
    const kept = all.find((p: { id: string }) => p.id === l.body.id);
    expect(kept).toMatchObject({ clientId: null, clientName: "Ana Borrable", status: "paid" });
    const csv = (await app.inject({ method: "GET", url: "/api/v1/payments.csv", headers: { cookie: coach.cookie } })).body;
    expect(csv).toContain("Ana Borrable");
  });

  it("el CSV del gestor trae todos los cobros (antes se cortaba en 500)", async () => {
    await app.db.execute(sql`
      insert into payments (studio_id, client_id, client_name, kind, description, amount_cents, status, paid_at)
      select s.id, null, 'Histórico', 'link', 'Sesión ' || g, 1000, 'paid', now() from studios s, generate_series(1, 600) g`);
    const csv = (await app.inject({ method: "GET", url: "/api/v1/payments.csv", headers: { cookie: coach.cookie } })).body;
    expect(csv.split("\n").filter((l) => l.includes("Histórico")).length).toBe(600);
  });
});

describe("reservas", () => {
  const day = () => add(today(), 4);
  beforeAll(async () => {
    const session = await coach.post("/api/v1/prices", { name: "Sesión", kind: "session", amount: 35 });
    await coach.req("PUT", "/api/v1/studio/booking", {
      enabled: true, slotMinutes: 30, capacity: 20, noticeHours: 1, cancelHours: 1, location: "",
      windows: [{ weekday: wd(day()), start: "08:00", end: "20:00" }], payAtBooking: true, sessionPriceId: session.body.id, maxFutureBookings: 3,
    });
  });

  it("cancelar una reserva pendiente de pago caduca su enlace; si aun así se paga, no se reactiva y se avisa", async () => {
    const at = madridInstant(day(), 9 * 60).toISOString();
    const b = await pepe.post("/api/v1/me/booking", { startsAt: at });
    expect(b.body.checkoutUrl).toBeTruthy();
    const co = gw.checkouts.at(-1)!;
    expect((await pepe.post(`/api/v1/me/appointments/${b.body.id}/cancel`)).status).toBe(200);
    expect(gw.expired).toContain(co.id);
    await paid(co);
    const [a] = await app.db.execute<{ status: string }>(sql`select status from appointments where id = ${b.body.id}`);
    expect(a!.status).toBe("cancelled");
    expect(pushes.at(-1)!.p.title).toBe("Pago de una reserva que ya no existe");
  });

  it("liberar retenciones caducadas también caduca sus enlaces de pago", async () => {
    const b = await pepe.post("/api/v1/me/booking", { startsAt: madridInstant(day(), 10 * 60).toISOString() });
    const co = gw.checkouts.at(-1)!;
    await app.db.execute(sql`update appointments set hold_expires_at = now() - interval '1 minute' where id = ${b.body.id}`);
    await releaseHolds(app.db, app.billing.expireForAppointments);
    expect(gw.expired).toContain(co.id);
  });

  it("tope de reservas futuras por cliente", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await lucia.post("/api/v1/me/booking", { startsAt: madridInstant(day(), (12 + i) * 60).toISOString() })).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(3);
    expect(codes.at(-1)).toBe(409);
  });

  it("20 reservas a la vez con 10 conexiones: sin bloqueo de la API", async () => {
    await coach.req("PUT", "/api/v1/studio/booking", {
      enabled: true, slotMinutes: 30, capacity: 50, noticeHours: 1, cancelHours: 1, location: "",
      windows: [{ weekday: wd(day()), start: "08:00", end: "20:00" }], payAtBooking: false, sessionPriceId: null, maxFutureBookings: 20,
    });
    const agents: Agent[] = [];
    for (let i = 0; i < 20; i++) agents.push((await inviteAndRegister(app, coach, `Cliente ${i}`, `c${i}@example.com`)).client);
    const at = madridInstant(day(), 18 * 60).toISOString();
    const started = Date.now();
    // Cada cliente desde su IP (el límite por IP de reservas es otra protección, probada aparte)
    const res = await Promise.all(
      agents.map((a, i) => app.inject({ method: "POST", url: "/api/v1/me/booking", payload: { startsAt: at }, headers: { origin: ORIGIN, cookie: a.cookie }, remoteAddress: `10.0.0.${i + 1}` })),
    );
    expect(res.map((r) => (r.statusCode === 200 ? 200 : `${r.statusCode} ${r.body}`))).toEqual(res.map(() => 200));
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 30_000);
});

describe("acceso", () => {
  it("un cliente archivado no puede volver a entrar ni usar su sesión", async () => {
    const { client, clientId } = await inviteAndRegister(app, coach, "Archivada", "arch@example.com");
    await coach.post(`/api/v1/clients/${clientId}/archive`);
    expect((await client.get("/api/v1/me")).status).toBe(401);
    const r = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "arch@example.com", password: PASSWORD }, headers: { origin: ORIGIN } });
    expect(r.statusCode).toBe(403);
    expect(r.json().message).toMatch(/dado de baja/);
  });

  it("registro: con un código inventado no se sabe si el correo tiene cuenta", async () => {
    const r = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { joinCode: "NOEXISTE", name: "X", email: "lucia@example.com", password: "una-contraseña-larga-9", healthDataConsent: true }, headers: { origin: ORIGIN } });
    expect(r.statusCode).not.toBe(409);
    expect(r.json().error).not.toBe("email_taken");
  });

  it("un atacante desde su IP no bloquea la cuenta de otra persona", async () => {
    resetThrottle();
    const attempt = (remoteAddress: string, password: string) =>
      app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "pepe@example.com", password }, headers: { origin: ORIGIN }, remoteAddress });
    for (let i = 0; i < 6; i++) await attempt("198.51.100.7", `mala-${i}-xxxxxxxx`);
    expect((await attempt("198.51.100.7", PASSWORD)).statusCode).toBe(429);
    expect((await attempt("203.0.113.20", PASSWORD)).statusCode).toBe(200);
    resetThrottle();
  });

  it("avisos push: solo a servicios conocidos y sin quitarle el endpoint a otro usuario", async () => {
    const bad = ["https://127.0.0.1/x", "http://fcm.googleapis.com/x", "https://evil.example/push", "https://fcm.googleapis.com:8443/x"];
    for (const endpoint of bad) expect((await lucia.post("/api/v1/push/subscriptions", { endpoint, keys: { p256dh: "a", auth: "b" } })).status).toBe(400);
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    expect((await lucia.post("/api/v1/push/subscriptions", { endpoint, keys: { p256dh: "a", auth: "b" } })).status).toBe(200);
    await pepe.post("/api/v1/push/subscriptions", { endpoint, keys: { p256dh: "c", auth: "d" } });
    const [row] = await app.db.execute<{ user_id: string }>(sql`select user_id from push_subscriptions where endpoint = ${endpoint}`);
    const [lu] = await app.db.execute<{ id: string }>(sql`select id from users where email = 'lucia@example.com'`);
    expect(row!.user_id).toBe(lu!.id);
  });

  it("un cliente no puede registrar como suya una foto que le mandó su entrenador", async () => {
    const boundary = "----x";
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex");
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="f.png"\r\nContent-Type: image/png\r\n\r\n`), png, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const up = await app.inject({ method: "POST", url: `/api/v1/media?clientId=${luciaId}`, payload, headers: { origin: ORIGIN, cookie: coach.cookie, "content-type": `multipart/form-data; boundary=${boundary}` } });
    const r = await lucia.post("/api/v1/me/photos", { mediaId: up.json().id, date: today(), pose: "front" });
    expect(r.status).toBe(400);
  });
});

describe("entrenos y topes", () => {
  it("no se cambian series de un entreno terminado ni se completan entrenos de dentro de meses", async () => {
    const r = await coach.post("/api/v1/routines", { name: "R", blocks: [] });
    const far = add(today(), 60);
    await coach.post(`/api/v1/routines/${r.body.id}/assign`, { clientIds: [luciaId], dates: [today(), far] });
    const ws = (await lucia.get(`/api/v1/me/workouts?from=${today()}&to=${today()}`)).body;
    const w = ws[0];
    await lucia.post(`/api/v1/workouts/${w.id}/complete`, { sessionRpe: 7, comment: null });
    expect((await lucia.req("PUT", `/api/v1/workouts/${w.id}/log`, {})).status).toBe(409);
    const farW = (await lucia.get(`/api/v1/me/workouts?from=${far}&to=${far}`)).body[0];
    expect((await lucia.post(`/api/v1/workouts/${farW.id}/complete`, { sessionRpe: 7, comment: null })).status).toBe(409);
  });

  it("rangos de más de tres meses y asignaciones gigantes: 400", async () => {
    expect((await coach.get(`/api/v1/workouts?from=2026-01-01&to=2026-12-31`)).status).toBe(400);
    expect((await coach.get(`/api/v1/workouts?from=2026-10-10&to=2026-10-01`)).status).toBe(400);
    const r = await coach.post("/api/v1/routines", { name: "R2", blocks: [] });
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push((await coach.post("/api/v1/clients", { name: `Masa ${i}`, invite: false })).body.client.id);
    const dates = Array.from({ length: 120 }, (_, i) => add("2026-11-01", i));
    expect((await coach.post(`/api/v1/routines/${r.body.id}/assign`, { clientIds: ids, dates })).status).toBe(400);
  });

  it("cuota de almacenamiento del estudio: al llenarse, 413 con mensaje", async () => {
    await app.db.execute(sql`insert into media (studio_id, client_id, mime, size) select s.id, null, 'application/pdf', 1500000000 from studios s, generate_series(1, 2)`);
    const boundary = "----x";
    const pdf = Buffer.from("%PDF-1.4\n%%EOF");
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n`), pdf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const r = await app.inject({ method: "POST", url: "/api/v1/resources/upload", payload, headers: { origin: ORIGIN, cookie: coach.cookie, "content-type": `multipart/form-data; boundary=${boundary}` } });
    expect(r.statusCode).toBe(413);
    await app.db.execute(sql`delete from media where size = 1500000000`);
  });

  it("un .docx «bomba» se reconoce sin descomprimirlo", () => {
    // ZIP mínimo: una entrada que declara 5 GB descomprimidos
    const name = Buffer.from("word/document.xml");
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt32LE(4_000_000_000, 24);
    cd.writeUInt16LE(name.length, 28);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(46 + name.length, 12);
    eocd.writeUInt32LE(0, 16);
    const zip = Buffer.concat([cd, name, eocd]);
    const z = zipUncompressedSize(zip)!;
    expect(z.total).toBeGreaterThan(MAX_DOCX_UNCOMPRESSED);
    expect(zipUncompressedSize(Buffer.from("no es un zip"))).toBeNull();
  });

  it("reiniciar la demo se niega si la base de datos tiene cuentas reales", async () => {
    await expect(resetDemo(app.db)).rejects.toThrow(/cuentas reales/);
    expect((await coach.get("/api/v1/me")).status).toBe(200);
  });
});
