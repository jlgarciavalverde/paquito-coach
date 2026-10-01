import { audit } from "../lib/audit";
import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { ChangePasswordInput, EmailChangeInput, Me, Ok, RecoveryCodes, SessionInfo, TwoFactorDisableInput, TwoFactorEnableInput, TwoFactorSetup } from "@coach/shared";
import type { DB } from "../db/client";
import { clientProfiles, emailTokens, sessions, studios, users } from "../db/schema";
import { brandOf } from "../lib/mail";
import { mailTemplates } from "../lib/mail-templates";
import { hashToken, newToken } from "../lib/tokens";
import { hashRecovery, newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from "../lib/totp";
import { HttpError, notFound } from "../lib/errors";
import { hashPassword, isCommonPassword, verifyPassword } from "../lib/passwords";
import { requireUser } from "../lib/session";
import { typed, type Ctx } from "./ctx";

async function firstCoachName(db: DB, studioId: string) {
  const [c] = await db
    .select({ name: users.name })
    .from(users)
    .where(and(eq(users.studioId, studioId), eq(users.role, "coach")))
    .orderBy(users.createdAt)
    .limit(1);
  return c?.name ?? "";
}

export async function meOf(db: DB, userId: string): Promise<Me> {
  const [row] = await db
    .select({ u: users, st: studios, c: clientProfiles })
    .from(users)
    .innerJoin(studios, eq(studios.id, users.studioId))
    .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw notFound("Usuario");
  return {
    id: row.u.id,
    name: row.u.name,
    email: row.u.email,
    role: row.u.role,
    studio: { id: row.st.id, name: row.st.name, coachName: row.u.role === "coach" ? row.u.name : await firstCoachName(db, row.st.id) },
    clientStatus: row.u.role === "client" ? (row.c?.status ?? null) : null,
    reminders: row.u.reminders,
    emailNotifications: row.u.emailNotifications,
    twoFactor: Boolean(row.u.totpSecret),
  };
}

export function registerMe(app: FastifyInstance, { db, cfg, mail }: Ctx) {
  const api = typed(app);

  api.get("/me", { schema: { tags: ["cuenta"], response: { 200: Me } } }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    return meOf(db, requireUser(req).id);
  });

  api.patch(
    "/me/preferences",
    { schema: { tags: ["cuenta"], body: z.object({ reminders: z.boolean().optional(), emailNotifications: z.boolean().optional() }), response: { 200: Me } } },
    async (req) => {
      const u = requireUser(req);
      const set = Object.fromEntries(Object.entries(req.body).filter(([, v]) => v !== undefined));
      if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, u.id));
      return meOf(db, u.id);
    },
  );

  // ── Verificación en dos pasos (TOTP) ──
  const strict = { rateLimit: { max: 10, timeWindow: "1 minute" } };
  /** Paso 1: secreto nuevo pendiente de confirmar (no se activa hasta que la app del móvil dé un código bueno). */
  api.post("/me/2fa/setup", { schema: { tags: ["cuenta"], response: { 200: TwoFactorSetup } }, config: strict }, async (req) => {
    const u = requireUser(req);
    const [row] = await db.select({ email: users.email, totp: users.totpSecret, studio: studios.name }).from(users).innerJoin(studios, eq(studios.id, users.studioId)).where(eq(users.id, u.id));
    if (row?.totp) throw new HttpError(409, "already_on", "La verificación en dos pasos ya está activada");
    const secret = newTotpSecret();
    await db.update(users).set({ totpPendingSecret: secret }).where(eq(users.id, u.id));
    return { secret, otpauthUrl: otpauthUrl(secret, row!.email, row!.studio) };
  });
  /** Paso 2: con un código bueno se activa y se dan los 10 códigos de recuperación (solo esta vez). */
  api.post("/me/2fa/enable", { schema: { tags: ["cuenta"], body: TwoFactorEnableInput, response: { 200: RecoveryCodes } }, config: strict }, async (req) => {
    const u = requireUser(req);
    const [row] = await db.select({ pending: users.totpPendingSecret }).from(users).where(eq(users.id, u.id));
    const step = row?.pending ? verifyTotp(row.pending, req.body.code, null) : null;
    if (step === null) throw new HttpError(400, "bad_code", "El código no es correcto. Comprueba que la hora del móvil está bien y prueba con el siguiente.");
    const codes = newRecoveryCodes();
    await db
      .update(users)
      .set({ totpSecret: row!.pending, totpPendingSecret: null, totpLastStep: step, totpRecovery: codes.map(hashRecovery) })
      .where(eq(users.id, u.id));
    // El resto de dispositivos entraron sin el segundo paso: fuera.
    await db.delete(sessions).where(and(eq(sessions.userId, u.id), ne(sessions.id, u.sessionId)));
    await audit(db, req, "auth.2fa.enabled", { type: "user", id: u.id });
    return { codes };
  });
  /** Quitarla exige la contraseña y un código (de la app o de recuperación): con solo la sesión robada no se puede. */
  api.post("/me/2fa/disable", { schema: { tags: ["cuenta"], body: TwoFactorDisableInput, response: { 200: Ok } }, config: strict }, async (req) => {
    const u = requireUser(req);
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    if (!(await verifyPassword(req.body.password, row?.passwordHash))) throw new HttpError(400, "bad_password", "La contraseña no es correcta");
    if (!row?.totpSecret) return { ok: true as const };
    const ok = verifyTotp(row.totpSecret, req.body.code, row.totpLastStep) !== null || row.totpRecovery.includes(hashRecovery(req.body.code));
    if (!ok) throw new HttpError(400, "bad_code", "El código no es correcto");
    await db.update(users).set({ totpSecret: null, totpPendingSecret: null, totpLastStep: null, totpRecovery: [] }).where(eq(users.id, u.id));
    await audit(db, req, "auth.2fa.disabled", { type: "user", id: u.id });
    return { ok: true as const };
  });
  /** Códigos de recuperación nuevos (los anteriores dejan de valer). */
  api.post("/me/2fa/recovery", { schema: { tags: ["cuenta"], body: z.object({ password: z.string().min(1).max(200) }), response: { 200: RecoveryCodes } }, config: strict }, async (req) => {
    const u = requireUser(req);
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    if (!(await verifyPassword(req.body.password, row?.passwordHash))) throw new HttpError(400, "bad_password", "La contraseña no es correcta");
    if (!row?.totpSecret) throw new HttpError(409, "not_on", "Activa primero la verificación en dos pasos");
    const codes = newRecoveryCodes();
    await db.update(users).set({ totpRecovery: codes.map(hashRecovery) }).where(eq(users.id, u.id));
    await audit(db, req, "auth.2fa.recovery_regenerated", { type: "user", id: u.id });
    return { codes };
  });

  /** Cambiar el correo: se manda un enlace a la dirección nueva y no cambia hasta confirmarlo. */
  api.post("/me/email", { schema: { tags: ["cuenta"], body: EmailChangeInput, response: { 200: Ok } }, config: strict }, async (req) => {
    const u = requireUser(req);
    if (!mail.enabled) throw new HttpError(503, "mail_off", "Esta app aún no envía correos: pide a tu entrenador que te cambie la dirección.");
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    if (!(await verifyPassword(req.body.password, row?.passwordHash))) throw new HttpError(400, "bad_password", "La contraseña no es correcta");
    if (req.body.email === row!.email.toLowerCase()) throw new HttpError(400, "same_email", "Ese ya es tu correo");
    const [taken] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${req.body.email}`);
    // Se responde igual aunque esté cogido (no se sondean cuentas); al confirmar, se comprueba otra vez.
    if (!taken) {
      const token = newToken();
      const t = mailTemplates.emailChange(await brandOf(db, row!.studioId), { name: row!.name, url: `${cfg.publicUrl}/confirmar-correo?token=${token}` });
      await db.transaction(async (tx) => {
        await tx.delete(emailTokens).where(and(eq(emailTokens.userId, u.id), isNull(emailTokens.usedAt)));
        await tx.insert(emailTokens).values({ userId: u.id, kind: "email_change", newEmail: req.body.email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 3600_000) });
        await mail.enqueue(tx, { kind: "email_change", to: req.body.email, userId: u.id, studioId: row!.studioId, ...t });
      });
      mail.kick();
    }
    await audit(db, req, "auth.email.change_requested", { type: "user", id: u.id });
    return { ok: true as const };
  });

  api.get("/me/sessions", { schema: { tags: ["cuenta"], response: { 200: z.array(SessionInfo) } } }, async (req) => {
    const u = requireUser(req);
    const rows = await db.select().from(sessions).where(eq(sessions.userId, u.id)).orderBy(desc(sessions.lastUsedAt));
    return rows.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      current: s.id === u.sessionId,
    }));
  });

  api.delete(
    "/me/sessions/:id",
    { schema: { tags: ["cuenta"], params: z.object({ id: z.string().uuid() }), response: { 200: Ok } } },
    async (req) => {
      const u = requireUser(req);
      await db.delete(sessions).where(and(eq(sessions.id, req.params.id), eq(sessions.userId, u.id)));
      return { ok: true as const };
    },
  );

  /** Cerrar la sesión en todos los demás dispositivos (móvil perdido, ordenador ajeno…). */
  api.post(
    "/me/sessions/revoke-others",
    { schema: { tags: ["cuenta"], response: { 200: z.object({ closed: z.number() }) } }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const u = requireUser(req);
      const r = await db.delete(sessions).where(and(eq(sessions.userId, u.id), ne(sessions.id, u.sessionId))).returning({ id: sessions.id });
      await audit(db, req, "sessions.revoke_others", { type: "user", id: u.id }, { closed: r.length });
      return { closed: r.length };
    },
  );

  api.post(
    "/auth/password/change",
    { schema: { tags: ["cuenta"], body: ChangePasswordInput, response: { 200: Ok } }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const u = requireUser(req);
      const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, u.id));
      if (!(await verifyPassword(req.body.current, row?.hash))) throw new HttpError(400, "bad_password", "La contraseña actual no es correcta");
      if (isCommonPassword(req.body.next)) throw new HttpError(400, "weak_password", "Esa contraseña es demasiado común. Elige otra.");
      await db.update(users).set({ passwordHash: await hashPassword(req.body.next) }).where(eq(users.id, u.id));
      // Cierra el resto de sesiones: si alguien conocía la contraseña antigua, queda fuera.
      await db.delete(sessions).where(and(eq(sessions.userId, u.id), ne(sessions.id, u.sessionId)));
      return { ok: true as const };
    },
  );
}
