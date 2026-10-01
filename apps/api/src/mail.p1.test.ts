import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { App } from "./app";
import { outbox } from "./db/schema";
import { createFakeTransport, purgeOutbox } from "./lib/mail";
import { madridClock } from "./lib/scheduler";
import { madridInstant } from "./lib/tz";
import { resetThrottle } from "./lib/throttle";
import { resetChallenges } from "./lib/challenges";
import { base32Decode, hotp, totpStep } from "./lib/totp";
import { Agent, ORIGIN, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

/** P1: correo (bandeja de salida, olvido, cambio de correo, invitación, reservas) y verificación en dos pasos. */
let app: App;
let coach: Agent;
const fake = createFakeTransport();
const mailsTo = async (to: string) => {
  await app.mail.flush();
  return fake.sent.filter((m) => m.to === to);
};
let ip = 0;
/** «He olvidado la contraseña» desde una IP distinta cada vez (el límite por IP de la ruta se prueba aparte). */
const forgot = (email: string) =>
  app.inject({ method: "POST", url: "/api/v1/auth/password/forgot", payload: { email }, headers: { origin: ORIGIN }, remoteAddress: `10.9.${Math.floor(++ip / 250)}.${ip % 250}` });
const resetMails = async (to: string) => (await mailsTo(to)).filter((m) => m.subject === "Restablece tu contraseña");
const linkIn = (text: string, path: string) => text.match(new RegExp(`https?://[^\\s]+${path}\\?token=([\\w-]+)`))?.[1] ?? null;
const code = (secret: string, offset = 0) => hotp(base32Decode(secret), totpStep() + offset);

beforeAll(async () => {
  await resetDb();
  app = await testApp({}, { mail: fake.send });
  coach = await setupCoach(app);
});
afterAll(() => app.close());
beforeEach(() => {
  resetThrottle();
  resetChallenges();
});

describe("bandeja de salida", () => {
  it("un correo encolado en una transacción que se deshace no sale", async () => {
    await app.db
      .transaction(async (tx) => {
        await app.mail.enqueue(tx, { kind: "x", to: "nadie@example.com", subject: "s", html: "h", text: "t" });
        throw new Error("deshacer");
      })
      .catch(() => {});
    expect(await mailsTo("nadie@example.com")).toHaveLength(0);
  });

  it("si el proveedor falla, se reintenta más tarde y al enviarse se borra el cuerpo", async () => {
    await app.mail.enqueue(app.db, { kind: "x", to: "reintento@example.com", subject: "Hola", html: "<p>enlace secreto</p>", text: "enlace secreto" });
    fake.failNext(1);
    expect(await app.mail.flush()).toBe(0);
    const [row] = Array.from((await app.db.execute(sql`select attempts, last_error, next_attempt_at > now() as later from outbox where to_email = 'reintento@example.com'`)) as unknown as { attempts: number; last_error: string; later: boolean }[]);
    expect(row).toMatchObject({ attempts: 1, later: true });
    expect(row!.last_error).toMatch(/SMTP/);
    await app.db.execute(sql`update outbox set next_attempt_at = now() where to_email = 'reintento@example.com'`);
    expect(await mailsTo("reintento@example.com")).toHaveLength(1);
    const [sent] = Array.from((await app.db.execute(sql`select html, text, sent_at from outbox where to_email = 'reintento@example.com'`)) as unknown as { html: string | null; text: string | null; sent_at: Date }[]);
    expect(sent).toMatchObject({ html: null, text: null });
    expect(sent!.sent_at).toBeTruthy();
  });

  it("dos envíos a la vez no mandan el mismo correo dos veces", async () => {
    for (let i = 0; i < 5; i++) await app.mail.enqueue(app.db, { kind: "x", to: "doble@example.com", subject: `n${i}`, html: "h", text: "t" });
    await Promise.all([app.mail.flush(), app.mail.flush(), app.mail.flush()]);
    expect(await mailsTo("doble@example.com")).toHaveLength(5);
  });

  it("se limpian los enviados de hace más de 7 días", async () => {
    await app.db.execute(sql`update outbox set created_at = now() - interval '8 days' where to_email = 'doble@example.com'`);
    expect(await purgeOutbox(app.db)).toBe(5);
  });
});

describe("invitación por correo", () => {
  it("si la ficha tiene correo, la invitación también le llega por correo con el enlace", async () => {
    const r = await coach.post("/api/v1/clients", { name: "Marta Ruiz", email: "marta@example.com", invite: true });
    expect(r.body.invite.emailedTo).toBe("marta@example.com");
    const [m] = await mailsTo("marta@example.com");
    expect(m!.subject).toBe("Paquito te invita a su app");
    expect(m!.text).toContain(r.body.invite.url);
    expect(m!.html).toContain("Estudio Paquito");
    // Sin correo en la ficha: solo el enlace
    const sinCorreo = await coach.post("/api/v1/clients", { name: "Sin Correo", invite: true });
    expect(sinCorreo.body.invite.emailedTo).toBeNull();
  });
});

describe("he olvidado la contraseña", () => {
  let lucia: Agent;
  beforeAll(async () => {
    ({ client: lucia } = await inviteAndRegister(app, coach, "Lucía", "lucia@example.com"));
  });

  it("manda un enlace que sirve una vez y cierra las sesiones abiertas", async () => {
    const r = await forgot("LUCIA@example.com");
    expect(r.statusCode).toBe(200);
    const [m] = await resetMails("lucia@example.com");
    const token = linkIn(m!.text, "/restablecer");
    expect(token).toBeTruthy();
    const a = new Agent(app);
    expect((await a.post("/api/v1/auth/password/reset", { token, password: "otra-contraseña-larga" })).status).toBe(200);
    expect((await lucia.get("/api/v1/me")).status).toBe(401);
    expect((await new Agent(app).post("/api/v1/auth/password/reset", { token, password: "otra-mas-larga-aun" })).status).toBe(410);
  });

  it("misma respuesta exista o no la cuenta, y sin correo si no existe", async () => {
    const before = fake.sent.length;
    const r = await forgot("noexiste@example.com");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
    await app.mail.flush();
    expect(fake.sent.length).toBe(before);
  });

  it("freno: como mucho 3 correos por dirección cada 15 minutos", async () => {
    await inviteAndRegister(app, coach, "Pepe", "pepe@example.com");
    for (let i = 0; i < 6; i++) expect((await forgot("pepe@example.com")).statusCode).toBe(200);
    expect(await resetMails("pepe@example.com")).toHaveLength(3);
    // Y la ruta, por IP: a la 6.ª en un minuto, 429
    const same = () => app.inject({ method: "POST", url: "/api/v1/auth/password/forgot", payload: { email: "x@example.com" }, headers: { origin: ORIGIN }, remoteAddress: "10.8.8.8" });
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await same()).statusCode);
    expect(codes.at(-1)).toBe(429);
  });

  it("sin correo configurado, lo dice (y la web remite al entrenador)", async () => {
    const off = await testApp({}, { mail: null });
    const r = await off.inject({ method: "POST", url: "/api/v1/auth/password/forgot", payload: { email: "lucia@example.com" }, headers: { origin: ORIGIN } });
    expect(r.statusCode).toBe(503);
    expect((await off.inject({ method: "GET", url: "/api/v1/auth/setup-status" })).json().mail).toBe(false);
    await off.close();
  });
});

