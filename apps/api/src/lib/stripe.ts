import Stripe from "stripe";

/** Lo mínimo que la app necesita de Stripe; los tests usan `createFakeGateway` (sin red) con la verificación de firma real. */
export interface PaymentGateway {
  testMode: boolean;
  ensureCustomer(o: { name: string; email: string | null; metadata: Record<string, string> }): Promise<string>;
  createCheckout(o: {
    customerId: string;
    description: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string; expiresAt: Date }>;
  /** Cuota mensual: Checkout en modo suscripción. */
  createSubscriptionCheckout(o: { customerId: string; description: string; amountCents: number; successUrl: string; cancelUrl: string; metadata: Record<string, string> }): Promise<{ id: string; url: string }>;
  /** Portal de Stripe para que el cliente cambie la tarjeta o se dé de baja. */
  portalUrl(customerId: string, returnUrl: string): Promise<string>;
  /** Caduca una página de pago para que ya no se pueda pagar (enlace renovado, reserva cancelada o liberada). */
  expireCheckout(checkoutId: string): Promise<void>;
  /** Borra el cliente en Stripe: cancela sus suscripciones y ya no se le puede cobrar (al borrar la ficha). */
  deleteCustomer(customerId: string): Promise<void>;
  /** Recibo de un pago (URL de Stripe), si existe. */
  receiptUrl(paymentIntentId: string): Promise<string | null>;
  /** Verifica la firma del webhook y devuelve el evento. Lanza si no es válida. */
  verify(raw: Buffer, signature: string): Stripe.Event;
}

export function createStripeGateway(o: { secretKey: string; webhookSecret: string }): PaymentGateway {
  const stripe = new Stripe(o.secretKey);
  return {
    testMode: /^(sk|rk)_test_/.test(o.secretKey),
    async ensureCustomer({ name, email, metadata }) {
      const c = await stripe.customers.create({ name, email: email ?? undefined, metadata, preferred_locales: ["es"] });
      return c.id;
    },
    async createCheckout({ customerId, description, amountCents, successUrl, cancelUrl, metadata }) {
      const expiresAt = new Date(Date.now() + 23 * 3600_000);
      const s = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        locale: "es",
        line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: amountCents, product_data: { name: description } } }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        payment_intent_data: { metadata, description },
        expires_at: Math.floor(expiresAt.getTime() / 1000),
      });
      return { id: s.id, url: s.url!, expiresAt };
    },
    async createSubscriptionCheckout({ customerId, description, amountCents, successUrl, cancelUrl, metadata }) {
      const s = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        locale: "es",
        line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: amountCents, recurring: { interval: "month" }, product_data: { name: description } } }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        subscription_data: { metadata, description },
      });
      return { id: s.id, url: s.url! };
    },
    async portalUrl(customerId, returnUrl) {
      const s = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl, locale: "es" });
      return s.url;
    },
    async expireCheckout(checkoutId) {
      try {
        await stripe.checkout.sessions.expire(checkoutId);
      } catch (e) {
        // Ya caducada, pagada o inexistente: no hay nada que caducar.
        if ((e as { type?: string }).type !== "StripeInvalidRequestError") throw e;
      }
    },
    async deleteCustomer(customerId) {
      try {
        await stripe.customers.del(customerId);
      } catch (e) {
        if ((e as { type?: string }).type !== "StripeInvalidRequestError") throw e;
      }
    },
    async receiptUrl(paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
      const ch = pi.latest_charge as Stripe.Charge | null;
      return ch?.receipt_url ?? null;
    },
    verify(raw, signature) {
      return stripe.webhooks.constructEvent(raw, signature, o.webhookSecret);
    },
  };
}

/** Pasarela falsa para tests y e2e: no llama a Stripe, pero verifica las firmas como la real. */
export function createFakeGateway(webhookSecret = "whsec_test_fake"): PaymentGateway & {
  sign(payload: string): string;
  checkouts: { id: string; metadata: Record<string, string>; amountCents: number }[];
  expired: string[];
  deletedCustomers: string[];
} {
  const stripe = new Stripe("sk_test_fake");
  const checkouts: { id: string; metadata: Record<string, string>; amountCents: number }[] = [];
  const expired: string[] = [];
  const deletedCustomers: string[] = [];
  let n = 0;
  return {
    testMode: true,
    checkouts,
    expired,
    deletedCustomers,
    async expireCheckout(id) {
      expired.push(id);
    },
    async deleteCustomer(id) {
      deletedCustomers.push(id);
    },
    async ensureCustomer() {
      return `cus_fake_${++n}`;
    },
    async createCheckout({ amountCents, metadata, successUrl }) {
      const id = `cs_test_fake_${++n}`;
      checkouts.push({ id, metadata, amountCents });
      // En e2e se «paga» con un botón de la propia app de prueba: la URL vuelve a la app con el id.
      return { id, url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}simulado=${id}`, expiresAt: new Date(Date.now() + 23 * 3600_000) };
    },
    async createSubscriptionCheckout({ amountCents, metadata, successUrl }) {
      const id = `cs_test_fake_sub_${++n}`;
      checkouts.push({ id, metadata, amountCents });
      return { id, url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}simulado=${id}` };
    },
    async portalUrl() {
      return "https://billing.stripe.com/p/session/fake";
    },
    async receiptUrl() {
      return "https://pay.stripe.com/receipts/fake";
    },
    verify(raw, signature) {
      return stripe.webhooks.constructEvent(raw, signature, webhookSecret);
    },
    sign(payload) {
      return stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    },
  };
}
