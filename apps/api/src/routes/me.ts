import type { FastifyInstance } from "fastify";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { ChangePasswordInput, Me, Ok, SessionInfo } from "@coach/shared";
import type { DB } from "../db/client";
import { clientProfiles, sessions, studios, users } from "../db/schema";
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
  };
}

export function registerMe(app: FastifyInstance, { db }: Ctx) {
  const api = typed(app);

  api.get("/me", { schema: { tags: ["cuenta"], response: { 200: Me } } }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    return meOf(db, requireUser(req).id);
  });

  api.patch("/me/preferences", { schema: { tags: ["cuenta"], body: z.object({ reminders: z.boolean() }), response: { 200: Me } } }, async (req) => {
    const u = requireUser(req);
    await db.update(users).set({ reminders: req.body.reminders }).where(eq(users.id, u.id));
    return meOf(db, u.id);
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
