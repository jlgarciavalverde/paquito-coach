import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "../db/client";
import { clientProfiles, sessions, studios, users } from "../db/schema";
import { hashToken, newToken } from "./tokens";
import { forbidden, unauthorized } from "./errors";
import type { AppConfig } from "../config";

export const SESSION_TTL_MS = 60 * 24 * 3600 * 1000; // 60 días desde el último uso
/** Vida máxima de una sesión aunque se use a diario: pasado este tiempo hay que volver a entrar. */
export const SESSION_MAX_AGE_MS = 180 * 24 * 3600 * 1000;
const TOUCH_EVERY_MS = 3600 * 1000;

export interface AuthUser {
  id: string;
  studioId: string;
  role: "coach" | "client";
  name: string;
  email: string;
  sessionId: string;
  /** Solo clientes: su ficha. */
  clientId: string | null;
  clientStatus: "invited" | "pending" | "active" | "archived" | "no_account" | null;
  studioName: string;
}

export const cookieName = (cfg: AppConfig) => (cfg.secureCookies ? "__Host-sid" : "sid");

export async function createSession(db: DB, cfg: AppConfig, reply: FastifyReply, userId: string, userAgent?: string, previousToken?: string) {
  // Al entrar se descarta la sesión que traía el navegador (si la había): nunca se reutiliza un token anterior.
  if (previousToken && previousToken.length <= 200) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(previousToken)));
  const token = newToken();
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, userAgent: userAgent?.slice(0, 200) ?? null });
  reply.setCookie(cookieName(cfg), token, {
    path: "/",
    httpOnly: true,
    secure: cfg.secureCookies,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(cfg: AppConfig, reply: FastifyReply) {
  reply.clearCookie(cookieName(cfg), { path: "/", httpOnly: true, secure: cfg.secureCookies, sameSite: "lax" });
}

export async function authenticate(db: DB, token: string | undefined): Promise<AuthUser | null> {
  if (!token || token.length > 200) return null;
  const rows = await db
    .select({ s: sessions, u: users, st: studios, c: clientProfiles })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(studios, eq(studios.id, users.studioId))
    .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(users.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.c?.status === "archived") return null; // dado de baja por su entrenador
  const now = Date.now();
  if (now - row.s.lastUsedAt.getTime() > SESSION_TTL_MS || now - row.s.createdAt.getTime() > SESSION_MAX_AGE_MS) {
    await db.delete(sessions).where(eq(sessions.id, row.s.id));
    return null;
  }
  if (now - row.s.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(sessions).set({ lastUsedAt: new Date(now) }).where(eq(sessions.id, row.s.id));
  }
  return {
    id: row.u.id,
    studioId: row.u.studioId,
    role: row.u.role,
    name: row.u.name,
    email: row.u.email,
    sessionId: row.s.id,
    clientId: row.c?.id ?? null,
    clientStatus: row.c?.status ?? null,
    studioName: row.st.name,
  };
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

/** Devuelve el usuario de la petición o lanza 401. */
export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireCoach(req: FastifyRequest): AuthUser {
  const u = requireUser(req);
  if (u.role !== "coach") throw forbidden();
  return u;
}

/** Cliente con vínculo activo con su entrenador (los pendientes/archivados no ven contenido). */
export function requireActiveClient(req: FastifyRequest): AuthUser & { clientId: string } {
  const u = requireUser(req);
  if (u.role !== "client" || !u.clientId || u.clientStatus !== "active") throw forbidden();
  return u as AuthUser & { clientId: string };
}
