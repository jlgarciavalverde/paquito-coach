import type { FastifyInstance } from "fastify";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { Achievements, Ok, Resource, ResourceInput, StudioReport, packUsable, weekStreaks } from "@coach/shared";
import { appointments, clientProfiles, media, payments, resources, sessionPacks, workouts } from "../db/schema";
import { HttpError, notFound } from "../lib/errors";
import { isPdf } from "../lib/sniff";
import { packsOfMany } from "../lib/packs";
import { assertQuota } from "../lib/quota";
import { progressFromWorkouts } from "../lib/progress";
import { madridClock } from "../lib/scheduler";
import { madridInstant } from "../lib/tz";
import { requireActiveClient, requireCoach } from "../lib/session";
import { typed, type Ctx } from "./ctx";

const IdParams = z.object({ id: z.string().uuid() });
const MAX_PDF = 15 * 1024 * 1024;
type Row = typeof resources.$inferSelect;
const toResource = (r: Row): Resource => ({
  id: r.id,
  title: r.title,
  description: r.description,
  kind: r.kind,
  url: r.url,
  mediaId: r.mediaId,
  forAll: r.forAll,
  clientIds: r.clientIds,
  createdAt: r.createdAt.toISOString(),
});
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));

/** ¿Puede este cliente ver este archivo de la biblioteca? (lo usa GET /media/:id). */
export async function resourceVisible(db: Ctx["db"], studioId: string, clientId: string, mediaId: string) {
  const rows = await db.select().from(resources).where(and(eq(resources.studioId, studioId), eq(resources.mediaId, mediaId)));
  return rows.some((r) => r.forAll || r.clientIds.includes(clientId));
}

