import type { FastifyInstance } from "fastify";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { InvitePreview, LoginInput, Me, Ok, RegisterInput, ResetPasswordInput, SetupInput, SetupStatus } from "@coach/shared";
import { clientProfiles, invites, passwordResets, sessions, studios, users } from "../db/schema";
import { audit } from "../lib/audit";
import { HttpError } from "../lib/errors";
import { hashPassword, isCommonPassword, verifyPassword } from "../lib/passwords";
import { clearFailures, isLocked, recordFailure } from "../lib/throttle";
import { hashToken, newJoinCode } from "../lib/tokens";
import { clearSessionCookie, cookieName, createSession } from "../lib/session";
import { safeEqual } from "../lib/compare";
import { meOf } from "./me";
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
    return { needsSetup: (row?.n ?? 0) === 0 };
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
    await createSession(db, cfg, reply, userId, req.headers["user-agent"]);
    return meOf(db, userId);
  });

  api.post("/auth/login", { schema: { tags: ["auth"], body: LoginInput, response: { 200: Me } }, config: strict }, async (req, reply) => {
    const { email, password } = req.body;
    const key = email.toLowerCase();
    if (isLocked(key)) throw LOCKED;
    const [user] = await db
      .select()
      .from(users)
      .where(and(sql`lower(${users.email}) = ${key}`, isNull(users.deletedAt)))
      .limit(1);
    // Se verifica siempre (con un hash de relleno si no existe) para no revelar por tiempo qué correos existen.
    const ok = await verifyPassword(password, user?.passwordHash);
    if (!user || !ok) {
      recordFailure(key);
      throw INVALID_LOGIN;
    }
    clearFailures(key);
    await createSession(db, cfg, reply, user.id, req.headers["user-agent"]);
    return meOf(db, user.id);
  });

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
    { schema: { tags: ["auth"], body: ResetPasswordInput, response: { 200: Me } }, config: strict },
    async (req, reply) => {
      assertStrong(req.body.password);
      const passwordHash = await hashPassword(req.body.password);
      const userId = await db.transaction(async (tx) => {
        const [used] = await tx
          .update(passwordResets)
          .set({ usedAt: new Date() })
          .where(and(eq(passwordResets.tokenHash, hashToken(req.body.token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
          .returning({ userId: passwordResets.userId });
        if (!used) throw new HttpError(410, "reset_invalid", "El enlace no es válido o ha caducado. Pide uno nuevo a tu entrenador.");
        await tx.update(users).set({ passwordHash }).where(eq(users.id, used.userId));
        // Fuera todas las sesiones anteriores.
        await tx.delete(sessions).where(eq(sessions.userId, used.userId));
        return used.userId;
      });
      await createSession(db, cfg, reply, userId, req.headers["user-agent"]);
      return meOf(db, userId);
    },
  );

  api.post("/auth/register", { schema: { tags: ["auth"], body: RegisterInput, response: { 200: Me } }, config: strict }, async (req, reply) => {
    const b = req.body;
    assertStrong(b.password);
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
    await createSession(db, cfg, reply, userId, req.headers["user-agent"]);
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
