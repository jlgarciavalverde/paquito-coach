import type { FastifyInstance, FastifyReply } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type Stripe from "stripe";
import { Payment, PaymentLinkInput, PaymentsInfo, Price, PriceInput, fromCents, toCents } from "@coach/shared";
import { clientProfiles, payments, prices, sessionPacks, stripeEvents, users } from "../db/schema";
import { HttpError, notFound } from "../lib/errors";
import { audit } from "../lib/audit";
import type { PaymentGateway } from "../lib/stripe";
import type { PushSender } from "../lib/push";
import { madridClock } from "../lib/scheduler";
import { requireActiveClient, requireCoach, requireUser } from "../lib/session";
import { typed, type Ctx } from "./ctx";

const IdParams = z.object({ id: z.string().uuid() });
type PriceRow = typeof prices.$inferSelect;
type PayRow = typeof payments.$inferSelect;
const toPrice = (p: PriceRow): Price => ({ id: p.id, name: p.name, kind: p.kind, amount: fromCents(p.amountCents), sessions: p.sessions, validDays: p.validDays, active: p.active });
const toPayment = (p: PayRow, clientName: string): Payment => ({
  id: p.id,
  clientId: p.clientId,
  clientName,
  kind: p.kind,
  description: p.description,
  amount: fromCents(p.amountCents),
  status: p.status,
  url: p.status === "pending" && p.checkoutUrl && p.checkoutExpiresAt && p.checkoutExpiresAt > new Date() ? p.checkoutUrl : null,
  receiptUrl: p.receiptUrl,
  createdAt: p.createdAt.toISOString(),
  paidAt: p.paidAt?.toISOString() ?? null,
});
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * C1: cobros con Stripe Checkout. La app nunca ve una tarjeta: crea el cobro con el importe que fija el servidor, manda al
 * cliente a la página de Stripe y da el pago por hecho solo cuando llega el webhook firmado.
 */