describe("verificación en dos pasos", () => {
  let secret = "";
  let recovery: string[] = [];

  it("se activa solo con un código bueno y da 10 códigos de recuperación; cierra las demás sesiones", async () => {
    const otherDevice = new Agent(app);
    await otherDevice.post("/api/v1/auth/login", { email: "paquito@example.com", password: PASSWORD });
    const s = await coach.post("/api/v1/me/2fa/setup");
    expect(s.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Estudio%20Paquito:paquito%40example\.com\?secret=/);
    secret = s.body.secret;
    expect((await coach.post("/api/v1/me/2fa/enable", { code: "000000" })).status).toBe(400);
    const e = await coach.post("/api/v1/me/2fa/enable", { code: code(secret) });
    expect(e.status).toBe(200);
    recovery = e.body.codes;
    expect(recovery).toHaveLength(10);
    expect((await coach.get("/api/v1/me")).body.twoFactor).toBe(true);
    expect((await otherDevice.get("/api/v1/me")).status).toBe(401);
  });

  it("la contraseña sola no da sesión: hace falta el código", async () => {
    const a = new Agent(app);
    const r = await a.post("/api/v1/auth/login", { email: "paquito@example.com", password: PASSWORD });
    expect(r.body).toEqual({ twoFactorRequired: true, challenge: expect.any(String) });
    expect(r.headers["set-cookie"]).toBeUndefined();
    expect((await a.get("/api/v1/me")).status).toBe(401);
    expect((await a.post("/api/v1/auth/login/2fa", { challenge: r.body.challenge, code: "123456" })).status).toBe(401);
    // El código del paso ya usado al activar no vale: se espera al siguiente
    const ok = await a.post("/api/v1/auth/login/2fa", { challenge: r.body.challenge, code: code(secret, 1) });
    expect(ok.status).toBe(200);
    expect((await a.get("/api/v1/me")).body.email).toBe("paquito@example.com");
  });

  it("un código ya usado no sirve otra vez y el reto muere a los 5 intentos", async () => {
    const r = await new Agent(app).post("/api/v1/auth/login", { email: "paquito@example.com", password: PASSWORD });
    expect((await new Agent(app).post("/api/v1/auth/login/2fa", { challenge: r.body.challenge, code: code(secret, 1) })).status).toBe(401);
    const r2 = await new Agent(app).post("/api/v1/auth/login", { email: "paquito@example.com", password: PASSWORD });
    for (let i = 0; i < 5; i++) await new Agent(app).post("/api/v1/auth/login/2fa", { challenge: r2.body.challenge, code: "111111" });
    expect((await new Agent(app).post("/api/v1/auth/login/2fa", { challenge: r2.body.challenge, code: recovery[0] })).status).toBe(401);
  });

  it("los códigos de recuperación sirven una sola vez", async () => {
    const r = await new Agent(app).post("/api/v1/auth/login", { email: "paquito@example.com", password: PASSWORD });
    expect((await new Agent(app).post("/api/v1/auth/login/2fa", { challenge: r.body.challenge, code: recovery[0]!.toUpperCase() })).status).toBe(200);
    const r2 = await new Agent(app).post("/api/v1/auth/login", { email: "paquito@example.com", password: PASSWORD });
    expect((await new Agent(app).post("/api/v1/auth/login/2fa", { challenge: r2.body.challenge, code: recovery[0] })).status).toBe(401);
  });

  it("restablecer la contraseña por correo no se salta el segundo paso", async () => {
    await forgot("paquito@example.com");
    const token = linkIn((await resetMails("paquito@example.com")).at(-1)!.text, "/restablecer");
    const a = new Agent(app);
    const r = await a.post("/api/v1/auth/password/reset", { token, password: "nueva-contraseña-paquito" });
    expect(r.body.twoFactorRequired).toBe(true);
    expect((await a.get("/api/v1/me")).status).toBe(401);
    // Restablecer cierra todas sus sesiones (también la de las pruebas): se completa la entrada y se sigue con ella.
    expect((await coach.get("/api/v1/me")).status).toBe(401);
    expect((await a.post("/api/v1/auth/login/2fa", { challenge: r.body.challenge, code: recovery[2] })).status).toBe(200);
    coach = a;
  });

  it("quitarla exige contraseña y código", async () => {
    const pw = "nueva-contraseña-paquito"; // la del restablecimiento de arriba
    expect((await coach.post("/api/v1/me/2fa/disable", { password: "mala-contraseña", code: recovery[1] })).status).toBe(400);
    expect((await coach.post("/api/v1/me/2fa/disable", { password: pw, code: "000000" })).status).toBe(400);
    expect((await coach.post("/api/v1/me/2fa/disable", { password: pw, code: recovery[1] })).status).toBe(200);
    expect((await coach.get("/api/v1/me")).body.twoFactor).toBe(false);
    const r = await new Agent(app).post("/api/v1/auth/login", { email: "paquito@example.com", password: pw });
    expect(r.body.email).toBe("paquito@example.com");
  });
});

