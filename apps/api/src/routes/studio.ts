import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { JoinCode, Lead, LeadInput, LegalInfo, Ok, PublicStudio, StudioProfile, fromCents } from "@coach/shared";
import { leads, media, prices, studios, users } from "../db/schema";
import { audit } from "../lib/audit";
import { HttpError, notFound } from "../lib/errors";
import { brandOf } from "../lib/mail";
import { mailTemplates } from "../lib/mail-templates";
import type { PushSender } from "../lib/push";
import { assertQuota } from "../lib/quota";
import { requireCoach } from "../lib/session";
import { sniffImage } from "../lib/sniff";
import { newJoinCode } from "../lib/tokens";
import { typed, type Ctx } from "./ctx";

type StudioRow = typeof studios.$inferSelect;
const toProfile = (s: StudioRow): StudioProfile => ({
  name: s.name, accent: s.accent, published: s.published, tagline: s.tagline, bio: s.bio, specialties: s.specialties, location: s.location, hours: s.hours,
  phone: s.phone, contactEmail: s.contactEmail, instagram: s.instagram, legalName: s.legalName, taxId: s.taxId, legalAddress: s.legalAddress,
});

/** El estudio de esta instalación (hoy, uno por instalación: el de Paquito). Las rutas públicas hablan de él. */
export async function mainStudio(db: Ctx["db"]) {
  const [s] = await db.select().from(studios).orderBy(asc(studios.createdAt)).limit(1);
  return s ?? null;
}
async function coachOf(db: Ctx["db"], studioId: string) {
  const [c] = await db.select({ id: users.id, name: users.name, email: users.email, notify: users.emailNotifications }).from(users).where(and(eq(users.studioId, studioId), eq(users.role, "coach"), isNull(users.deletedAt))).orderBy(asc(users.createdAt)).limit(1);
  return c ?? null;
}

const MAX_PHOTO = 8 * 1024 * 1024;

