import { clientIp } from "../lib/ip";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  EmailChangeInput, ForgotPasswordInput, InvitePreview, LoginInput, LoginResult, Me, Ok, RegisterInput, ResetPasswordInput, SetupInput, SetupStatus,
  TwoFactorLoginInput,
} from "@coach/shared";
import { clientProfiles, emailTokens, invites, passwordResets, sessions, studios, users } from "../db/schema";
import { endChallenge, newChallenge, useChallengeAttempt } from "../lib/challenges";
import { brandOf } from "../lib/mail";
import { mailTemplates } from "../lib/mail-templates";
import { hashRecovery, verifyTotp } from "../lib/totp";
import { audit } from "../lib/audit";
import { HttpError } from "../lib/errors";
import { hashPassword, isCommonPassword, verifyPassword } from "../lib/passwords";
import { clearFailures, isLocked, recordFailure } from "../lib/throttle";
import { hashToken, newJoinCode, newToken } from "../lib/tokens";
import { clearSessionCookie, cookieName, createSession } from "../lib/session";
import { safeEqual } from "../lib/compare";
import { meOf } from "./me";
import { DEMO_CLIENT, DEMO_COACH } from "../demo/seed";
import { typed, type Ctx } from "./ctx";

const INVALID_LOGIN = new HttpError(401, "invalid_credentials", "Correo o contraseña incorrectos");
const LOCKED = new HttpError(429, "locked", "Demasiados intentos con esta cuenta. Espera 15 minutos o recupera tu contraseña.");
const EMAIL_TAKEN = new HttpError(409, "email_taken", "Ya existe una cuenta con ese correo. Inicia sesión.");

function assertStrong(pw: string) {
  if (isCommonPassword(pw)) throw new HttpError(400, "weak_password", "Esa contraseña es demasiado común. Elige otra.");
}

async function emailExists(db: Ctx["db"], email: string) {
  const [row] = await db.select({ n: count() }).from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  return (row?.n ?? 0) > 0;
}

