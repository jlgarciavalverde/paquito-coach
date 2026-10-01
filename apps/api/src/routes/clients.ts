import type { FastifyInstance } from "fastify";
import { and, asc, eq, ilike, isNull, ne, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { Client, ClientListQuery, CreateClientInput, InviteLink, Ok, UpdateClientInput } from "@coach/shared";
import { clientProfiles, invites, passwordResets, sessions, users } from "../db/schema";
import { audit } from "../lib/audit";
import { HttpError, notFound } from "../lib/errors";
import { toClient } from "../lib/mappers";
import { requireCoach } from "../lib/session";
import { hashToken, newToken } from "../lib/tokens";
import { brandOf } from "../lib/mail";
import { mailTemplates } from "../lib/mail-templates";
import { typed, type Ctx } from "./ctx";

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const RESET_TTL_MS = 24 * 3600 * 1000;
const IdParams = z.object({ id: z.string().uuid() });

export function registerClients(app: FastifyInstance, ctx: Ctx) {
  const { db, cfg, mail } = ctx;
  const api = typed(app);

  /** Ficha del estudio del entrenador o 404 (nunca revela si existe en otro estudio). */
  async function getOwned(studioId: string, id: string) {
    const [row] = await db
      .select()
      .from(clientProfiles)
      .where(and(eq(clientProfiles.id, id), eq(clientProfiles.studioId, studioId)))
      .limit(1);
    if (!row) throw notFound("Cliente");
    return row;
  }

  /** Enlace de invitación (y, si la ficha tiene correo y la app envía correos, también por correo). */
  async function issueInvite(studioId: string, client: { id: string; name: string; email: string | null }, coach: { id: string; name: string }) {
    const token = newToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const url = `${cfg.publicUrl}/registro?invitacion=${token}`;
    const emailedTo = await db.transaction(async (tx) => {
      // Una sola invitación viva por cliente: las anteriores sin usar dejan de valer.
      await tx.delete(invites).where(and(eq(invites.clientId, client.id), isNull(invites.usedAt)));
      await tx.insert(invites).values({ studioId, clientId: client.id, tokenHash: hashToken(token), expiresAt, createdBy: coach.id });
      if (!client.email) return null;
      const t = mailTemplates.invite(await brandOf(db, studioId), { clientName: client.name, coachName: coach.name, url });
      return (await mail.enqueue(tx, { kind: "invite", to: client.email, studioId, clientId: client.id, ...t })) ? client.email : null;
    });
    if (emailedTo) mail.kick();
    return { url, expiresAt: expiresAt.toISOString(), emailedTo };
  }

  api.get("/clients", { schema: { tags: ["clientes"], querystring: ClientListQuery, response: { 200: z.array(Client) } } }, async (req) => {
    const u = requireCoach(req);
    const where: SQL[] = [eq(clientProfiles.studioId, u.studioId)];
    if (req.query.status) where.push(eq(clientProfiles.status, req.query.status));
    else where.push(ne(clientProfiles.status, "archived"));
    if (req.query.q) {
      const like = `%${req.query.q.replace(/[%_\\]/g, "\\$&")}%`;
      where.push(or(ilike(clientProfiles.name, like), ilike(clientProfiles.email, like))!);
    }
    const rows = await db.select().from(clientProfiles).where(and(...where)).orderBy(asc(clientProfiles.name));
    return rows.map(toClient);
  });

  api.post(
    "/clients",
    { schema: { tags: ["clientes"], body: CreateClientInput, response: { 200: z.object({ client: Client, invite: InviteLink.nullable() }) } } },
    async (req) => {
      const u = requireCoach(req);
      const { invite, ...fields } = req.body;
      const [row] = await db
        .insert(clientProfiles)
        .values({ ...fields, tags: fields.tags ?? [], studioId: u.studioId, status: invite ? "invited" : "no_account" })
        .returning();
      const link = invite ? await issueInvite(u.studioId, row!, u) : null;
      await audit(db, req, "client.create", { type: "client", id: row!.id });
      return { client: toClient(row!), invite: link };
    },
  );

  api.get("/clients/:id", { schema: { tags: ["clientes"], params: IdParams, response: { 200: Client } } }, async (req) => {
    const u = requireCoach(req);
    const row = await getOwned(u.studioId, req.params.id);
    await audit(db, req, "client.view", { type: "client", id: row.id });
    return toClient(row);
  });

  api.patch("/clients/:id", { schema: { tags: ["clientes"], params: IdParams, body: UpdateClientInput, response: { 200: Client } } }, async (req) => {
    const u = requireCoach(req);
    await getOwned(u.studioId, req.params.id);
    const [row] = await db
      .update(clientProfiles)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(clientProfiles.id, req.params.id), eq(clientProfiles.studioId, u.studioId)))
      .returning();
    await audit(db, req, "client.update", { type: "client", id: row!.id }, { fields: Object.keys(req.body) });
    return toClient(row!);
  });

  /** Genera (o regenera) el enlace de invitación. Convierte una ficha sin cuenta en invitada. */
  api.post("/clients/:id/invite", { schema: { tags: ["clientes"], params: IdParams, response: { 200: InviteLink } } }, async (req) => {
    const u = requireCoach(req);
    const row = await getOwned(u.studioId, req.params.id);
    if (row.userId) throw new HttpError(409, "has_account", "Este cliente ya tiene cuenta");
    if (row.status !== "invited") {
      await db.update(clientProfiles).set({ status: "invited", updatedAt: new Date() }).where(eq(clientProfiles.id, row.id));
    }
    const link = await issueInvite(u.studioId, row, u);
    await audit(db, req, "client.invite", { type: "client", id: row.id });
    return link;
  });

  /** Enlace para que un cliente con cuenta ponga una contraseña nueva (sin correo: se lo mandas tú). 24 h, un uso. */
  api.post("/clients/:id/reset-link", { schema: { tags: ["clientes"], params: IdParams, response: { 200: InviteLink } } }, async (req) => {
    const u = requireCoach(req);
    const row = await getOwned(u.studioId, req.params.id);
    if (!row.userId) throw new HttpError(409, "no_account", "Este cliente aún no tiene cuenta");
    const token = newToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await db.delete(passwordResets).where(and(eq(passwordResets.userId, row.userId), isNull(passwordResets.usedAt)));
    await db.insert(passwordResets).values({ userId: row.userId, tokenHash: hashToken(token), expiresAt, createdBy: u.id });
    await audit(db, req, "client.reset_link", { type: "client", id: row.id });
    return { url: `${cfg.publicUrl}/restablecer?token=${token}`, expiresAt: expiresAt.toISOString() };
  });

  api.post("/clients/:id/accept", { schema: { tags: ["clientes"], params: IdParams, response: { 200: Client } } }, async (req) => {
    const u = requireCoach(req);
    const row = await getOwned(u.studioId, req.params.id);
    if (row.status !== "pending") throw new HttpError(409, "not_pending", "Este cliente no está pendiente de aceptar");
    const [upd] = await db.update(clientProfiles).set({ status: "active", updatedAt: new Date() }).where(eq(clientProfiles.id, row.id)).returning();
    await audit(db, req, "client.accept", { type: "client", id: row.id });
    return toClient(upd!);
  });

  /** Rechaza una solicitud pendiente: borra la cuenta recién creada (no tiene datos todavía). */
  api.post("/clients/:id/reject", { schema: { tags: ["clientes"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    const row = await getOwned(u.studioId, req.params.id);
    if (row.status !== "pending") throw new HttpError(409, "not_pending", "Este cliente no está pendiente de aceptar");
    await db.transaction(async (tx) => {
      await tx.delete(clientProfiles).where(eq(clientProfiles.id, row.id));
      if (row.userId) await tx.delete(users).where(eq(users.id, row.userId));
    });
    await audit(db, req, "client.reject", { type: "client", id: row.id });
    return { ok: true as const };
  });

  api.post("/clients/:id/archive", { schema: { tags: ["clientes"], params: IdParams, response: { 200: Client } } }, async (req) => {
    const u = requireCoach(req);
    const row = await getOwned(u.studioId, req.params.id);
    const [upd] = await db.update(clientProfiles).set({ status: "archived", updatedAt: new Date() }).where(eq(clientProfiles.id, row.id)).returning();
    await db.delete(invites).where(and(eq(invites.clientId, row.id), isNull(invites.usedAt)));
    // Un cliente archivado pierde el acceso: se cierran sus sesiones.
    if (row.userId) await db.delete(sessions).where(eq(sessions.userId, row.userId));
    await audit(db, req, "client.archive", { type: "client", id: row.id });
    return toClient(upd!);
  });

  api.post("/clients/:id/unarchive", { schema: { tags: ["clientes"], params: IdParams, response: { 200: Client } } }, async (req) => {
    const u = requireCoach(req);
    const row = await getOwned(u.studioId, req.params.id);
    if (row.status !== "archived") throw new HttpError(409, "not_archived", "Este cliente no está archivado");
    const [upd] = await db
      .update(clientProfiles)
      .set({ status: row.userId ? "active" : "no_account", updatedAt: new Date() })
      .where(eq(clientProfiles.id, row.id))
      .returning();
    await audit(db, req, "client.unarchive", { type: "client", id: row.id });
    return toClient(upd!);
  });
}
