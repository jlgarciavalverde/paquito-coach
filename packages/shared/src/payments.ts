import { z } from "zod";

/** Lo que se puede cobrar con un precio fijo: bonos (crean el bono al pagarse), sesión suelta y cuota mensual (C2). */
export const PriceKind = z.enum(["pack", "session", "subscription"]);
export type PriceKind = z.infer<typeof PriceKind>;
export const PRICE_KIND_LABEL: Record<PriceKind, string> = { pack: "Bono de sesiones", session: "Sesión suelta", subscription: "Cuota mensual" };

const euros = z.number().min(0.5, "Mínimo 0,50 €").max(10000);

export const PriceInput = z
  .object({
    name: z.string().trim().min(1, "Ponle un nombre").max(80),
    kind: PriceKind,
    amount: euros,
    /** Bono: sesiones que incluye y días de validez desde la compra. */
    sessions: z.number().int().min(1).max(200).nullable().default(null),
    validDays: z.number().int().min(1).max(730).nullable().default(null),
    /** Visible para que el cliente lo compre desde su app. */
    active: z.boolean().default(true),
  })
  .refine((p) => p.kind !== "pack" || p.sessions != null, { message: "Indica cuántas sesiones incluye el bono" });
export type PriceInput = z.infer<typeof PriceInput>;
export const Price = z.object({
  id: z.string(),
  name: z.string(),
  kind: PriceKind,
  amount: z.number(),
  sessions: z.number().nullable(),
  validDays: z.number().nullable(),
  active: z.boolean(),
});
export type Price = z.infer<typeof Price>;

export const PaymentKind = z.enum(["pack", "session", "link", "subscription"]);
export const PaymentStatus = z.enum(["pending", "paid", "failed", "refunded", "expired"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { pending: "Pendiente", paid: "Pagado", failed: "Fallido", refunded: "Devuelto", expired: "Caducado" };

export const Payment = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  kind: PaymentKind,
  description: z.string(),
  amount: z.number(),
  status: PaymentStatus,
  /** Página de pago de Stripe mientras está pendiente y no ha caducado. */
  url: z.string().nullable(),
  receiptUrl: z.string().nullable(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
});
export type Payment = z.infer<typeof Payment>;

/** Cobro puntual que crea el entrenador: con una tarifa (p. ej. un bono) o con concepto e importe libres. */
export const PaymentLinkInput = z
  .object({
    priceId: z.string().uuid().nullable().default(null),
    description: z.string().trim().max(120).default(""),
    amount: euros.nullable().default(null),
  })
  .refine((p) => p.priceId || (p.description.length > 0 && p.amount != null), { message: "Elige una tarifa o escribe concepto e importe" });
export type PaymentLinkInput = z.infer<typeof PaymentLinkInput>;

export const PaymentsInfo = z.object({ enabled: z.boolean(), testMode: z.boolean() });
export type PaymentsInfo = z.infer<typeof PaymentsInfo>;

export const toCents = (euros: number) => Math.round(euros * 100);
export const fromCents = (cents: number) => cents / 100;
export const formatEuros = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });

export const SubscriptionStatus = z.enum(["incomplete", "active", "past_due", "canceled", "unpaid"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  incomplete: "Sin completar",
  active: "Activa",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
  unpaid: "Impagada",
};
export const Subscription = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  amount: z.number(),
  status: SubscriptionStatus,
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
});
export type Subscription = z.infer<typeof Subscription>;
