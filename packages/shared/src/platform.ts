import { z } from "zod";
import { Email, Password, PersonName } from "./auth";

/**
 * S1: la app como plataforma para varios entrenadores (ADR 0018). Cada estudio tiene un plan; el plan fija cuántos clientes
 * puede llevar a la vez. Los precios son provisionales: se cambian aquí (y en Stripe no hay que tocar nada, se crean al vuelo).
 */
export const PLANS = {
  prueba: { label: "Prueba", maxClients: 5, priceCents: 0, public: false },
  basico: { label: "Básico", maxClients: 15, priceCents: 1900, public: true },
  pro: { label: "Pro", maxClients: 50, priceCents: 3900, public: true },
  estudio: { label: "Estudio", maxClients: null, priceCents: 7900, public: true },
  /** Estudios fundadores (el de Paquito) y cortesías: sin límite y sin cobro. Solo lo asigna la administración. */
  fundador: { label: "Fundador", maxClients: null, priceCents: 0, public: false },
} as const satisfies Record<string, { label: string; maxClients: number | null; priceCents: number; public: boolean }>;
export const PlanId = z.enum(["prueba", "basico", "pro", "estudio", "fundador"]);
export type PlanId = z.infer<typeof PlanId>;
export const PaidPlanId = z.enum(["basico", "pro", "estudio"]);
export type PaidPlanId = z.infer<typeof PaidPlanId>;

export const TRIAL_DAYS = 14;
/** Días que se sigue trabajando con normalidad tras un cobro fallido, mientras Stripe reintenta. */
export const GRACE_DAYS = 7;

export const BillingStatus = z.enum(["trial", "active", "past_due", "canceled", "comp"]);
export type BillingStatus = z.infer<typeof BillingStatus>;

/**
 * Lo que puede hacer el estudio ahora mismo. `ok`: todo. `locked`: prueba terminada, impago pasada la gracia, baja o
 * suspensión: se puede consultar y exportar, pero no crear ni cambiar nada hasta elegir un plan.
 */
export const StudioAccess = z.enum(["ok", "locked"]);
export type StudioAccess = z.infer<typeof StudioAccess>;

export function studioAccess(s: { billingStatus: BillingStatus; trialEndsAt: Date | null; currentPeriodEnd: Date | null; suspendedAt: Date | null }, now = new Date()): StudioAccess {
  if (s.suspendedAt) return "locked";
  switch (s.billingStatus) {
    case "comp":
    case "active":
      return "ok";
    case "trial":
      return s.trialEndsAt && s.trialEndsAt > now ? "ok" : "locked";
    case "past_due": {
      const from = s.currentPeriodEnd ?? now;
      return now.getTime() - from.getTime() < GRACE_DAYS * 86_400_000 ? "ok" : "locked";
    }
    case "canceled":
      return s.currentPeriodEnd && s.currentPeriodEnd > now ? "ok" : "locked";
  }
}

/** Direcciones de estudio: `/e/<slug>`. Solo minúsculas, números y guiones; sin palabras de la propia app. */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "coach", "e", "www", "ayuda", "soporte", "alta", "acceso", "registro", "instalar", "plataforma", "precios",
  "demo", "estado", "status", "blog", "legal", "privacidad", "terminos", "aviso-legal", "mail", "correo", "static", "assets",
]);
export const Slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Al menos 3 caracteres")
  .max(40, "Como mucho 40 caracteres")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Solo letras sin tilde, números y guiones (sin guion al principio ni al final)")
  .refine((s) => !RESERVED_SLUGS.has(s), "Esa dirección está reservada");

