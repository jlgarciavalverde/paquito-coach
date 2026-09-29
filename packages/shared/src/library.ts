import { z } from "zod";
import { DateOnly } from "./common";

// ── Biblioteca de material para clientes (pautas, vídeos, PDFs) ──────────────
export const ResourceKind = z.enum(["link", "pdf"]);
export type ResourceKind = z.infer<typeof ResourceKind>;

export const ResourceInput = z
  .object({
    title: z.string().trim().min(1, "Ponle un título").max(120),
    description: z.string().trim().max(1000).default(""),
    kind: ResourceKind,
    url: z.string().trim().url("Enlace no válido").max(500).refine((u) => /^https?:\/\//.test(u), "Solo enlaces http(s)").nullable().default(null),
    mediaId: z.string().uuid().nullable().default(null),
    /** Para todos los clientes o solo para algunos. */
    forAll: z.boolean().default(true),
    clientIds: z.array(z.string().uuid()).max(200).default([]),
  })
  .refine((r) => (r.kind === "link" ? Boolean(r.url) : Boolean(r.mediaId)), { message: "Falta el enlace o el archivo" })
  .refine((r) => r.forAll || r.clientIds.length > 0, { message: "Elige para quién es" });
export type ResourceInput = z.infer<typeof ResourceInput>;

export const Resource = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  kind: ResourceKind,
  url: z.string().nullable(),
  mediaId: z.string().nullable(),
  forAll: z.boolean(),
  clientIds: z.array(z.string()),
  createdAt: z.string(),
});
export type Resource = z.infer<typeof Resource>;

// ── Logros del cliente ────────────────────────────────────────────────────────
export const Achievements = z.object({
  /** Semanas seguidas (hasta la actual) con al menos un entreno hecho. */
  streakWeeks: z.number(),
  bestStreakWeeks: z.number(),
  totalDone: z.number(),
  /** Ejercicios en los que ha batido su mejor 1RM estimado en los últimos 30 días. */
  recentRecords: z.array(z.string()),
});
export type Achievements = z.infer<typeof Achievements>;

const mondayOf = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const prevMonday = (monday: string) => {
  const d = new Date(`${monday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
};

/** Racha actual y mejor racha de semanas con algún entreno hecho. La semana en curso cuenta si ya tiene uno; si no, no rompe la racha. */
export function weekStreaks(doneDates: string[], today: string) {
  const weeks = new Set(doneDates.map(mondayOf));
  let current = 0;
  let w = mondayOf(today);
  if (!weeks.has(w)) w = prevMonday(w);
  while (weeks.has(w)) {
    current++;
    w = prevMonday(w);
  }
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const m of [...weeks].sort()) {
    run = prev && prevMonday(m) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = m;
  }
  return { current, best: Math.max(best, current) };
}

// ── Informes del estudio ──────────────────────────────────────────────────────
export const StudioReport = z.object({
  activeClients: z.number(),
  newClients30d: z.number(),
  /** Entrenos de las últimas 4 semanas ya pasadas: hechos / asignados. */
  done4w: z.number(),
  planned4w: z.number(),
  sessionsMonth: z.number(),
  noShowsMonth: z.number(),
  packsToRenew: z.number(),
  paidMonth: z.number(),
  pendingPayments: z.number(),
  weekly: z.array(z.object({ monday: DateOnly, done: z.number(), planned: z.number() })),
  /** Clientes activos por adherencia de 4 semanas (de menos a más). */
  byClient: z.array(z.object({ clientId: z.string(), name: z.string(), done: z.number(), planned: z.number() })),
});
export type StudioReport = z.infer<typeof StudioReport>;
