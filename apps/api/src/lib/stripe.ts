import Stripe from "stripe";

/**
 * Lo mínimo que la app necesita de Stripe; los tests usan `createFakeGateway` (sin red) con la verificación de firma real.
 * `account`: la cuenta Express del entrenador (Stripe Connect, cargos directos, ADR 0019): el cobro, el cliente de Stripe y
 * la comisión de Stripe son de esa cuenta. Sin `account`, la cuenta de la plataforma (la cuota de los estudios, ADR 0018).
 */
export interface PaymentGateway {
  testMode: boolean;
  ensureCustomer(o: { name: string; email: string | null; metadata: Record<string, string>; account?: string }): Promise<string>;
  createCheckout(o: {
    account?: string;
    customerId: string;
    description: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string; expiresAt: Date }>;
  /** Cuota mensual: Checkout en modo suscripción. */
  createSubscriptionCheckout(o: { account?: string; customerId: string; description: string; amountCents: number; successUrl: string; cancelUrl: string; metadata: Record<string, string> }): Promise<{ id: string; url: string }>;
  /** Portal de Stripe para que el cliente cambie la tarjeta o se dé de baja. */
  portalUrl(customerId: string, returnUrl: string, account?: string): Promise<string>;
  /** Caduca una página de pago para que ya no se pueda pagar (enlace renovado, reserva cancelada o liberada). */
  expireCheckout(checkoutId: string, account?: string): Promise<void>;
  /** Borra el cliente en Stripe: cancela sus suscripciones y ya no se le puede cobrar (al borrar la ficha). */
  deleteCustomer(customerId: string, account?: string): Promise<void>;
  /** Recibo de un pago (URL de Stripe), si existe. */
  receiptUrl(paymentIntentId: string, account?: string): Promise<string | null>;
  // ── Stripe Connect (Express) ──
  /** Cuenta Express nueva para un entrenador (España, pagos con tarjeta y transferencias a su banco). */
  createAccount(o: { email: string; businessName: string; metadata: Record<string, string> }): Promise<string>;
  /** Enlace de un solo uso al alta de Stripe (DNI, IBAN…). `refreshUrl` si caduca; `returnUrl` al terminar o salir. */
  accountLink(account: string, refreshUrl: string, returnUrl: string): Promise<string>;
  accountStatus(account: string): Promise<AccountStatus>;
  /** Acceso del entrenador a su panel Express de Stripe (pagos, transferencias, datos bancarios). */
  dashboardUrl(account: string): Promise<string>;
  /** Verifica la firma del webhook (de la plataforma o de Connect) y devuelve el evento. Lanza si no es válida. */
  verify(raw: Buffer, signature: string): Stripe.Event;
}

export type AccountStatus = { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean };
const on = (account?: string) => (account ? { stripeAccount: account } : undefined);

export function createStripeGateway(o: { secretKey: string; webhookSecret: string; connectWebhookSecret?: string }): PaymentGateway {
  const stripe = new Stripe(o.secretKey);
  return {
    testMode: /^(sk|rk)_test_/.test(o.secretKey),
    async ensureCustomer({ name, email, metadata, account }) {
      const c = await stripe.customers.create({ name, email: email ?? undefined, metadata, preferred_locales: ["es"] }, on(account));
      return c.id;
    },
    async createCheckout({ account, customerId, description, amountCents, successUrl, cancelUrl, metadata }) {
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
      }, on(account));
      return { id: s.id, url: s.url!, expiresAt };
    },
    async createSubscriptionCheckout({ account, customerId, description, amountCents, successUrl, cancelUrl, metadata }) {
      const s = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        locale: "es",
        line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: amountCents, recurring: { interval: "month" }, product_data: { name: description } } }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        subscription_data: { metadata, description },
      }, on(account));
      return { id: s.id, url: s.url! };
    },
    async portalUrl(customerId, returnUrl, account) {
      const s = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl, locale: "es" }, on(account));
      return s.url;
    },
    async expireCheckout(checkoutId, account) {
      try {
        await stripe.checkout.sessions.expire(checkoutId, undefined, on(account));
      } catch (e) {
        // Ya caducada, pagada o inexistente: no hay nada que caducar.
        if ((e as { type?: string }).type !== "StripeInvalidRequestError") throw e;
      }
    },
    async deleteCustomer(customerId, account) {
      try {
        await stripe.customers.del(customerId, undefined, on(account));
      } catch (e) {
        if ((e as { type?: string }).type !== "StripeInvalidRequestError") throw e;
      }
    },
    async receiptUrl(paymentIntentId, account) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] }, on(account));
      const ch = pi.latest_charge as Stripe.Charge | null;
      return ch?.receipt_url ?? null;
    },
    async createAccount({ email, businessName, metadata }) {
      const a = await stripe.accounts.create({
        type: "express",
        country: "ES",
        email,
        business_type: "individual",
        business_profile: { name: businessName, mcc: "7997", product_description: "Entrenamiento personal" },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        default_currency: "eur",
        metadata,
      });
      return a.id;
    },
    async accountLink(account, refreshUrl, returnUrl) {
      const l = await stripe.accountLinks.create({ account, refresh_url: refreshUrl, return_url: returnUrl, type: "account_onboarding" });
      return l.url;
    },
    async accountStatus(account) {
      const a = await stripe.accounts.retrieve(account);
      return { chargesEnabled: Boolean(a.charges_enabled), payoutsEnabled: Boolean(a.payouts_enabled), detailsSubmitted: Boolean(a.details_submitted) };
    },
    async dashboardUrl(account) {
      return (await stripe.accounts.createLoginLink(account)).url;
    },
    verify(raw, signature) {
      // Dos destinos en Stripe: el de la cuenta de la plataforma y el de Connect (eventos de las cuentas de los entrenadores).
      try {
        return stripe.webhooks.constructEvent(raw, signature, o.webhookSecret);
      } catch (e) {
        if (!o.connectWebhookSecret) throw e;
        return stripe.webhooks.constructEvent(raw, signature, o.connectWebhookSecret);
      }
    },
  };
}