/** Propuesta de dirección a partir del nombre del estudio («Estudio Paquito» → «estudio-paquito»). */
export function slugify(name: string) {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s.length >= 3 ? s : `${s || "estudio"}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Alta de un entrenador nuevo desde la web de la plataforma (empieza en prueba). `website`: campo trampa. */
export const SignupInput = z.object({
  studioName: z.string().trim().min(1, "Ponle un nombre").max(60),
  slug: Slug,
  name: PersonName,
  email: Email,
  password: Password,
  acceptTerms: z.literal(true, { error: "Tienes que aceptar las condiciones" }),
  website: z.string().max(200).default(""),
});
export type SignupInput = z.infer<typeof SignupInput>;

export const SlugCheck = z.object({ slug: z.string(), available: z.boolean(), reason: z.string().nullable() });

export const PlanInfo = z.object({ id: PlanId, label: z.string(), maxClients: z.number().nullable(), price: z.number() });
export type PlanInfo = z.infer<typeof PlanInfo>;
export const publicPlans = (): PlanInfo[] =>
  (Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]).filter(([, p]) => p.public).map(([id, p]) => ({ id, label: p.label, maxClients: p.maxClients, price: p.priceCents / 100 }));

/** Plan y facturación del estudio (Ajustes → Plan). */
export const StudioBilling = z.object({
  plan: PlanId,
  planLabel: z.string(),
  status: BillingStatus,
  access: StudioAccess,
  trialEndsAt: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  maxClients: z.number().nullable(),
  activeClients: z.number(),
  /** Hay pasarela de pago para cobrar la plataforma (si no, solo la administración cambia el plan). */
  canPay: z.boolean(),
  /** Tiene cliente en Stripe: puede abrir el portal (tarjeta, facturas, baja). */
  hasPortal: z.boolean(),
  plans: z.array(PlanInfo),
});
export type StudioBilling = z.infer<typeof StudioBilling>;
export const BillingCheckoutInput = z.object({ plan: PaidPlanId });
export const RedirectUrl = z.object({ url: z.string() });

/** Panel de administración de la plataforma. */
export const AdminStudio = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  coachName: z.string(),
  coachEmail: z.string(),
  plan: PlanId,
  status: BillingStatus,
  access: StudioAccess,
  trialEndsAt: z.string().nullable(),
  suspended: z.boolean(),
  activeClients: z.number(),
  createdAt: z.string(),
  lastActivityAt: z.string().nullable(),
});
export type AdminStudio = z.infer<typeof AdminStudio>;
export const AdminStudioUpdate = z.object({
  plan: PlanId.optional(),
  /** Alarga la prueba hasta este día (incluido). */
  trialEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  suspended: z.boolean().optional(),
});
export const AdminSummary = z.object({ studios: z.number(), paying: z.number(), trial: z.number(), locked: z.number(), activeClients: z.number(), mrr: z.number() });

/** Datos públicos de la plataforma (la web de alta y su aviso legal). */
export const PlatformInfo = z.object({
  name: z.string(),
  legalName: z.string(),
  taxId: z.string(),
  legalAddress: z.string(),
  contactEmail: z.string(),
  plans: z.array(PlanInfo),
  trialDays: z.number(),
  signupOpen: z.boolean(),
});
export type PlatformInfo = z.infer<typeof PlatformInfo>;

// ── Registro propio de errores (Q1): nada sale del servidor (sin servicios externos) ──
/** Lo que manda la web cuando algo falla en el navegador. Sin datos personales: se recortan y se ocultan correos y cifras largas. */
export const ClientErrorInput = z.object({
  message: z.string().max(500),
  stack: z.string().max(4000).default(""),
  path: z.string().max(200).default(""),
  version: z.string().max(40).default(""),
  requestId: z.string().max(80).optional(),
  kind: z.enum(["error", "rejection", "api", "render"]).default("error"),
});
export type ClientErrorInput = z.infer<typeof ClientErrorInput>;
export const ErrorReport = z.object({
  id: z.string(),
  source: z.enum(["web", "api"]),
  kind: z.string(),
  message: z.string(),
  stack: z.string(),
  path: z.string(),
  version: z.string(),
  userAgent: z.string(),
  lastRequestId: z.string().nullable(),
  count: z.number(),
  firstSeen: z.string(),
  lastSeen: z.string(),
  resolved: z.boolean(),
});
export type ErrorReport = z.infer<typeof ErrorReport>;