/** H4: biblioteca de material para clientes, logros del cliente e informes del estudio. */
export function registerLibrary(app: FastifyInstance, { db, cfg }: Ctx) {
  const api = typed(app);
  const mediaDir = join(cfg.dataDir, "media");

  async function checkClients(studioId: string, ids: string[]) {
    if (ids.length === 0) return;
    const rows = await db.select({ id: clientProfiles.id }).from(clientProfiles).where(and(eq(clientProfiles.studioId, studioId), inArray(clientProfiles.id, ids)));
    if (rows.length !== new Set(ids).size) throw notFound("Cliente");
  }
  async function checkMedia(studioId: string, mediaId: string | null) {
    if (!mediaId) return;
    const [m] = await db.select({ id: media.id }).from(media).where(and(eq(media.id, mediaId), eq(media.studioId, studioId), eq(media.mime, "application/pdf")));
    if (!m) throw new HttpError(400, "bad_media", "El archivo no es válido");
  }
  const clean = (b: ResourceInput) => ({ ...b, url: b.kind === "link" ? b.url : null, mediaId: b.kind === "pdf" ? b.mediaId : null, clientIds: b.forAll ? [] : [...new Set(b.clientIds)] });

  // ── Biblioteca ──
  api.post(
    "/resources/upload",
    { schema: { tags: ["material"], response: { 200: z.object({ id: z.string() }) } }, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) => {
      const u = requireCoach(req);
      const file = await req.file({ limits: { fileSize: MAX_PDF, files: 1 } });
      if (!file) throw new HttpError(400, "validation", "No llega ningún archivo");
      const buf = await file.toBuffer().catch(() => {
        throw new HttpError(413, "too_large", "El PDF pesa demasiado (máximo 15 MB)");
      });
      if (!isPdf(buf)) throw new HttpError(415, "bad_type", "Solo se admiten archivos PDF");
      await assertQuota(db, u.studioId, null, buf.length);
      const [m] = await db.insert(media).values({ studioId: u.studioId, uploaderId: u.id, clientId: null, mime: "application/pdf", size: buf.length }).returning();
      await mkdir(mediaDir, { recursive: true });
      await writeFile(join(mediaDir, m!.id), buf, { mode: 0o600 });
      return { id: m!.id };
    },
  );
  api.get("/resources", { schema: { tags: ["material"], response: { 200: z.array(Resource) } } }, async (req) => {
    const u = requireCoach(req);
    return (await db.select().from(resources).where(eq(resources.studioId, u.studioId)).orderBy(desc(resources.createdAt))).map(toResource);
  });
  api.post("/resources", { schema: { tags: ["material"], body: ResourceInput, response: { 200: Resource } } }, async (req) => {
    const u = requireCoach(req);
    const b = clean(req.body);
    await checkClients(u.studioId, b.clientIds);
    await checkMedia(u.studioId, b.mediaId);
    const [r] = await db.insert(resources).values({ ...b, studioId: u.studioId }).returning();
    return toResource(r!);
  });
  api.put("/resources/:id", { schema: { tags: ["material"], params: IdParams, body: ResourceInput, response: { 200: Resource } } }, async (req) => {
    const u = requireCoach(req);
    const b = clean(req.body);
    await checkClients(u.studioId, b.clientIds);
    await checkMedia(u.studioId, b.mediaId);
    const [r] = await db.update(resources).set(b).where(and(eq(resources.id, req.params.id), eq(resources.studioId, u.studioId))).returning();
    if (!r) throw notFound("Material");
    return toResource(r);
  });
  api.delete("/resources/:id", { schema: { tags: ["material"], params: IdParams, response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    const [r] = await db.delete(resources).where(and(eq(resources.id, req.params.id), eq(resources.studioId, u.studioId))).returning();
    if (!r) throw notFound("Material");
    // El archivo solo se borra si ningún otro material lo usa.
    if (r.mediaId) {
      const [other] = await db.select({ id: resources.id }).from(resources).where(eq(resources.mediaId, r.mediaId)).limit(1);
      if (!other) {
        await db.delete(media).where(eq(media.id, r.mediaId));
        await rm(join(mediaDir, r.mediaId), { force: true });
      }
    }
    return { ok: true as const };
  });
  api.get("/me/resources", { schema: { tags: ["material"], response: { 200: z.array(Resource) } } }, async (req) => {
    const c = requireActiveClient(req);
    const rows = await db.select().from(resources).where(eq(resources.studioId, c.studioId)).orderBy(desc(resources.createdAt));
    return rows.filter((r) => r.forAll || r.clientIds.includes(c.clientId)).map((r) => ({ ...toResource(r), clientIds: [] }));
  });

  // ── Logros ──
  api.get("/me/achievements", { schema: { tags: ["material"], response: { 200: Achievements } } }, async (req) => {
    const c = requireActiveClient(req);
    const today = madridClock(new Date()).date;
    const done = await db
      .select({ id: workouts.id, date: workouts.date, blocks: workouts.blocks, log: workouts.log })
      .from(workouts)
      .where(and(eq(workouts.clientId, c.clientId), eq(workouts.status, "done"), isNotNull(workouts.completedAt)));
    const s = weekStreaks(done.map((w) => w.date), today);
    const since = addDays(today, -30);
    const recentRecords: string[] = [];
    for (const { name, points } of progressFromWorkouts(done).values()) {
      const withE = points.filter((p) => p.e1rm != null);
      if (withE.length < 2) continue;
      const best = Math.max(...withE.map((p) => p.e1rm!));
      const first = withE.findIndex((p) => p.e1rm === best);
      if (first > 0 && withE[first]!.date >= since) recentRecords.push(name);
    }
    return { streakWeeks: s.current, bestStreakWeeks: s.best, totalDone: done.length, recentRecords };
  });

  // ── Informes ──
  api.get("/reports", { schema: { tags: ["material"], response: { 200: StudioReport } } }, async (req) => {
    const u = requireCoach(req);
    const today = madridClock(new Date()).date;
    const thisMonday = mondayOf(today);
    const from8 = addDays(thisMonday, -7 * 8);
    const from4 = addDays(thisMonday, -7 * 4);
    const clients = await db.select({ id: clientProfiles.id, name: clientProfiles.name, status: clientProfiles.status, createdAt: clientProfiles.createdAt }).from(clientProfiles).where(eq(clientProfiles.studioId, u.studioId));
    const active = clients.filter((c) => c.status === "active" || c.status === "no_account");
    const ws = await db
      .select({ clientId: workouts.clientId, date: workouts.date, status: workouts.status })
      .from(workouts)
      .where(and(eq(workouts.studioId, u.studioId), gte(workouts.date, from8), lt(workouts.date, thisMonday)));
    const weekly = Array.from({ length: 8 }, (_, i) => {
      const monday = addDays(from8, i * 7);
      const inWeek = ws.filter((w) => w.date >= monday && w.date < addDays(monday, 7));
      return { monday, done: inWeek.filter((w) => w.status === "done").length, planned: inWeek.length };
    });
    const last4 = ws.filter((w) => w.date >= from4);
    const byClient = active
      .map((c) => {
        const mine = last4.filter((w) => w.clientId === c.id);
        return { clientId: c.id, name: c.name, done: mine.filter((w) => w.status === "done").length, planned: mine.length };
      })
      .filter((c) => c.planned > 0)
      .sort((a, b) => a.done / a.planned - b.done / b.planned);

    const monthStart = `${today.slice(0, 7)}-01`;
    const monthRows = await db
      .select({ status: appointments.status })
      .from(appointments)
      .where(and(eq(appointments.studioId, u.studioId), gte(appointments.startsAt, madridInstant(monthStart, 0)), lt(appointments.startsAt, new Date())));
    const packs = await db.select({ id: sessionPacks.id, clientId: sessionPacks.clientId, price: sessionPacks.price, paid: sessionPacks.paid, createdAt: sessionPacks.createdAt }).from(sessionPacks).where(eq(sessionPacks.studioId, u.studioId));
    const monthStartInstant = madridInstant(monthStart, 0);
    // Solo los cobros que cuentan (pendientes o pagados este mes), no el histórico entero
    const pays = await db
      .select({ amountCents: payments.amountCents, status: payments.status, paidAt: payments.paidAt })
      .from(payments)
      .where(and(eq(payments.studioId, u.studioId), or(eq(payments.status, "pending"), gte(payments.paidAt, monthStartInstant))));
    // Los bonos pagados en la app ya cuentan como cobro: no se suman dos veces.
    const paidInApp = new Set(
      (await db.select({ packId: payments.packId }).from(payments).where(and(eq(payments.studioId, u.studioId), isNotNull(payments.packId)))).map((p) => p.packId),
    );
    let toRenew = 0;
    for (const ps of (await packsOfMany(db, [...new Set(packs.map((p) => p.clientId))])).values()) {
      const live = ps.filter((p) => !p.archived);
      if (live.length && live.filter((p) => packUsable(p, today)).reduce((n, p) => n + p.remaining, 0) <= 1) toRenew++;
    }
    return {
      activeClients: active.length,
      newClients30d: clients.filter((c) => c.createdAt.getTime() > Date.now() - 30 * 86400000).length,
      done4w: last4.filter((w) => w.status === "done").length,
      planned4w: last4.length,
      sessionsMonth: monthRows.filter((a) => a.status === "done").length,
      noShowsMonth: monthRows.filter((a) => a.status === "no_show").length,
      packsToRenew: toRenew,
      paidMonth:
        packs.filter((p) => p.paid && !paidInApp.has(p.id) && p.createdAt >= monthStartInstant).reduce((n, p) => n + (p.price ?? 0), 0) +
        pays.filter((p) => p.status === "paid" && p.paidAt && p.paidAt >= monthStartInstant).reduce((n, p) => n + p.amountCents / 100, 0),
      pendingPayments:
        packs.filter((p) => !p.paid && (p.price ?? 0) > 0).reduce((n, p) => n + (p.price ?? 0), 0) +
        pays.filter((p) => p.status === "pending").reduce((n, p) => n + p.amountCents / 100, 0),
      weekly,
      byClient,
    };
  });
}
