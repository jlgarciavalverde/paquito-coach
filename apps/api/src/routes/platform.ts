import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { and, asc, count, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import {
  AdminStudio, AdminStudioUpdate, AdminSummary, BillingCheckoutInput, ClientErrorInput, ErrorReport, PLANS, PlatformInfo, RedirectUrl, StudioBilling, TRIAL_DAYS, publicPlans, studioAccess,
  type PlanId,
} from "@coach/shared";
import { auditLog, clientProfiles, errorReports, studios, users } from "../db/schema";
import { recordError } from "../lib/error-log";
import { audit } from "../lib/audit";
import { HttpError, notFound } from "../lib/errors";
import { activeClients } from "../lib/plan";
import { requireCoach, requirePlatformAdmin } from "../lib/session";
import type { PaymentGateway } from "../lib/stripe";
import { typed, type Ctx } from "./ctx";

type StudioRow = typeof studios.$inferSelect;
const iso = (d: Date | null) => d?.toISOString() ?? null;

/**
 * S1 (ADR 0018): la plataforma cobra a cada estudio una cuota mensual con Stripe Billing (la cuenta de Stripe de la
 * plataforma). Devuelve el manejador de eventos de Stripe que son de la plataforma (`metadata.scope = "platform"` o una
 * suscripción conocida); el webhook general se lo pasa primero.
 */
export function registerPlatform(app: FastifyInstance, { db, cfg }: Ctx, deps: { gateway: PaymentGateway | null }) {
  const api = typed(app);
  const gw = deps.gateway;

  api.get("/platform", { schema: { tags: ["plataforma"], response: { 200: PlatformInfo } } }, async (_req, reply) => {
    reply.header("Cache-Control", "no-cache");
    return {
      name: cfg.platformName,
      legalName: cfg.platformLegalName,
      taxId: cfg.platformTaxId,
      legalAddress: cfg.platformAddress,
      contactEmail: cfg.platformEmail,
      plans: publicPlans(),
      trialDays: TRIAL_DAYS,
      signupOpen: cfg.signupOpen && !cfg.demoMode,
    };
  });

  // ── Plan del estudio (entrenador) ──
  async function billingOf(s: StudioRow): Promise<StudioBilling> {
    const p = PLANS[s.plan as PlanId];
    return {
      plan: s.plan,
      planLabel: p.label,
      status: s.billingStatus,
      access: studioAccess(s),
      trialEndsAt: iso(s.trialEndsAt),
      currentPeriodEnd: iso(s.currentPeriodEnd),
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      maxClients: p.maxClients,
      activeClients: await activeClients(db, s.id),
      canPay: Boolean(gw) && !cfg.demoMode,
      hasPortal: Boolean(gw && s.platformCustomerId),
      plans: publicPlans(),
    };
  }
  const own = async (studioId: string) => {
    const [s] = await db.select().from(studios).where(eq(studios.id, studioId));
    if (!s) throw notFound("Estudio");
    return s;
  };

  api.get("/studio/billing", { schema: { tags: ["plataforma"], response: { 200: StudioBilling } } }, async (req, reply) => {
    const u = requireCoach(req);
    reply.header("Cache-Control", "no-store");
    return billingOf(await own(u.studioId));
  });

  /** Elegir plan: página de pago de Stripe (suscripción mensual). Cambiar de un plan de pago a otro se hace en el portal. */
  api.post("/studio/billing/checkout", { schema: { tags: ["plataforma"], body: BillingCheckoutInput, response: { 200: RedirectUrl } }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const u = requireCoach(req);
    if (!gw || cfg.demoMode) throw new HttpError(409, "payments_off", "El pago con tarjeta aún no está disponible. Escríbenos y te activamos el plan.");
    const s = await own(u.studioId);
    if (s.billingStatus === "active" && s.platformSubscriptionId) throw new HttpError(409, "already_subscribed", "Ya tienes un plan de pago. Para cambiarlo, abre «Gestionar suscripción».");
    const plan = req.body.plan;
    const n = await activeClients(db, s.id);
    const limit = PLANS[plan].maxClients;
    if (limit !== null && n > limit) throw new HttpError(409, "too_many_clients", `Tienes ${n} clientes y el plan ${PLANS[plan].label} permite ${limit}. Elige un plan mayor o archiva a algunos antes.`);
    const customer = await customerOf(s, u.email);
    const back = `${cfg.publicUrl}/coach/plan`;
    const meta = { scope: "platform", studioId: s.id, plan };
    const c = await gw.createSubscriptionCheckout({
      customerId: customer,
      description: `${cfg.platformName} · Plan ${PLANS[plan].label}`,
      amountCents: PLANS[plan].priceCents,
      successUrl: `${back}?pago=ok`,
      cancelUrl: back,
      metadata: meta,
    });
    await audit(db, req, "platform.checkout", { type: "studio", id: s.id }, { plan });
    return { url: c.url };
  });

  api.post("/studio/billing/portal", { schema: { tags: ["plataforma"], response: { 200: RedirectUrl } } }, async (req) => {
    const u = requireCoach(req);
    const s = await own(u.studioId);
    if (!gw || !s.platformCustomerId) throw new HttpError(409, "no_portal", "Todavía no tienes ninguna suscripción.");
    return { url: await gw.portalUrl(s.platformCustomerId, `${cfg.publicUrl}/coach/plan`) };
  });

  /** Cliente de Stripe del estudio (se crea la primera vez; con cerrojo, dos clics no crean dos). */
  async function customerOf(s: StudioRow, email: string) {
    if (s.platformCustomerId) return s.platformCustomerId;
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"platform-customer:" + s.id}))`);
      const [again] = await tx.select({ id: studios.platformCustomerId }).from(studios).where(eq(studios.id, s.id));
      if (again?.id) return again.id;
      const id = await gw!.ensureCustomer({ name: s.legalName || s.name, email, metadata: { scope: "platform", studioId: s.id } });
      await tx.update(studios).set({ platformCustomerId: id }).where(eq(studios.id, s.id));
      return id;
    });
  }

  // ── Administración de la plataforma ──
  async function adminRows(): Promise<AdminStudio[]> {
    const rows = await db.select().from(studios).orderBy(desc(studios.createdAt)).limit(500);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const coaches = await db
      .select({ studioId: users.studioId, name: users.name, email: users.email })
      .from(users)
      .where(and(inArray(users.studioId, ids), eq(users.role, "coach"), isNull(users.deletedAt)))
      .orderBy(asc(users.createdAt));
    const clients = await db
      .select({ studioId: clientProfiles.studioId, n: count() })
      .from(clientProfiles)
      .where(and(inArray(clientProfiles.studioId, ids), inArray(clientProfiles.status, ["active", "invited", "no_account"])))
      .groupBy(clientProfiles.studioId);
    const last = await db.select({ studioId: auditLog.studioId, at: max(auditLog.createdAt) }).from(auditLog).where(inArray(auditLog.studioId, ids)).groupBy(auditLog.studioId);
    return rows.map((s) => {
      const c = coaches.find((x) => x.studioId === s.id);
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        coachName: c?.name ?? "",
        coachEmail: c?.email ?? "",
        plan: s.plan,
        status: s.billingStatus,
        access: studioAccess(s),
        trialEndsAt: iso(s.trialEndsAt),
        suspended: Boolean(s.suspendedAt),
        activeClients: clients.find((x) => x.studioId === s.id)?.n ?? 0,
        createdAt: s.createdAt.toISOString(),
        lastActivityAt: iso(last.find((x) => x.studioId === s.id)?.at ?? null),
      };
    });
  }

  api.get("/admin/studios", { schema: { tags: ["administración"], response: { 200: z.array(AdminStudio) } } }, async (req, reply) => {
    requirePlatformAdmin(req);
    reply.header("Cache-Control", "no-store");
    return adminRows();
  });

  api.get("/admin/summary", { schema: { tags: ["administración"], response: { 200: AdminSummary } } }, async (req) => {
    requirePlatformAdmin(req);
    const rows = await db.select().from(studios);
    const paying = rows.filter((s) => s.billingStatus === "active" && PLANS[s.plan as PlanId].priceCents > 0);
    const [c] = await db.select({ n: count() }).from(clientProfiles).where(inArray(clientProfiles.status, ["active", "invited", "no_account"]));
    return {
      studios: rows.length,
      paying: paying.length,
      trial: rows.filter((s) => s.billingStatus === "trial" && studioAccess(s) === "ok").length,
      locked: rows.filter((s) => studioAccess(s) === "locked").length,
      activeClients: c?.n ?? 0,
      mrr: paying.reduce((sum, s) => sum + PLANS[s.plan as PlanId].priceCents, 0) / 100,
    };
  });

  /** Cambiar el plan a mano (cortesías, fundadores), alargar la prueba o suspender. Queda en la auditoría. */
  api.patch("/admin/studios/:id", { schema: { tags: ["administración"], params: z.object({ id: z.string().uuid() }), body: AdminStudioUpdate, response: { 200: AdminStudio } } }, async (req) => {
    requirePlatformAdmin(req);
    const [s] = await db.select().from(studios).where(eq(studios.id, req.params.id));
    if (!s) throw notFound("Estudio");
    const b = req.body;
    const set: Partial<StudioRow> = {};
    if (b.plan) {
      set.plan = b.plan;
      // Un plan puesto a mano no se cobra: cortesía (o prueba, si se vuelve a «prueba»). Si tiene suscripción en Stripe, se
      // gestiona allí; aquí solo cambia lo que la app permite.
      if (!s.platformSubscriptionId || b.plan === "fundador") set.billingStatus = b.plan === "prueba" ? "trial" : "comp";
    }
    if (b.trialEndsOn) {
      set.trialEndsAt = new Date(`${b.trialEndsOn}T23:59:59Z`);
      if (!b.plan && !s.platformSubscriptionId) {
        set.plan = "prueba";
        set.billingStatus = "trial";
      }
    }
    if (b.suspended !== undefined) set.suspendedAt = b.suspended ? (s.suspendedAt ?? new Date()) : null;
    if (Object.keys(set).length > 0) await db.update(studios).set(set).where(eq(studios.id, s.id));
    await audit(db, req, "platform.admin.studio_update", { type: "studio", id: s.id }, b);
    const row = (await adminRows()).find((r) => r.id === s.id);
    if (!row) throw notFound("Estudio");
    return row;
  });

  // ── Registro de errores (Q1) ──
  /** La web informa de un fallo (sin sesión también: una pantalla en blanco al entrar es justo lo que hay que ver). */
  api.post("/client-errors", { schema: { tags: ["plataforma"], body: ClientErrorInput, response: { 204: z.null() } }, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = req.body;
    await recordError(db, { source: "web", kind: b.kind, message: b.message, stack: b.stack, path: b.path, version: b.version, userAgent: String(req.headers["user-agent"] ?? ""), requestId: b.requestId ?? null });
    return reply.code(204).send(null);
  });
  const toReport = (r: typeof errorReports.$inferSelect): ErrorReport => ({
    id: r.id, source: r.source, kind: r.kind, message: r.message, stack: r.stack, path: r.path, version: r.version, userAgent: r.userAgent,
    lastRequestId: r.lastRequestId, count: r.count, firstSeen: r.firstSeen.toISOString(), lastSeen: r.lastSeen.toISOString(), resolved: Boolean(r.resolvedAt),
  });
  api.get("/admin/errors", { schema: { tags: ["administración"], querystring: z.object({ todos: z.coerce.boolean().optional() }), response: { 200: z.array(ErrorReport) } } }, async (req, reply) => {
    requirePlatformAdmin(req);
    reply.header("Cache-Control", "no-store");
    const rows = await db.select().from(errorReports).where(req.query.todos ? undefined : isNull(errorReports.resolvedAt)).orderBy(desc(errorReports.lastSeen)).limit(200);
    return rows.map(toReport);
  });
  api.post("/admin/errors/:id/resolve", { schema: { tags: ["administración"], params: z.object({ id: z.string().uuid() }), response: { 200: ErrorReport } } }, async (req) => {
    requirePlatformAdmin(req);
    const [r] = await db.update(errorReports).set({ resolvedAt: new Date() }).where(eq(errorReports.id, req.params.id)).returning();
    if (!r) throw notFound("Error");
    return toReport(r);
  });

  // ── Eventos de Stripe de la plataforma ──
  const subId = (x: unknown) => (typeof x === "string" ? x : ((x as { id?: string } | null)?.id ?? null));
  const periodEnd = (sub: Record<string, any>) => {
    const t = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
    return typeof t === "number" ? new Date(t * 1000) : null;
  };
  const isPlan = (p: unknown): p is PlanId => typeof p === "string" && p in PLANS;

  /** true si el evento era de la plataforma (ya atendido); false para que lo atiendan los cobros de los estudios. */
  return async function platformEvent(ev: Stripe.Event): Promise<boolean> {
    switch (ev.type) {
      case "checkout.session.completed": {
        const s = ev.data.object;
        if (s.metadata?.scope !== "platform") return false;
        const studioId = s.metadata.studioId;
        const plan = s.metadata.plan;
        if (!studioId || !isPlan(plan) || s.mode !== "subscription") return true;
        // El importe tiene que ser el del plan que fijó el servidor.
        if (s.amount_total !== null && s.amount_total !== PLANS[plan].priceCents) return true;
        await db
          .update(studios)
          .set({ plan, billingStatus: "active", platformSubscriptionId: subId(s.subscription), platformCustomerId: subId(s.customer), cancelAtPeriodEnd: false, suspendedAt: null })
          .where(eq(studios.id, studioId));
        return true;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = ev.data.object as unknown as Record<string, any>;
        const [s] = await db.select().from(studios).where(eq(studios.platformSubscriptionId, String(sub.id)));
        if (!s && sub.metadata?.scope !== "platform") return false;
        if (!s) return true;
        const status = ev.type === "customer.subscription.deleted" ? "canceled" : String(sub.status);
        const billingStatus = status === "active" || status === "trialing" ? "active" : status === "canceled" || status === "incomplete_expired" ? "canceled" : "past_due";
        // Si en el portal ha cambiado de plan, el importe dice cuál es.
        const amount = sub.items?.data?.[0]?.price?.unit_amount;
        const plan = (Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]).find(([, p]) => p.public && p.priceCents === amount)?.[0] ?? s.plan;
        await db
          .update(studios)
          .set({ billingStatus, plan, currentPeriodEnd: periodEnd(sub), cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end) })
          .where(eq(studios.id, s.id));
        return true;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = ev.data.object as unknown as Record<string, any>;
        const sid = subId(inv.subscription) ?? subId(inv.parent?.subscription_details?.subscription);
        if (!sid) return false;
        const [s] = await db.select().from(studios).where(eq(studios.platformSubscriptionId, sid));
        if (!s) return false;
        await db.update(studios).set({ billingStatus: ev.type === "invoice.paid" ? "active" : "past_due" }).where(eq(studios.id, s.id));
        return true;
      }
      default:
        return false;
    }
  };
}