export function registerAuth(app: FastifyInstance, ctx: Ctx) {
  const { db, cfg } = ctx;
  const api = typed(app);
  const strict = { rateLimit: { max: cfg.authRateLimit, timeWindow: "1 minute" } };

  api.get("/auth/setup-status", { schema: { tags: ["auth"], response: { 200: SetupStatus } } }, async () => {
    const [row] = await db.select({ n: count() }).from(studios);
    return { needsSetup: !cfg.demoMode && (row?.n ?? 0) === 0, demo: Boolean(cfg.demoMode), mail: ctx.mail.enabled };
  });

  /** Alta inicial: crea el estudio y la cuenta del entrenador. Solo una vez y con SETUP_CODE. */
  api.post("/auth/setup", { schema: { tags: ["auth"], body: SetupInput, response: { 200: Me } }, config: strict }, async (req, reply) => {
    const b = req.body;
    if (!cfg.setupCode || !safeEqual(b.setupCode, cfg.setupCode)) throw new HttpError(403, "bad_setup_code", "Código de instalación incorrecto");
    assertStrong(b.password);
    const passwordHash = await hashPassword(b.password);
    const userId = await db.transaction(async (tx) => {
      await tx.execute(sql`lock table studios in exclusive mode`);
      const [existing] = await tx.select({ n: count() }).from(studios);
      if ((existing?.n ?? 0) > 0) throw new HttpError(409, "already_setup", "La app ya está configurada");
      const [studio] = await tx.insert(studios).values({ name: b.studioName, joinCode: newJoinCode() }).returning();
      const [user] = await tx
        .insert(users)
        .values({ studioId: studio!.id, role: "coach", name: b.name, email: b.email, passwordHash, healthConsentAt: new Date() })
        .returning();
      return user!.id;
    });
    await createSession(db, cfg, reply, userId, req.headers["user-agent"], req.cookies[cookieName(cfg)]);
    return meOf(db, userId);
  });

  /** Tras la contraseña (o el restablecimiento): sesión directa o, con 2FA, un reto. */
  async function finishLogin(req: FastifyRequest, reply: FastifyReply, userId: string): Promise<LoginResult> {
    const [u] = await db.select({ totp: users.totpSecret }).from(users).where(eq(users.id, userId));
    if (u?.totp) return { twoFactorRequired: true as const, challenge: newChallenge(userId) };
    await createSession(db, cfg, reply, userId, req.headers["user-agent"], req.cookies[cookieName(cfg)]);
    return meOf(db, userId);
  }

  api.post("/auth/login", { schema: { tags: ["auth"], body: LoginInput, response: { 200: LoginResult } }, config: strict }, async (req, reply) => {
    const { email, password } = req.body;
    const key = email.toLowerCase();
    // Dos frenos: 5 fallos por correo desde la misma IP y 20 por correo en total. Así un atacante desde su IP no deja
    // bloqueada la cuenta de otra persona (que entra desde la suya), pero un ataque repartido sigue frenado.
    const keyIp = `${key}|${clientIp(cfg, req)}`;
    if (isLocked(keyIp, Date.now(), 5) || isLocked(key, Date.now(), 20)) throw LOCKED;
    const [user] = await db
      .select()
      .from(users)
      .where(and(sql`lower(${users.email}) = ${key}`, isNull(users.deletedAt)))
      .limit(1);
    // Se verifica siempre (con un hash de relleno si no existe) para no revelar por tiempo qué correos existen.
    const ok = await verifyPassword(password, user?.passwordHash);
    if (!user || !ok) {
      recordFailure(keyIp);
      recordFailure(key);
      throw INVALID_LOGIN;
    }
    clearFailures(keyIp);
    // Un cliente archivado no entra: su entrenador le ha dado de baja (sus datos se conservan).
    const [cp] = await db.select({ status: clientProfiles.status }).from(clientProfiles).where(eq(clientProfiles.userId, user.id));
    if (cp?.status === "archived") throw new HttpError(403, "archived", "Tu entrenador ha dado de baja tu cuenta. Si es un error, escríbele.");
    return finishLogin(req, reply, user.id);
  });

  /** Segundo paso: el código de la app de autenticación o uno de los de recuperación (cada uno sirve una vez). */
  api.post("/auth/login/2fa", { schema: { tags: ["auth"], body: TwoFactorLoginInput, response: { 200: Me } }, config: strict }, async (req, reply) => {
    const bad = new HttpError(401, "bad_code", "El código no es correcto o ha caducado. Si ha pasado mucho rato, vuelve a escribir la contraseña.");
    const userId = useChallengeAttempt(req.body.challenge);
    if (!userId) throw bad;
    const [u] = await db.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!u?.totpSecret) throw bad;
    const code = req.body.code.trim();
    if (/^\d{6}$/.test(code)) {
      const step = verifyTotp(u.totpSecret, code, u.totpLastStep);
      // Condición sobre el último paso: dos peticiones a la vez con el mismo código no entran las dos.
      const won = step !== null && (await db.update(users).set({ totpLastStep: step }).where(and(eq(users.id, u.id), sql`coalesce(${users.totpLastStep}, -1) < ${step}`)).returning({ id: users.id })).length > 0;
      if (!won) throw bad;
    } else {
      const h = hashRecovery(code);
      if (!u.totpRecovery.includes(h)) throw bad;
      const won = await db
        .update(users)
        .set({ totpRecovery: u.totpRecovery.filter((x) => x !== h) })
        .where(and(eq(users.id, u.id), sql`${users.totpRecovery} @> ${JSON.stringify([h])}::jsonb`))
        .returning({ id: users.id });
      if (won.length === 0) throw bad;
      await audit(db, req, "auth.2fa.recovery_used", { type: "user", id: u.id }, { left: u.totpRecovery.length - 1 });
    }
    endChallenge(req.body.challenge);
    await createSession(db, cfg, reply, u.id, req.headers["user-agent"], req.cookies[cookieName(cfg)]);
    return meOf(db, u.id);
  });

  /**
   * «He olvidado la contraseña»: si el correo es de una cuenta, le llega un enlace de un uso (1 hora). La respuesta es
   * la misma exista o no (no se pueden sondear cuentas) y tiene freno por IP (ruta) y por correo (3 cada 15 minutos).
   */
  api.post("/auth/password/forgot", { schema: { tags: ["auth"], body: ForgotPasswordInput, response: { 200: Ok } }, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req) => {
    if (!ctx.mail.enabled) throw new HttpError(503, "mail_off", "Esta app no envía correos todavía. Pide a tu entrenador un enlace para cambiar la contraseña.");
    const key = `forgot|${req.body.email}`;
    if (isLocked(key, Date.now(), 3)) return { ok: true as const };
    recordFailure(key);
    const [u] = await db
      .select({ id: users.id, name: users.name, email: users.email, studioId: users.studioId })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${req.body.email}`, isNull(users.deletedAt)))
      .limit(1);
    if (u) {
      const [cp] = await db.select({ status: clientProfiles.status }).from(clientProfiles).where(eq(clientProfiles.userId, u.id));
      if (cp?.status !== "archived") {
        const token = newToken();
        const t = mailTemplates.passwordReset(await brandOf(db, u.studioId), { name: u.name, url: `${cfg.publicUrl}/restablecer?token=${token}` });
        await db.transaction(async (tx) => {
          await tx.delete(passwordResets).where(and(eq(passwordResets.userId, u.id), isNull(passwordResets.usedAt)));
          await tx.insert(passwordResets).values({ userId: u.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000), createdBy: null });
          await ctx.mail.enqueue(tx, { kind: "password_reset", to: u.email, userId: u.id, studioId: u.studioId, ...t });
        });
        ctx.mail.kick();
        await audit(db, req, "auth.password.forgot", { type: "user", id: u.id });
      }
    }
    return { ok: true as const };
  });

  /** Confirmar un correo nuevo (enlace enviado a esa dirección). Se avisa a la dirección anterior. */
  api.post("/auth/email/confirm", { schema: { tags: ["auth"], body: z.object({ token: z.string().min(20).max(200) }), response: { 200: Ok } }, config: strict }, async (req) => {
    const r = await db.transaction(async (tx) => {
      const [t] = await tx
        .update(emailTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(emailTokens.tokenHash, hashToken(req.body.token)), eq(emailTokens.kind, "email_change"), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date())))
        .returning();
      if (!t?.newEmail) throw new HttpError(410, "token_invalid", "El enlace no es válido o ha caducado. Vuelve a pedir el cambio desde tu perfil.");
      if (await emailExists(tx as unknown as Ctx["db"], t.newEmail)) throw new HttpError(409, "email_taken", "Esa dirección ya la usa otra cuenta.");
      const [old] = await tx.select({ email: users.email, name: users.name, studioId: users.studioId }).from(users).where(eq(users.id, t.userId));
      await tx.update(users).set({ email: t.newEmail }).where(eq(users.id, t.userId));
      await tx.update(clientProfiles).set({ email: t.newEmail, updatedAt: new Date() }).where(eq(clientProfiles.userId, t.userId));
      const m = mailTemplates.emailChanged(await brandOf(db, old!.studioId), { name: old!.name, newEmail: t.newEmail });
      await ctx.mail.enqueue(tx, { kind: "email_changed", to: old!.email, userId: t.userId, studioId: old!.studioId, ...m });
      return t.userId;
    });
    ctx.mail.kick();
    await audit(db, req, "auth.email.changed", { type: "user", id: r });
    return { ok: true as const };
  });

  /** «Darme de baja» desde un correo, sin iniciar sesión: solo apaga los correos no esenciales. */
  api.post("/auth/unsubscribe", { schema: { tags: ["auth"], body: z.object({ token: z.string().uuid() }), response: { 200: Ok } }, config: strict }, async (req) => {
    await db.update(users).set({ emailNotifications: false }).where(eq(users.unsubscribeToken, req.body.token));
    return { ok: true as const };
  });

  /** Solo en la demo: entrar con un clic como el entrenador o como la clienta de ejemplo. */
  if (cfg.demoMode) {
    api.post(
      "/auth/demo",
      { schema: { tags: ["auth"], body: z.object({ as: z.enum(["coach", "client"]) }), response: { 200: Me } }, config: strict },
      async (req, reply) => {
        const email = req.body.as === "coach" ? DEMO_COACH.email : DEMO_CLIENT.email;
        const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
        if (!u) throw new HttpError(503, "demo_resetting", "La demo se está reiniciando. Prueba en un minuto.");
        await createSession(db, cfg, reply, u.id, req.headers["user-agent"], req.cookies[cookieName(cfg)]);
        return meOf(db, u.id);
      },
    );
  }

  api.post("/auth/logout", { schema: { tags: ["auth"], response: { 200: Ok } } }, async (req, reply) => {
    const token = req.cookies[cookieName(cfg)];
    if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    clearSessionCookie(cfg, reply);
    return { ok: true as const };
  });

  /** Datos públicos de una invitación (para saludar a la persona en la pantalla de registro). */
  api.get(
    "/auth/invites/:token",
    { schema: { tags: ["auth"], params: z.object({ token: z.string().min(20).max(200) }), response: { 200: InvitePreview } }, config: strict },
    async (req) => {
      const inv = await findValidInvite(ctx, req.params.token);
      return { studioName: inv.studioName, coachName: inv.coachName, clientName: inv.clientName, email: inv.email };
    },
  );

  api.get(
    "/auth/join/:code",
    { schema: { tags: ["auth"], params: z.object({ code: z.string().min(4).max(20) }), response: { 200: InvitePreview } }, config: strict },
    async (req) => {
      const studio = await findStudioByCode(ctx, req.params.code);
      return { studioName: studio.name, coachName: studio.coachName, clientName: null, email: null };
    },
  );

  api.post(
    "/auth/password/reset",
    { schema: { tags: ["auth"], body: ResetPasswordInput, response: { 200: LoginResult } }, config: strict },
    async (req, reply) => {
      assertStrong(req.body.password);
      const passwordHash = await hashPassword(req.body.password);
      const userId = await db.transaction(async (tx) => {
        const [used] = await tx
          .update(passwordResets)
          .set({ usedAt: new Date() })
          .where(and(eq(passwordResets.tokenHash, hashToken(req.body.token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
          .returning({ userId: passwordResets.userId });
        if (!used) throw new HttpError(410, "reset_invalid", ctx.mail.enabled ? "El enlace no es válido o ha caducado. Pide uno nuevo desde «¿Has olvidado la contraseña?»." : "El enlace no es válido o ha caducado. Pide uno nuevo a tu entrenador.");
        await tx.update(users).set({ passwordHash }).where(eq(users.id, used.userId));
        // Fuera todas las sesiones anteriores.
        await tx.delete(sessions).where(eq(sessions.userId, used.userId));
        return used.userId;
      });
      // Con 2FA, restablecer la contraseña no basta para entrar: falta el código (si no, el correo sería la única llave).
      return finishLogin(req, reply, userId);
    },
  );

  api.post("/auth/register", { schema: { tags: ["auth"], body: RegisterInput, response: { 200: Me } }, config: strict }, async (req, reply) => {
    const b = req.body;
    assertStrong(b.password);
    // Primero la invitación o el código (sin uno válido no se dice nada del correo: no se pueden sondear cuentas).
    if (b.inviteToken) await findValidInvite(ctx, b.inviteToken);
    else await findStudioByCode(ctx, b.joinCode!);
    if (await emailExists(db, b.email)) throw EMAIL_TAKEN;
    const passwordHash = await hashPassword(b.password);

    const userId = await db.transaction(async (tx) => {
      if (b.inviteToken) {
        const inv = await findValidInvite(ctx, b.inviteToken);
        // Marca la invitación como usada de forma atómica: si dos registros llegan a la vez, solo uno gana.
        const used = await tx
          .update(invites)
          .set({ usedAt: new Date() })
          .where(and(eq(invites.id, inv.inviteId), isNull(invites.usedAt)))
          .returning({ id: invites.id });
        if (used.length === 0) throw new HttpError(410, "invite_used", "Esta invitación ya se ha usado");
        const [user] = await tx
          .insert(users)
          .values({ studioId: inv.studioId, role: "client", name: b.name, email: b.email, passwordHash, healthConsentAt: new Date() })
          .returning();
        await tx
          .update(clientProfiles)
          .set({ userId: user!.id, email: b.email, status: "active", updatedAt: new Date() })
          .where(eq(clientProfiles.id, inv.clientId));
        return user!.id;
      }
      const studio = await findStudioByCode(ctx, b.joinCode!);
      const [user] = await tx
        .insert(users)
        .values({ studioId: studio.id, role: "client", name: b.name, email: b.email, passwordHash, healthConsentAt: new Date() })
        .returning();
      await tx.insert(clientProfiles).values({ studioId: studio.id, userId: user!.id, name: b.name, email: b.email, status: "pending" });
      return user!.id;
    });
    await createSession(db, cfg, reply, userId, req.headers["user-agent"], req.cookies[cookieName(cfg)]);
    req.user = null;
    await audit(db, req, b.inviteToken ? "client.register.invite" : "client.register.code", { type: "user", id: userId });
    return meOf(db, userId);
  });

}

async function findValidInvite({ db }: Ctx, token: string) {
  const rows = await db
    .select({
      inviteId: invites.id,
      studioId: invites.studioId,
      clientId: invites.clientId,
      studioName: studios.name,
      clientName: clientProfiles.name,
      email: clientProfiles.email,
      status: clientProfiles.status,
    })
    .from(invites)
    .innerJoin(studios, eq(studios.id, invites.studioId))
    .innerJoin(clientProfiles, eq(clientProfiles.id, invites.clientId))
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
    .limit(1);
  const inv = rows[0];
  if (!inv || inv.status !== "invited") throw new HttpError(410, "invite_invalid", "La invitación no es válida o ha caducado. Pide una nueva a tu entrenador.");
  return { ...inv, coachName: await coachName(db, inv.studioId) };
}

async function findStudioByCode({ db }: Ctx, code: string) {
  const [studio] = await db.select().from(studios).where(eq(studios.joinCode, code.trim().toUpperCase())).limit(1);
  if (!studio) throw new HttpError(404, "join_code_invalid", "Ese código no existe. Revísalo o pide uno nuevo a tu entrenador.");
  return { ...studio, coachName: await coachName(db, studio.id) };
}

async function coachName(db: Ctx["db"], studioId: string) {
  const [coach] = await db
    .select({ name: users.name })
    .from(users)
    .where(and(eq(users.studioId, studioId), eq(users.role, "coach"), isNull(users.deletedAt)))
    .orderBy(users.createdAt)
    .limit(1);
  return coach?.name ?? "";
}