export function registerStudio(app: FastifyInstance, { db, cfg, mail }: Ctx, deps: { push: PushSender; mediaDir: string }) {
  const api = typed(app);
  const link = (code: string) => ({ code, url: `${cfg.publicUrl}/registro?codigo=${code}` });

  api.get("/studio/join-code", { schema: { tags: ["estudio"], response: { 200: JoinCode } } }, async (req) => {
    const u = requireCoach(req);
    const [st] = await db.select({ code: studios.joinCode }).from(studios).where(eq(studios.id, u.studioId));
    return link(st!.code);
  });

  /** Cambia el código público (el anterior deja de funcionar al instante). */
  api.post("/studio/join-code/rotate", { schema: { tags: ["estudio"], response: { 200: JoinCode } } }, async (req) => {
    const u = requireCoach(req);
    const code = newJoinCode();
    await db.update(studios).set({ joinCode: code }).where(eq(studios.id, u.studioId));
    await audit(db, req, "studio.join_code.rotate");
    return link(code);
  });

  // ── Perfil, marca y página pública (entrenador) ──
  api.get("/studio/profile", { schema: { tags: ["estudio"], response: { 200: StudioProfile.extend({ hasPhoto: z.boolean() }) } } }, async (req) => {
    const u = requireCoach(req);
    const [s] = await db.select().from(studios).where(eq(studios.id, u.studioId));
    return { ...toProfile(s!), hasPhoto: Boolean(s!.photoMediaId) };
  });
  api.put("/studio/profile", { schema: { tags: ["estudio"], body: StudioProfile, response: { 200: StudioProfile } } }, async (req) => {
    const u = requireCoach(req);
    const b = req.body;
    if (b.published && (!b.tagline || !b.bio)) throw new HttpError(400, "incomplete", "Para publicar la página, escribe al menos la frase de presentación y quién eres.");
    const [s] = await db.update(studios).set({ ...b, instagram: b.instagram.replace(/^@/, ""), specialties: [...new Set(b.specialties)] }).where(eq(studios.id, u.studioId)).returning();
    await audit(db, req, "studio.profile.update", { type: "studio", id: u.studioId }, { published: b.published });
    return toProfile(s!);
  });

  api.post("/studio/photo", { schema: { tags: ["estudio"], response: { 200: Ok } }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const u = requireCoach(req);
    const file = await req.file({ limits: { fileSize: MAX_PHOTO, files: 1 } });
    if (!file) throw new HttpError(400, "validation", "No llega ninguna foto");
    const buf = await file.toBuffer().catch(() => {
      throw new HttpError(413, "too_large", "La foto pesa demasiado (máximo 8 MB)");
    });
    const mime = sniffImage(buf);
    if (!mime || mime === "image/gif") throw new HttpError(415, "bad_type", "Solo se admiten fotos JPG, PNG o WEBP");
    await assertQuota(db, u.studioId, null, buf.length);
    const [m] = await db.insert(media).values({ studioId: u.studioId, uploaderId: u.id, clientId: null, mime, size: buf.length }).returning();
    await mkdir(deps.mediaDir, { recursive: true });
    await writeFile(join(deps.mediaDir, m!.id), buf, { mode: 0o600 });
    const [old] = await db.select({ id: studios.photoMediaId }).from(studios).where(eq(studios.id, u.studioId));
    await db.update(studios).set({ photoMediaId: m!.id }).where(eq(studios.id, u.studioId));
    if (old?.id) await removeMedia(old.id);
    return { ok: true as const };
  });
  /** Vista previa en Ajustes (también sin publicar). */
  app.get("/studio/photo", async (req, reply) => {
    const u = requireCoach(req);
    const [s] = await db.select({ id: studios.photoMediaId }).from(studios).where(eq(studios.id, u.studioId));
    const path = s?.id ? join(deps.mediaDir, s.id) : null;
    if (!s?.id || !path || !existsSync(path)) throw notFound("Foto");
    const [m] = await db.select({ mime: media.mime }).from(media).where(eq(media.id, s.id));
    return reply.header("Content-Type", m?.mime ?? "image/jpeg").header("Cache-Control", "private, no-cache").send(createReadStream(path));
  });
  api.delete("/studio/photo", { schema: { tags: ["estudio"], response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    const [old] = await db.select({ id: studios.photoMediaId }).from(studios).where(eq(studios.id, u.studioId));
    await db.update(studios).set({ photoMediaId: null }).where(eq(studios.id, u.studioId));
    if (old?.id) await removeMedia(old.id);
    return { ok: true as const };
  });
  async function removeMedia(id: string) {
    await db.delete(media).where(eq(media.id, id));
    await rm(join(deps.mediaDir, id), { force: true });
  }

  // ── Público (sin sesión) ──
  /** Página pública: solo si el entrenador la ha publicado. */
  api.get("/public/studio", { schema: { tags: ["público"], response: { 200: PublicStudio } } }, async (_req, reply) => {
    const s = await mainStudio(db);
    if (!s?.published) throw notFound("Página");
    const coach = await coachOf(db, s.id);
    const ps = await db.select().from(prices).where(and(eq(prices.studioId, s.id), eq(prices.active, true), eq(prices.public, true))).orderBy(prices.kind, prices.amountCents);
    reply.header("Cache-Control", "no-cache");
    return {
      name: s.name, coachName: coach?.name ?? "", accent: s.accent, tagline: s.tagline, bio: s.bio, specialties: s.specialties, location: s.location, hours: s.hours,
      phone: s.phone, contactEmail: s.contactEmail, instagram: s.instagram, hasPhoto: Boolean(s.photoMediaId),
      prices: ps.map((p) => ({ name: p.name, kind: p.kind, amount: fromCents(p.amountCents), sessions: p.sessions, validDays: p.validDays })),
    };
  });
  app.get("/public/studio/photo", async (_req, reply) => {
    const s = await mainStudio(db);
    if (!s?.published || !s.photoMediaId) throw notFound("Foto");
    const [m] = await db.select().from(media).where(eq(media.id, s.photoMediaId));
    const path = join(deps.mediaDir, s.photoMediaId);
    if (!m || !existsSync(path)) throw notFound("Foto");
    return reply.header("Content-Type", m.mime).header("Cache-Control", "public, max-age=300").header("Content-Disposition", "inline").send(createReadStream(path));
  });
  /** Datos del responsable (aviso legal, términos, privacidad): públicos aunque la página no esté publicada. */
  api.get("/public/legal", { schema: { tags: ["público"], response: { 200: LegalInfo } } }, async () => {
    const s = await mainStudio(db);
    if (!s) throw notFound("Estudio");
    const coach = await coachOf(db, s.id);
    return { studioName: s.name, legalName: s.legalName || coach?.name || "", taxId: s.taxId, legalAddress: s.legalAddress, contactEmail: s.contactEmail || coach?.email || "" };
  });

  /** «Quiero empezar»: crea una solicitud y avisa al entrenador. Campo trampa + freno por IP contra el spam. */
  api.post("/public/contact", { schema: { tags: ["público"], body: LeadInput, response: { 200: Ok } }, config: { rateLimit: { max: 3, timeWindow: "10 minutes" } } }, async (req) => {
    const s = await mainStudio(db);
    if (!s?.published) throw notFound("Página");
    const b = req.body;
    if (b.website) return { ok: true as const }; // un robot: se le dice que sí y no se guarda nada
    // Si la misma dirección ya escribió en las últimas 24 h, no se duplica.
    const [dup] = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.studioId, s.id), sql`lower(${leads.email}) = ${b.email}`, sql`${leads.createdAt} > now() - interval '1 day'`));
    if (dup) return { ok: true as const };
    const coach = await coachOf(db, s.id);
    await db.transaction(async (tx) => {
      await tx.insert(leads).values({ studioId: s.id, name: b.name, email: b.email, phone: b.phone, message: b.message });
      if (coach?.notify) {
        const t = mailTemplates.newLead(await brandOf(db, s.id), { coachName: coach.name, name: b.name, email: b.email, phone: b.phone, message: b.message, url: `${cfg.publicUrl}/coach/clientes` });
        await mail.enqueue(tx, { kind: "lead", to: coach.email, userId: coach.id, studioId: s.id, ...t });
      }
    });
    mail.kick();
    if (coach) void deps.push([coach.id], { title: "Nueva solicitud", body: `${b.name} quiere empezar contigo.`, url: "/coach/clientes", tag: "solicitud" }).catch(() => {});
    return { ok: true as const };
  });

  // ── Solicitudes (entrenador) ──
  api.get("/leads", { schema: { tags: ["estudio"], response: { 200: z.array(Lead) } } }, async (req) => {
    const u = requireCoach(req);
    const rows = await db.select().from(leads).where(and(eq(leads.studioId, u.studioId), isNull(leads.handledAt))).orderBy(desc(leads.createdAt)).limit(100);
    return rows.map((l) => ({ id: l.id, name: l.name, email: l.email, phone: l.phone, message: l.message, createdAt: l.createdAt.toISOString() }));
  });
  /** Atendida (dada de alta o descartada): sale de la lista. */
  api.post("/leads/:id/handle", { schema: { tags: ["estudio"], params: z.object({ id: z.string().uuid() }), response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    const r = await db.update(leads).set({ handledAt: new Date() }).where(and(eq(leads.id, req.params.id), eq(leads.studioId, u.studioId))).returning({ id: leads.id });
    if (r.length === 0) throw notFound("Solicitud");
    return { ok: true as const };
  });
}
