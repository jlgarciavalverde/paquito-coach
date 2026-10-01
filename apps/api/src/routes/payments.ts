import type { FastifyInstance, FastifyReply } from "fastify";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type Stripe from "stripe";
import { Payment, PaymentLinkInput, PaymentsInfo, Price, PriceInput, Subscription, fromCents, toCents } from "@coach/shared";
import { appointments, clientProfiles, payments, prices, sessionPacks, stripeEvents, subscriptions, users } from "../db/schema";
import { HttpError, notFound } from "../lib/errors";
import { audit } from "../lib/audit";
import type { PaymentGateway } from "../lib/stripe";
import type { PushSender } from "../lib/push";
import { madridClock } from "../lib/scheduler";
import { requireActiveClient, requireCoach, requireUser } from "../lib/session";
import { typed, type Ctx } from "./ctx";
import { sendBookingMail } from "../lib/booking-mail";

const IdParams = z.object({ id: z.string().uuid() });
type PriceRow = typeof prices.$inferSelect;
type PayRow = typeof payments.$inferSelect;
const toPrice = (p: PriceRow): Price => ({ id: p.id, name: p.name, kind: p.kind, amount: fromCents(p.amountCents), sessions: p.sessions, validDays: p.validDays, active: p.active, public: p.public });
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
export type Billing = {
  enabled: boolean;
  /** Caduca en Stripe los cobros pendientes de estas citas (reserva cancelada o retención liberada). */
  expireForAppointments: (appointmentIds: string[]) => Promise<void>;
  /** Al borrar un cliente: se borra en Stripe (cancela sus cuotas) y se caducan sus enlaces pendientes. */
  forgetClient: (clientId: string) => Promise<void>;
  startPayment: (o: { studioId: string; clientId: string; kind: "pack" | "session" | "link" | "subscription"; description: string; amountCents: number; priceId: string | null; createdBy: string; returnPath: string; appointmentId?: string }) => Promise<Payment>;
};

type SubRow = typeof subscriptions.$inferSelect;
const toSub = (s: SubRow): Subscription => ({
  id: s.id,
  clientId: s.clientId,
  name: s.name,
  amount: fromCents(s.amountCents),
  status: s.status,
  currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
  cancelAtPeriodEnd: s.cancelAtPeriodEnd,
});