describe("cambio de correo y baja", () => {
  it("el correo nuevo no vale hasta confirmarlo; luego se avisa al antiguo", async () => {
    const { client } = await inviteAndRegister(app, coach, "Ana", "ana@example.com");
    expect((await client.post("/api/v1/me/email", { email: "ana.nueva@example.com", password: "mala" })).status).toBe(400);
    expect((await client.post("/api/v1/me/email", { email: "ana.nueva@example.com", password: PASSWORD })).status).toBe(200);
    expect((await client.get("/api/v1/me")).body.email).toBe("ana@example.com");
    const token = linkIn((await mailsTo("ana.nueva@example.com"))[0]!.text, "/confirmar-correo");
    expect((await new Agent(app).post("/api/v1/auth/email/confirm", { token })).status).toBe(200);
    expect((await client.get("/api/v1/me")).body.email).toBe("ana.nueva@example.com");
    expect((await mailsTo("ana@example.com")).at(-1)!.subject).toBe("Tu correo ha cambiado");
    expect((await new Agent(app).post("/api/v1/auth/email/confirm", { token })).status).toBe(410);
    expect((await new Agent(app).post("/api/v1/auth/login", { email: "ana.nueva@example.com", password: PASSWORD })).status).toBe(200);
  });

  it("pedir un correo que ya usa otra cuenta responde igual y no manda nada", async () => {
    const { client } = await inviteAndRegister(app, coach, "Bea", "bea@example.com");
    expect((await client.post("/api/v1/me/email", { email: "ana.nueva@example.com", password: PASSWORD })).status).toBe(200);
    expect((await mailsTo("ana.nueva@example.com")).filter((m) => m.subject === "Confirma tu correo nuevo")).toHaveLength(1);
  });

  it("darse de baja desde el correo apaga los avisos por correo (no los de seguridad)", async () => {
    const t = Array.from((await app.db.execute(sql`select unsubscribe_token from users where email = 'bea@example.com'`)) as unknown as { unsubscribe_token: string }[])[0]!.unsubscribe_token;
    expect((await new Agent(app).post("/api/v1/auth/unsubscribe", { token: t })).status).toBe(200);
    const bea = new Agent(app);
    await bea.post("/api/v1/auth/login", { email: "bea@example.com", password: PASSWORD });
    expect((await bea.get("/api/v1/me")).body.emailNotifications).toBe(false);
    await forgot("bea@example.com");
    expect(await resetMails("bea@example.com")).toHaveLength(1);
  });
});

