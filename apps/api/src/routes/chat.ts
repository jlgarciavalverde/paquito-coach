import type { FastifyInstance, FastifyRequest } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { Conversation, Message, MessagePage, MessagesQuery, Ok, PushSubscriptionInput, SendMessageInput } from "@coach/shared";
import { resourceVisible } from "./library";
import { clientProfiles, conversationReads, media, messages, pushSubscriptions, users } from "../db/schema";
import { HttpError, notFound } from "../lib/errors";
import { requireActiveClient, requireCoach, requireUser, type AuthUser } from "../lib/session";
import { sniffImage } from "../lib/sniff";
import type { Hub } from "../lib/realtime";
import type { PushSender } from "../lib/push";
import { typed, type Ctx } from "./ctx";

const ClientParams = z.object({ clientId: z.string().uuid() });
const MAX_IMAGE = 8 * 1024 * 1024;

export interface ChatDeps {
  hub: Hub;
  push: PushSender;
  mediaDir: string;
  vapidPublicKey?: string;
}

type MsgRow = typeof messages.$inferSelect;

export function registerChat(app: FastifyInstance, { db }: Ctx, deps: ChatDeps) {
  const api = typed(app);
  const toMessage = (m: MsgRow, senderName: string): Message => ({
    id: m.id,
    clientId: m.clientId,
    senderId: m.senderId ?? "",
    senderName,
    fromCoach: m.fromCoach,
    body: m.body,
    mediaId: m.mediaId,
    createdAt: m.createdAt.toISOString(),
  });

  async function clientOf(studioId: string, clientId: string) {
    const [c] = await db.select().from(clientProfiles).where(and(eq(clientProfiles.id, clientId), eq(clientProfiles.studioId, studioId)));
    if (!c) throw notFound("Cliente");
    return c;
  }
  const coachIds = async (studioId: string) =>
    (await db.select({ id: users.id }).from(users).where(and(eq(users.studioId, studioId), eq(users.role, "coach"), isNull(users.deletedAt)))).map((r) => r.id);

  /** Quién participa en la conversación de un cliente: los entrenadores del estudio y la cuenta del cliente. */
  async function participants(studioId: string, clientId: string) {
    const [c] = await db.select({ userId: clientProfiles.userId }).from(clientProfiles).where(eq(clientProfiles.id, clientId));
    return [...(await coachIds(studioId)), ...(c?.userId ? [c.userId] : [])];
  }

  async function page(clientId: string, me: AuthUser, q: z.infer<typeof MessagesQuery>) {
    const where = [eq(messages.clientId, clientId)];
    if (q.before) where.push(lt(messages.createdAt, new Date(q.before)));
    const rows = await db
      .select({ m: messages, name: users.name })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(and(...where))
      .orderBy(desc(messages.createdAt))
      .limit(q.limit + 1);
    const others = await db
      .select({ at: sql<Date>`max(${conversationReads.lastReadAt})` })
      .from(conversationReads)
      .where(and(eq(conversationReads.clientId, clientId), ne(conversationReads.userId, me.id)));
    return {
      messages: rows.slice(0, q.limit).reverse().map((r) => toMessage(r.m, r.name ?? "")),
      hasMore: rows.length > q.limit,
      otherReadAt: others[0]?.at ? new Date(others[0].at).toISOString() : null,
    };
  }

  async function send(me: AuthUser, clientId: string, body: z.infer<typeof SendMessageInput>) {
    if (body.mediaId) {
      const [m] = await db.select().from(media).where(and(eq(media.id, body.mediaId), eq(media.studioId, me.studioId), eq(media.clientId, clientId), eq(media.uploaderId, me.id)));
      if (!m) throw new HttpError(400, "bad_media", "La foto no es válida");
    }
    const [m] = await db
      .insert(messages)
      .values({ studioId: me.studioId, clientId, senderId: me.id, fromCoach: me.role === "coach", body: body.body, mediaId: body.mediaId })
      .returning();
    const msg = toMessage(m!, me.name);
    await markRead(me, clientId, m!.createdAt);
    const to = await participants(me.studioId, clientId);
    deps.hub.send(to, { type: "message.new", message: msg });
    // Aviso push a quien no lo tiene abierto.
    const offline = to.filter((id) => id !== me.id && !deps.hub.isOnline(id));
    void deps.push(offline, {
      title: me.name,
      body: body.body ? body.body.slice(0, 120) : "Te ha enviado una foto",
      url: me.role === "coach" ? "/app/chat" : `/coach/chat?cliente=${clientId}`,
      tag: `chat-${clientId}`,
    });
    return msg;
  }

  /**
   * Marca la conversación como leída. La hora la pone SIEMPRE Postgres (now() o la del propio mensaje):
   * los mensajes también llevan hora de la BD, y mezclarla con el reloj de la app da no leídos fantasma si difieren.
   */
  async function markRead(me: AuthUser, clientId: string, at?: Date) {
    const value = at ?? sql`now()`;
    const [row] = await db
      .insert(conversationReads)
      .values({ clientId, userId: me.id, lastReadAt: value as Date })
      .onConflictDoUpdate({ target: [conversationReads.clientId, conversationReads.userId], set: { lastReadAt: sql`greatest(${conversationReads.lastReadAt}, excluded.last_read_at)` } })
      .returning({ at: conversationReads.lastReadAt });
    deps.hub.send(await participants(me.studioId, clientId), { type: "message.read", clientId, readerId: me.id, at: row!.at.toISOString() });
  }

  const sendLimit = { rateLimit: { max: 60, timeWindow: "1 minute", keyGenerator: (req: FastifyRequest) => req.user?.id ?? req.ip } };

  // ── Entrenador ──
  api.get("/conversations", { schema: { tags: ["mensajes"], response: { 200: z.array(Conversation) } } }, async (req) => {
    const u = requireCoach(req);
    const clients = await db
      .select()
      .from(clientProfiles)
      .where(and(eq(clientProfiles.studioId, u.studioId), inArray(clientProfiles.status, ["active", "no_account", "invited"])));
    const last = await db.execute<{ client_id: string; id: string }>(sql`
      select distinct on (client_id) client_id, id from messages where studio_id = ${u.studioId} order by client_id, created_at desc`);
    const lastIds = Array.from(last as unknown as { client_id: string; id: string }[]).map((r) => r.id);
    const lastRows = lastIds.length ? await db.select({ m: messages, name: users.name }).from(messages).leftJoin(users, eq(users.id, messages.senderId)).where(inArray(messages.id, lastIds)) : [];
    const unread = await db.execute<{ client_id: string; n: number }>(sql`
      select m.client_id, count(*)::int as n from messages m
      left join conversation_reads r on r.client_id = m.client_id and r.user_id = ${u.id}
      where m.studio_id = ${u.studioId} and m.from_coach = false and (r.last_read_at is null or m.created_at > r.last_read_at)
      group by m.client_id`);
    const unreadBy = new Map(Array.from(unread as unknown as { client_id: string; n: number }[]).map((r) => [r.client_id, r.n]));
    const lastBy = new Map(lastRows.map((r) => [r.m.clientId, toMessage(r.m, r.name ?? "")]));
    return clients
      .map((c) => ({ clientId: c.id, clientName: c.name, hasAccount: Boolean(c.userId), lastMessage: lastBy.get(c.id) ?? null, unread: unreadBy.get(c.id) ?? 0 }))
      .sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? "") || a.clientName.localeCompare(b.clientName));
  });

  api.get("/conversations/:clientId/messages", { schema: { tags: ["mensajes"], params: ClientParams, querystring: MessagesQuery, response: { 200: MessagePage } } }, async (req) => {
    const u = requireCoach(req);
    await clientOf(u.studioId, req.params.clientId);
    return page(req.params.clientId, u, req.query);
  });

  api.post(
    "/conversations/:clientId/messages",
    { schema: { tags: ["mensajes"], params: ClientParams, body: SendMessageInput, response: { 200: Message } }, config: sendLimit },
    async (req) => {
      const u = requireCoach(req);
      const c = await clientOf(u.studioId, req.params.clientId);
      if (!c.userId) throw new HttpError(409, "no_account", "Este cliente aún no tiene cuenta en la app");
      return send(u, c.id, req.body);
    },
  );

  api.post("/conversations/:clientId/read", { schema: { tags: ["mensajes"], params: ClientParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    await clientOf(u.studioId, req.params.clientId);
    await markRead(u, req.params.clientId);
    return { ok: true as const };
  });

  // ── Cliente ──
  api.get("/me/messages", { schema: { tags: ["mensajes"], querystring: MessagesQuery, response: { 200: MessagePage } } }, async (req) => {
    const c = requireActiveClient(req);
    return page(c.clientId, c, req.query);
  });
  api.post("/me/messages", { schema: { tags: ["mensajes"], body: SendMessageInput, response: { 200: Message } }, config: sendLimit }, async (req) => {
    const c = requireActiveClient(req);
    return send(c, c.clientId, req.body);
  });
  api.post("/me/messages/read", { schema: { tags: ["mensajes"], response: { 200: Ok } } }, async (req) => {
    const c = requireActiveClient(req);
    await markRead(c, c.clientId);
    return { ok: true as const };
  });
  api.get("/me/unread", { schema: { tags: ["mensajes"], response: { 200: z.object({ unread: z.number() }) } } }, async (req) => {
    const c = requireActiveClient(req);
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .leftJoin(conversationReads, and(eq(conversationReads.clientId, messages.clientId), eq(conversationReads.userId, c.id)))
      .where(and(eq(messages.clientId, c.clientId), eq(messages.fromCoach, true), sql`(${conversationReads.lastReadAt} is null or ${messages.createdAt} > ${conversationReads.lastReadAt})`));
    return { unread: r?.n ?? 0 };
  });

  // ── Fotos ──
  /** Sube una foto para la conversación de `clientId` (el cliente solo a la suya). Devuelve su id. */
  api.post(
    "/media",
    { schema: { tags: ["mensajes"], querystring: z.object({ clientId: z.string().uuid().optional() }), response: { 200: z.object({ id: z.string() }) } }, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req) => {
      const u = requireUser(req);
      let clientId: string;
      if (u.role === "coach") {
        if (!req.query.clientId) throw new HttpError(400, "validation", "Falta el cliente");
        clientId = (await clientOf(u.studioId, req.query.clientId)).id;
      } else clientId = requireActiveClient(req).clientId;
      const file = await req.file({ limits: { fileSize: MAX_IMAGE, files: 1 } });
      if (!file) throw new HttpError(400, "validation", "No llega ninguna foto");
      const buf = await file.toBuffer().catch(() => {
        throw new HttpError(413, "too_large", "La foto pesa demasiado (máximo 8 MB)");
      });
      const mime = sniffImage(buf);
      if (!mime) throw new HttpError(415, "bad_type", "Solo se admiten fotos JPG, PNG, WEBP o GIF");
      const [m] = await db.insert(media).values({ studioId: u.studioId, uploaderId: u.id, clientId, mime, size: buf.length }).returning();
      await mkdir(deps.mediaDir, { recursive: true });
      await writeFile(join(deps.mediaDir, m!.id), buf, { mode: 0o600 });
      return { id: m!.id };
    },
  );

  /** Sirve una foto solo a quien participa en su conversación. */
  app.get("/media/:id", async (req, reply) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [m] = await db.select().from(media).where(and(eq(media.id, id), eq(media.studioId, u.studioId)));
    // El cliente ve lo de su conversación/progreso y los PDF de la biblioteca compartidos con él.
    const clientMayView = async () =>
      Boolean(u.clientId) && m!.clientId !== undefined && (m!.clientId === u.clientId || (m!.clientId === null && (await resourceVisible(db, u.studioId, u.clientId!, m!.id))));
    if (!m || (u.role === "client" && !(await clientMayView()))) throw notFound("Foto");
    const path = join(deps.mediaDir, m.id);
    if (!existsSync(path)) throw notFound("Foto");
    return reply
      .header("Content-Type", m.mime)
      .header("Cache-Control", "private, max-age=31536000, immutable")
      .header("Content-Disposition", "inline")
      .send(createReadStream(path));
  });

  // ── Avisos push ──
  api.get("/push/key", { schema: { tags: ["mensajes"], response: { 200: z.object({ key: z.string().nullable() }) } } }, async () => ({ key: deps.vapidPublicKey ?? null }));
  api.post("/push/subscriptions", { schema: { tags: ["mensajes"], body: PushSubscriptionInput, response: { 200: Ok } } }, async (req) => {
    const u = requireUser(req);
    const b = req.body;
    await db
      .insert(pushSubscriptions)
      .values({ userId: u.id, endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: u.id, p256dh: b.keys.p256dh, auth: b.keys.auth } });
    return { ok: true as const };
  });
  api.delete("/push/subscriptions", { schema: { tags: ["mensajes"], body: z.object({ endpoint: z.string().max(1000) }), response: { 200: Ok } } }, async (req) => {
    const u = requireUser(req);
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, u.id), eq(pushSubscriptions.endpoint, req.body.endpoint)));
    return { ok: true as const };
  });

}