export function registerPayments(app: FastifyInstance, { db, cfg }: Ctx, deps: { gateway: PaymentGateway | null; push: PushSender }) {
  const api = typed(app);
  const gw = deps.gateway;
  const need = () => {
    if (!gw) throw new HttpError(409, "payments_off", cfg.demoMode ? "Los cobros no están disponibles en la demo." : "Los cobros no están configurados todavía (faltan las claves de Stripe en el servidor).");
    return gw;
  };

  async function customerOf(clientId: string) {
    const [c] = await db
      .select({ id: clientProfiles.id, name: clientProfiles.name, email: clientProfiles.email, customer: clientProfiles.stripeCustomerId, studioId: clientProfiles.studioId, userEmail: users.email })
      .from(clientProfiles)
      .leftJoin(users, eq(users.id, clientProfiles.userId))
      .where(eq(clientProfiles.id, clientId));
    if (!c) throw notFound("Cliente");
    if (c.customer) return { ...c, customer: c.customer };
    const customer = await need().ensureCustomer({ name: c.name, email: c.userEmail ?? c.email, metadata: { clientId: c.id, studioId: c.studioId } });
    await db.update(clientProfiles).set({ stripeCustomerId: customer }).where(eq(clientProfiles.id, c.id));
    return { ...c, customer };
  }

  /** Crea el cobro pendiente y su página de pago. */
  async function startPayment(o: { studioId: string; clientId: string; kind: PayRow["kind"]; description: string; amountCents: number; priceId: string | null; createdBy: string; returnPath: string }) {
    const g = need();
    const c = await customerOf(o.clientId);
    const [p] = await db.insert(payments).values({ studioId: o.studioId, clientId: o.clientId, priceId: o.priceId, kind: o.kind, description: o.description, amountCents: o.amountCents, createdBy: o.createdBy }).returning();
    const back = `${cfg.publicUrl}${o.returnPath}`;
    const s = await g.createCheckout({
      customerId: c.customer,
      description: o.description,
      amountCents: o.amountCents,
      successUrl: `${back}${back.includes("?") ? "&" : "?"}pago=ok`,
      cancelUrl: back,
      metadata: { paymentId: p!.id, studioId: o.studioId, clientId: o.clientId },
    });
    const [row] = await db.update(payments).set({ checkoutId: s.id, checkoutUrl: s.url, checkoutExpiresAt: s.expiresAt }).where(eq(payments.id, p!.id)).returning();
    return toPayment(row!, c.name);
  }

  async function ownedPrice(studioId: string, id: string) {
    const [p] = await db.select().from(prices).where(and(eq(prices.id, id), eq(prices.studioId, studioId)));
    if (!p) throw notFound("Tarifa");
    return p;
  }
  const listPayments = async (where: ReturnType<typeof eq>) =>
    (
      await db
        .select({ p: payments, name: clientProfiles.name })
        .from(payments)
        .innerJoin(clientProfiles, eq(clientProfiles.id, payments.clientId))
        .where(where)
        .orderBy(desc(payments.createdAt))
        .limit(500)
    ).map(({ p, name }) => toPayment(p, name));

  api.get("/payments/info", { schema: { tags: ["cobros"], response: { 200: PaymentsInfo } } }, async (req) => {
    requireUser(req);
    return { enabled: Boolean(gw), testMode: gw?.testMode ?? false };
  });

  // ── Tarifas ──
  api.get("/prices", { schema: { tags: ["cobros"], response: { 200: z.array(Price) } } }, async (req) => {
    const u = requireCoach(req);
    return (await db.select().from(prices).where(eq(prices.studioId, u.studioId)).orderBy(prices.kind, prices.amountCents)).map(toPrice);
  });
  const priceValues = (b: PriceInput) => ({
    name: b.name,
    kind: b.kind,
    amountCents: toCents(b.amount),
    sessions: b.kind === "pack" ? b.sessions : b.kind === "session" ? 1 : null,
    validDays: b.kind === "subscription" ? null : b.validDays,
    active: b.active,
  });
  api.post("/prices", { schema: { tags: ["cobros"], body: PriceInput, response: { 200: Price } } }, async (req) => {
    const u = requireCoach(req);
    const [p] = await db.insert(prices).values({ ...priceValues(req.body), studioId: u.studioId }).returning();
    return toPrice(p!);
  });
  api.put("/prices/:id", { schema: { tags: ["cobros"], params: IdParams, body: PriceInput, response: { 200: Price } } }, async (req) => {
    const u = requireCoach(req);
    await ownedPrice(u.studioId, req.params.id);
    const [p] = await db.update(prices).set(priceValues(req.body)).where(eq(prices.id, req.params.id)).returning();
    return toPrice(p!);
  });
  api.get("/me/prices", { schema: { tags: ["cobros"], response: { 200: z.array(Price) } } }, async (req) => {
    const c = requireActiveClient(req);
    if (!gw) return [];
    return (await db.select().from(prices).where(and(eq(prices.studioId, c.studioId), eq(prices.active, true)))).filter((p) => p.kind !== "subscription").map(toPrice);
  });

  // ── Cobrar ──
  api.post(
    "/me/checkout",
    { schema: { tags: ["cobros"], body: z.object({ priceId: z.string().uuid() }), response: { 200: Payment } }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const c = requireActiveClient(req);
      const p = await ownedPrice(c.studioId, req.body.priceId);
      if (!p.active || p.kind === "subscription") throw notFound("Tarifa");
      return startPayment({ studioId: c.studioId, clientId: c.clientId, kind: p.kind, description: p.name, amountCents: p.amountCents, priceId: p.id, createdBy: c.id, returnPath: "/app/pagos" });
    },
  );
  api.post("/clients/:id/payment-links", { schema: { tags: ["cobros"], params: IdParams, body: PaymentLinkInput, response: { 200: Payment } } }, async (req) => {
    const u = requireCoach(req);
    const [c] = await db.select({ id: clientProfiles.id }).from(clientProfiles).where(and(eq(clientProfiles.id, req.params.id), eq(clientProfiles.studioId, u.studioId)));
    if (!c) throw notFound("Cliente");
    const b = req.body;
    const price = b.priceId ? await ownedPrice(u.studioId, b.priceId) : null;
    if (price?.kind === "subscription") throw new HttpError(400, "validation", "Las cuotas mensuales se contratan desde la app del cliente");
    const out = await startPayment({
      studioId: u.studioId,
      clientId: c.id,
      kind: price ? price.kind : "link",
      description: price ? price.name : b.description,
      amountCents: price ? price.amountCents : toCents(b.amount!),
      priceId: price?.id ?? null,
      createdBy: u.id,
      returnPath: "/app/pagos",
    });
    await audit(db, req, "payment.link", { type: "client", id: c.id }, { amount: out.amount });
    return out;
  });
  /** Enlace nuevo para un cobro pendiente cuya página ha caducado (duran 23 h). */
  api.post("/payments/:id/renew", { schema: { tags: ["cobros"], params: IdParams, response: { 200: Payment } } }, async (req) => {
    const u = requireCoach(req);
    const [p] = await db.select().from(payments).where(and(eq(payments.id, req.params.id), eq(payments.studioId, u.studioId)));
    if (!p) throw notFound("Cobro");
    if (p.status !== "pending" && p.status !== "expired") throw new HttpError(409, "not_pending", "Este cobro ya no está pendiente");
    await db.update(payments).set({ status: "expired" }).where(eq(payments.id, p.id));
    return startPayment({ studioId: u.studioId, clientId: p.clientId, kind: p.kind, description: p.description, amountCents: p.amountCents, priceId: p.priceId, createdBy: u.id, returnPath: "/app/pagos" });
  });

  // ── Consultar ──
  api.get("/clients/:id/payments", { schema: { tags: ["cobros"], params: IdParams, response: { 200: z.array(Payment) } } }, async (req) => {
    const u = requireCoach(req);
    return listPayments(and(eq(payments.clientId, req.params.id), eq(payments.studioId, u.studioId))! as ReturnType<typeof eq>);
  });
  api.get("/me/payments", { schema: { tags: ["cobros"], response: { 200: z.array(Payment) } } }, async (req) => {
    const c = requireActiveClient(req);
    return listPayments(eq(payments.clientId, c.clientId));
  });
  api.get("/payments", { schema: { tags: ["cobros"], response: { 200: z.array(Payment) } } }, async (req) => {
    const u = requireCoach(req);
    return listPayments(eq(payments.studioId, u.studioId));
  });
  /** CSV para el gestor (cobros pagados y devueltos). */
  app.get("/payments.csv", async (req, reply: FastifyReply) => {
    const u = requireCoach(req);
    const rows = (await listPayments(eq(payments.studioId, u.studioId))).filter((p) => p.status === "paid" || p.status === "refunded");
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = ["fecha;cliente;concepto;importe;estado"]
      .concat(rows.map((p) => [p.paidAt?.slice(0, 10) ?? "", esc(p.clientName), esc(p.description), p.amount.toFixed(2).replace(".", ","), p.status === "paid" ? "pagado" : "devuelto"].join(";")))
      .join("\n");
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="cobros-${madridClock(new Date()).date}.csv"`)
      .header("Cache-Control", "no-store")
      .send("﻿" + csv);
  });

  // ── Webhook de Stripe ──
  async function markPaid(p: PayRow, paymentIntentId: string | null) {
    if (p.status === "paid") return;
    const today = madridClock(new Date()).date;
    await db.transaction(async (tx) => {
      let packId: string | null = p.packId;
      if (!packId && p.priceId) {
        const [pr] = await tx.select().from(prices).where(eq(prices.id, p.priceId));
        if (pr && (pr.kind === "pack" || pr.kind === "session")) {
          const [pack] = await tx
            .insert(sessionPacks)
            .values({
              studioId: p.studioId,
              clientId: p.clientId,
              name: pr.name,
              total: pr.sessions ?? 1,
              expires: pr.validDays ? addDays(today, pr.validDays) : null,
              price: fromCents(p.amountCents),
              paid: true,
              notes: "Pagado en la app",
            })
            .returning();
          packId = pack!.id;
        }
      }
      await tx.update(payments).set({ status: "paid", paidAt: new Date(), paymentIntentId, packId }).where(eq(payments.id, p.id));
    });
    if (paymentIntentId && gw) {
      const url = await gw.receiptUrl(paymentIntentId).catch(() => null);
      if (url) await db.update(payments).set({ receiptUrl: url }).where(eq(payments.id, p.id));
    }
    const [c] = await db.select({ name: clientProfiles.name }).from(clientProfiles).where(eq(clientProfiles.id, p.clientId));
    const coaches = await db.select({ id: users.id }).from(users).where(and(eq(users.studioId, p.studioId), eq(users.role, "coach"), isNull(users.deletedAt)));
    void deps.push(coaches.map((x) => x.id), { title: "Pago recibido", body: `${c?.name ?? "Un cliente"} ha pagado ${fromCents(p.amountCents).toLocaleString("es-ES")} € (${p.description}).`, url: "/coach/informes", tag: "pago" }).catch(() => {});
  }

  async function handle(ev: Stripe.Event) {
    const byCheckout = async (s: Stripe.Checkout.Session) => {
      const id = s.metadata?.paymentId;
      const [p] = id ? await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.checkoutId, s.id))) : [];
      return p ?? null;
    };
    const pi = (x: string | Stripe.PaymentIntent | null) => (typeof x === "string" ? x : (x?.id ?? null));
    switch (ev.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = ev.data.object;
        const p = await byCheckout(s);
        if (!p) return;
        // El importe cobrado tiene que ser el que fijó el servidor.
        if (s.amount_total !== p.amountCents || (s.currency ?? "eur") !== "eur") {
          await db.update(payments).set({ status: "failed" }).where(eq(payments.id, p.id));
          return;
        }
        if (s.payment_status === "paid") await markPaid(p, pi(s.payment_intent));
        return;
      }
      case "checkout.session.async_payment_failed": {
        const p = await byCheckout(ev.data.object);
        if (p && p.status === "pending") await db.update(payments).set({ status: "failed" }).where(eq(payments.id, p.id));
        return;
      }
      case "checkout.session.expired": {
        const p = await byCheckout(ev.data.object);
        if (p && p.status === "pending") await db.update(payments).set({ status: "expired" }).where(eq(payments.id, p.id));
        return;
      }
      case "charge.refunded": {
        const id = pi(ev.data.object.payment_intent);
        if (!id || !ev.data.object.refunded) return;
        const [p] = await db.update(payments).set({ status: "refunded" }).where(eq(payments.paymentIntentId, id)).returning();
        // El bono pagado con ese cobro deja de valer (se archiva; lo ya descontado se conserva).
        if (p?.packId) await db.update(sessionPacks).set({ archivedAt: new Date() }).where(eq(sessionPacks.id, p.packId));
        return;
      }
    }
  }

  // Cuerpo crudo solo para esta ruta: la firma se calcula sobre los bytes exactos.
  app.register(async (hook) => {
    hook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    hook.post("/stripe/webhook", { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, async (req, reply) => {
      if (!gw) return reply.code(404).send({ error: "not_found", message: "No encontrado" });
      const sig = req.headers["stripe-signature"];
      let ev: Stripe.Event;
      try {
        ev = gw.verify(req.body as Buffer, String(sig ?? ""));
      } catch {
        return reply.code(400).send({ error: "bad_signature", message: "Firma no válida" });
      }
      // Idempotente: Stripe puede repetir el mismo evento.
      const fresh = await db.insert(stripeEvents).values({ id: ev.id, type: ev.type }).onConflictDoNothing().returning();
      if (fresh.length === 0) return { received: true, duplicate: true };
      try {
        await handle(ev);
      } catch (e) {
        await db.delete(stripeEvents).where(eq(stripeEvents.id, ev.id)); // que Stripe lo reintente
        throw e;
      }
      return { received: true };
    });
  });

}