export function registerPayments(app: FastifyInstance, { db, cfg, mail }: Ctx, deps: { gateway: PaymentGateway | null; push: PushSender }): Billing {
  const api = typed(app);
  const gw = deps.gateway;
  const need = () => {
    if (!gw) throw new HttpError(409, "payments_off", cfg.demoMode ? "Los cobros no están disponibles en la demo." : "Los cobros no están configurados todavía (faltan las claves de Stripe en el servidor).");
    return gw;
  };

  /** Cliente de Stripe del cliente (se crea la primera vez). Con cerrojo: dos cobros a la vez no crean dos clientes. */
  async function customerOf(clientId: string) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"stripe-customer:" + clientId}))`);
      const [c] = await tx
      .select({ id: clientProfiles.id, name: clientProfiles.name, email: clientProfiles.email, customer: clientProfiles.stripeCustomerId, studioId: clientProfiles.studioId, userEmail: users.email })
      .from(clientProfiles)
      .leftJoin(users, eq(users.id, clientProfiles.userId))
      .where(eq(clientProfiles.id, clientId));
    if (!c) throw notFound("Cliente");
    if (c.customer) return { ...c, customer: c.customer };
    const customer = await need().ensureCustomer({ name: c.name, email: c.userEmail ?? c.email, metadata: { clientId: c.id, studioId: c.studioId } });
      await tx.update(clientProfiles).set({ stripeCustomerId: customer }).where(eq(clientProfiles.id, c.id));
      return { ...c, customer };
    });
  }

  /** Crea el cobro pendiente y su página de pago. */
  async function startPayment(o: Parameters<Billing["startPayment"]>[0]) {
    const g = need();
    const c = await customerOf(o.clientId);
    const [p] = await db
      .insert(payments)
      .values({ studioId: o.studioId, clientId: o.clientId, clientName: c.name, priceId: o.priceId, kind: o.kind, description: o.description, amountCents: o.amountCents, createdBy: o.createdBy, appointmentId: o.appointmentId ?? null })
      .returning();
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
  const listPayments = async (where: ReturnType<typeof eq>, limit = 500) =>
    (
      await db
        .select({ p: payments, name: clientProfiles.name })
        .from(payments)
        // leftJoin: los cobros de clientes borrados siguen apareciendo con el nombre que tenían.
        .leftJoin(clientProfiles, eq(clientProfiles.id, payments.clientId))
        .where(where)
        .orderBy(desc(payments.createdAt))
        .limit(limit)
    ).map(({ p, name }) => toPayment(p, name ?? (p.clientName || "Cliente borrado")));

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
    public: b.public,
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
    return (await db.select().from(prices).where(and(eq(prices.studioId, c.studioId), eq(prices.active, true)))).map(toPrice);
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
    if (!p.clientId) throw new HttpError(409, "client_deleted", "El cliente de este cobro ya no existe");
    // El enlace viejo deja de valer en Stripe: así no se puede pagar dos veces.
    if (p.checkoutId) await need().expireCheckout(p.checkoutId);
    await db.update(payments).set({ status: "expired" }).where(and(eq(payments.id, p.id), eq(payments.status, p.status)));
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
    // Todos los pagados y devueltos (sin tope): el gestor necesita el año completo.
    const rows = await listPayments(and(eq(payments.studioId, u.studioId), sql`${payments.status} in ('paid', 'refunded')`)! as ReturnType<typeof eq>, 100_000);
    // Comillas escapadas y, si empieza por = + - @ (fórmula en Excel), se neutraliza con una comilla simple delante.
    const esc = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    const csv = ["fecha;cliente;concepto;importe;estado"]
      .concat(rows.map((p) => [p.paidAt?.slice(0, 10) ?? "", esc(p.clientName), esc(p.description), p.amount.toFixed(2).replace(".", ","), p.status === "paid" ? "pagado" : "devuelto"].join(";")))
      .join("\n");
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="cobros-${madridClock(new Date()).date}.csv"`)
      .header("Cache-Control", "no-store")
      .send("﻿" + csv);
  });

  // ── Cuotas mensuales ──
  api.post(
    "/me/subscribe",
    { schema: { tags: ["cobros"], body: z.object({ priceId: z.string().uuid() }), response: { 200: z.object({ url: z.string() }) } }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const c = requireActiveClient(req);
      const g = need();
      const p = await ownedPrice(c.studioId, req.body.priceId);
      if (!p.active || p.kind !== "subscription") throw notFound("Tarifa");
      const cust = await customerOf(c.clientId);
      const row = await db.transaction(async (tx) => {
        // Cerrojo por cliente: dos altas a la vez no crean dos cuotas.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"subscribe:" + c.clientId}))`);
        const [already] = await tx.select().from(subscriptions).where(and(eq(subscriptions.clientId, c.clientId), sql`${subscriptions.status} in ('active', 'past_due')`));
        if (already) throw new HttpError(409, "already_subscribed", "Ya tienes una cuota activa. Puedes gestionarla desde «Gestionar mi cuota».");
        const [r] = await tx.insert(subscriptions).values({ studioId: c.studioId, clientId: c.clientId, priceId: p.id, name: p.name, amountCents: p.amountCents }).returning();
        return r!;
      });
      const back = `${cfg.publicUrl}/app/pagos`;
      const s = await g.createSubscriptionCheckout({
        customerId: cust.customer,
        description: p.name,
        amountCents: p.amountCents,
        successUrl: `${back}?pago=ok`,
        cancelUrl: back,
        metadata: { subscriptionRowId: row!.id, studioId: c.studioId, clientId: c.clientId },
      });
      await db.update(subscriptions).set({ checkoutId: s.id }).where(eq(subscriptions.id, row!.id));
      return { url: s.url };
    },
  );
  api.post("/me/billing-portal", { schema: { tags: ["cobros"], response: { 200: z.object({ url: z.string() }) } } }, async (req) => {
    const c = requireActiveClient(req);
    const g = need();
    const [cp] = await db.select({ customer: clientProfiles.stripeCustomerId }).from(clientProfiles).where(eq(clientProfiles.id, c.clientId));
    if (!cp?.customer) throw new HttpError(409, "no_customer", "Todavía no tienes pagos en la app");
    return { url: await g.portalUrl(cp.customer, `${cfg.publicUrl}/app/pagos`) };
  });
  const subsOf = async (clientId: string) =>
    (await db.select().from(subscriptions).where(and(eq(subscriptions.clientId, clientId), sql`${subscriptions.status} <> 'incomplete'`)).orderBy(desc(subscriptions.createdAt))).map(toSub);
  api.get("/me/subscriptions", { schema: { tags: ["cobros"], response: { 200: z.array(Subscription) } } }, async (req) => subsOf(requireActiveClient(req).clientId));
  api.get("/clients/:id/subscriptions", { schema: { tags: ["cobros"], params: IdParams, response: { 200: z.array(Subscription) } } }, async (req) => {
    const u = requireCoach(req);
    const [c] = await db.select({ id: clientProfiles.id }).from(clientProfiles).where(and(eq(clientProfiles.id, req.params.id), eq(clientProfiles.studioId, u.studioId)));
    if (!c) throw notFound("Cliente");
    return subsOf(c.id);
  });

  // ── Webhook de Stripe ──
  /**
   * Da un cobro por pagado UNA sola vez: el cambio de estado es condicional dentro de la transacción, así que dos eventos
   * de Stripe (p. ej. `completed` y `async_payment_succeeded`) o dos entregas a la vez no crean dos bonos.
   */
  async function markPaid(p: PayRow, paymentIntentId: string | null) {
    const today = madridClock(new Date()).date;
    const outcome = await db.transaction(async (tx) => {
      const [won] = await tx
        .update(payments)
        .set({ status: "paid", paidAt: new Date(), paymentIntentId })
        .where(and(eq(payments.id, p.id), sql`${payments.status} not in ('paid', 'refunded')`))
        .returning();
      if (!won) return null;
      if (!won.clientId) return { lostBooking: false, confirmed: null }; // cliente borrado entretanto: queda el cobro
      if (won.priceId && !won.packId) {
        const [pr] = await tx.select().from(prices).where(eq(prices.id, won.priceId));
        if (pr && (pr.kind === "pack" || pr.kind === "session")) {
          const [pack] = await tx
            .insert(sessionPacks)
            .values({
              studioId: won.studioId,
              clientId: won.clientId,
              name: pr.name,
              total: pr.sessions ?? 1,
              expires: pr.validDays ? addDays(today, pr.validDays) : null,
              price: fromCents(won.amountCents),
              paid: true,
              notes: "Pagado en la app",
            })
            .returning();
          await tx.update(payments).set({ packId: pack!.id }).where(eq(payments.id, won.id));
        }
      }
      let lostBooking = false;
      if (won.appointmentId) {
        // Solo se confirma una reserva que sigue retenida; una cancelada o liberada no se reactiva (el hueco puede estar ocupado).
        const [ok] = await tx
          .update(appointments)
          .set({ paymentStatus: "paid", holdExpiresAt: null })
          .where(and(eq(appointments.id, won.appointmentId), eq(appointments.status, "scheduled"), eq(appointments.paymentStatus, "pending")))
          .returning({ id: appointments.id });
        lostBooking = !ok;
      }
      return { lostBooking, confirmed: Boolean(won.appointmentId) && !lostBooking ? won.appointmentId : null };
    });
    if (!outcome) return;
    if (outcome.confirmed) void sendBookingMail(db, mail, cfg, outcome.confirmed, "confirmed").catch((e) => app.log.error(e, "correo de reserva"));
    if (paymentIntentId && gw) {
      const url = await gw.receiptUrl(paymentIntentId).catch(() => null);
      if (url) await db.update(payments).set({ receiptUrl: url }).where(eq(payments.id, p.id));
    }
    const coaches = await db.select({ id: users.id }).from(users).where(and(eq(users.studioId, p.studioId), eq(users.role, "coach"), isNull(users.deletedAt)));
    const who = p.clientName || "Un cliente";
    const amount = `${fromCents(p.amountCents).toLocaleString("es-ES")} €`;
    void deps
      .push(
        coaches.map((x) => x.id),
        outcome.lostBooking
          ? { title: "Pago de una reserva que ya no existe", body: `${who} ha pagado ${amount} de una reserva cancelada o caducada. Devuélvele el dinero en Stripe o prográmale la sesión.`, url: "/coach/calendario", tag: "pago" }
          : { title: "Pago recibido", body: `${who} ha pagado ${amount} (${p.description}).`, url: "/coach/informes", tag: "pago" },
      )
      .catch(() => {});
  }


  async function handle(ev: Stripe.Event) {
    const byCheckout = async (s: Stripe.Checkout.Session) => {
      const id = s.metadata?.paymentId;
      const [p] = id ? await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.checkoutId, s.id))) : [];
      return p ?? null;
    };
    const pi = (x: string | Stripe.PaymentIntent | null) => (typeof x === "string" ? x : (x?.id ?? null));
    const subId = (x: unknown) => (typeof x === "string" ? x : ((x as { id?: string } | null)?.id ?? null));
    /** La suscripción de Stripe de una factura (la API la ha movido de sitio con los años). */
    const invoiceSub = (inv: Record<string, any>) => subId(inv.subscription) ?? subId(inv.parent?.subscription_details?.subscription) ?? null;
    const periodEnd = (sub: Record<string, any>) => {
      const t = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
      return typeof t === "number" ? new Date(t * 1000) : null;
    };
    switch (ev.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = ev.data.object;
        if (s.mode === "subscription") {
          const rowId = s.metadata?.subscriptionRowId;
          if (!rowId) return;
          await db.update(subscriptions).set({ stripeSubscriptionId: subId(s.subscription), status: "active" }).where(and(eq(subscriptions.id, rowId), eq(subscriptions.checkoutId, s.id)));
          return;
        }
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
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = ev.data.object as unknown as Record<string, any>;
        const sid = invoiceSub(inv);
        if (!sid) return;
        const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, sid));
        if (!sub) return;
        const paid = ev.type === "invoice.paid";
        const values = {
          status: (paid ? "paid" : "failed") as "paid" | "failed",
          paidAt: paid ? new Date() : null,
          receiptUrl: (inv.hosted_invoice_url as string | undefined) ?? null,
        };
        const [cn] = await db.select({ name: clientProfiles.name }).from(clientProfiles).where(eq(clientProfiles.id, sub.clientId));
        // Una fila por factura (índice único): si llegan «pagada» y «fallida» a la vez no se duplica,
        // y una factura ya pagada no vuelve a «fallida».
        await db
          .insert(payments)
          .values({
            studioId: sub.studioId, clientId: sub.clientId, clientName: cn?.name ?? "", priceId: sub.priceId, kind: "subscription", description: `${sub.name} (cuota)`,
            amountCents: Number(inv.amount_paid || inv.amount_due || sub.amountCents), subscriptionId: sub.id, stripeInvoiceId: String(inv.id), ...values,
          })
          .onConflictDoUpdate({ target: payments.stripeInvoiceId, set: values, setWhere: sql`${payments.status} <> 'paid'` });
        await db.update(subscriptions).set({ status: paid ? "active" : "past_due" }).where(eq(subscriptions.id, sub.id));
        if (!paid) {
          const coaches = await db.select({ id: users.id }).from(users).where(and(eq(users.studioId, sub.studioId), eq(users.role, "coach"), isNull(users.deletedAt)));
          const [c] = await db.select({ name: clientProfiles.name }).from(clientProfiles).where(eq(clientProfiles.id, sub.clientId));
          void deps.push(coaches.map((x) => x.id), { title: "Cuota sin cobrar", body: `No se ha podido cobrar la cuota de ${c?.name ?? "un cliente"}.`, url: "/coach", tag: "pago" }).catch(() => {});
        }
        return;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = ev.data.object as unknown as Record<string, any>;
        const status = ev.type === "customer.subscription.deleted" ? "canceled" : (sub.status as string);
        const mapped = (["active", "past_due", "canceled", "unpaid", "incomplete"].includes(status) ? status : status === "trialing" ? "active" : "past_due") as SubRow["status"];
        await db.update(subscriptions).set({ status: mapped, cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end), currentPeriodEnd: periodEnd(sub) }).where(eq(subscriptions.stripeSubscriptionId, String(sub.id)));
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


  async function expireForAppointments(appointmentIds: string[]) {
    if (!appointmentIds.length) return;
    const rows = await db
      .update(payments)
      .set({ status: "expired" })
      .where(and(inArray(payments.appointmentId, appointmentIds), eq(payments.status, "pending")))
      .returning({ checkoutId: payments.checkoutId });
    if (gw) for (const r of rows) if (r.checkoutId) await gw.expireCheckout(r.checkoutId).catch(() => {});
  }
  async function forgetClient(clientId: string) {
    const [c] = await db.select({ customer: clientProfiles.stripeCustomerId }).from(clientProfiles).where(eq(clientProfiles.id, clientId));
    const pending = await db
      .update(payments)
      .set({ status: "expired" })
      .where(and(eq(payments.clientId, clientId), eq(payments.status, "pending")))
      .returning({ checkoutId: payments.checkoutId });
    if (!gw) return;
    for (const r of pending) if (r.checkoutId) await gw.expireCheckout(r.checkoutId);
    if (c?.customer) await gw.deleteCustomer(c.customer);
  }

  return { enabled: Boolean(gw), startPayment, expireForAppointments, forgetClient };
}