/** Pasarela falsa para tests y e2e: no llama a Stripe, pero verifica las firmas como la real. */
export function createFakeGateway(webhookSecret = "whsec_test_fake"): PaymentGateway & {
  sign(payload: string): string;
  checkouts: { id: string; metadata: Record<string, string>; amountCents: number; account?: string }[];
  expired: string[];
  deletedCustomers: string[];
  /** Estado de las cuentas Express simuladas: al pedir el enlace de alta quedan listas (como si el alta terminara). */
  accounts: Map<string, AccountStatus>;
} {
  const stripe = new Stripe("sk_test_fake");
  const checkouts: { id: string; metadata: Record<string, string>; amountCents: number; account?: string }[] = [];
  const accounts = new Map<string, AccountStatus>();
  const expired: string[] = [];
  const deletedCustomers: string[] = [];
  let n = 0;
  return {
    testMode: true,
    checkouts,
    expired,
    deletedCustomers,
    accounts,
    async createAccount() {
      const id = `acct_fake_${++n}`;
      accounts.set(id, { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false });
      return id;
    },
    async accountLink(account, _refreshUrl, returnUrl) {
      accounts.set(account, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
      return `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}simulado=${account}`;
    },
    async accountStatus(account) {
      return accounts.get(account) ?? { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };
    },
    async dashboardUrl() {
      return "https://connect.stripe.com/express/fake";
    },
    async expireCheckout(id) {
      expired.push(id);
    },
    async deleteCustomer(id) {
      deletedCustomers.push(id);
    },
    async ensureCustomer() {
      return `cus_fake_${++n}`;
    },
    async createCheckout({ amountCents, metadata, successUrl, account }) {
      const id = `cs_test_fake_${++n}`;
      checkouts.push({ id, metadata, amountCents, account });
      // En e2e se «paga» con un botón de la propia app de prueba: la URL vuelve a la app con el id.
      return { id, url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}simulado=${id}`, expiresAt: new Date(Date.now() + 23 * 3600_000) };
    },
    async createSubscriptionCheckout({ amountCents, metadata, successUrl, account }) {
      const id = `cs_test_fake_sub_${++n}`;
      checkouts.push({ id, metadata, amountCents, account });
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