describe("reservas", () => {
  it("confirmación al cliente; al entrenador sin avisos en el móvil, también; nada a quien se dio de baja", async () => {
    const day = (() => {
      const d = new Date(`${madridClock(new Date()).date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 3);
      return d.toISOString().slice(0, 10);
    })();
    const wd = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    await coach.req("PUT", "/api/v1/studio/booking", {
      enabled: true, slotMinutes: 60, capacity: 5, noticeHours: 1, cancelHours: 1, location: "Sala 2",
      windows: [{ weekday: wd, start: "08:00", end: "20:00" }], payAtBooking: false, sessionPriceId: null, maxFutureBookings: 4,
    });
    const { client: carla } = await inviteAndRegister(app, coach, "Carla", "carla@example.com");
    const b = await carla.post("/api/v1/me/booking", { startsAt: madridInstant(day, 9 * 60).toISOString() });
    expect(b.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    const [m] = await mailsTo("carla@example.com").then((l) => l.filter((x) => x.subject === "Sesión reservada"));
    expect(m!.text).toMatch(/a las 9:00 en Sala 2/);
    expect(m!.html).toContain("/baja?token=");
    expect((await mailsTo("paquito@example.com")).map((x) => x.subject)).toContain("Carla ha reservado");
    expect((await carla.post(`/api/v1/me/appointments/${b.body.id}/cancel`)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect((await mailsTo("carla@example.com")).map((x) => x.subject)).toContain("Sesión cancelada");

    // Bea se dio de baja: sin confirmación
    const bea = new Agent(app);
    await bea.post("/api/v1/auth/login", { email: "bea@example.com", password: PASSWORD });
    expect((await bea.post("/api/v1/me/booking", { startsAt: madridInstant(day, 10 * 60).toISOString() })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect((await mailsTo("bea@example.com")).map((x) => x.subject)).not.toContain("Sesión reservada");
  });

  it("la tabla de correos no guarda cuerpos ya enviados", async () => {
    await app.mail.flush();
    const rows = await app.db.select().from(outbox);
    expect(rows.filter((r) => r.sentAt && (r.html || r.text))).toEqual([]);
  });
});
