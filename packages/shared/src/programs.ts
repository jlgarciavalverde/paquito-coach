import { z } from "zod";
import { DateOnly } from "./common";
import { Progression } from "./progression";

export const MAX_PROGRAM_WEEKS = 16;

/** Una rutina en un día concreto de una semana del programa. */
export const ProgramSlot = z.object({
  week: z.number().int().min(1).max(MAX_PROGRAM_WEEKS),
  weekday: z.number().int().min(1).max(7), // 1 = lunes
  routineId: z.string().uuid(),
});
export type ProgramSlot = z.infer<typeof ProgramSlot>;

export const ProgramBody = z
  .object({
    name: z.string().trim().min(1, "Ponle un nombre").max(100),
    description: z.string().trim().max(1000).default(""),
    weeks: z.number().int().min(1).max(MAX_PROGRAM_WEEKS),
    slots: z.array(ProgramSlot).max(MAX_PROGRAM_WEEKS * 7),
    /** Subida de carga semana a semana (la semana 1 va tal cual). */
    progression: Progression.nullable().default(null),
  })
  .refine((p) => p.slots.every((s) => s.week <= p.weeks), { message: "Hay días fuera de las semanas del programa" })
  .refine((p) => new Set(p.slots.map((s) => `${s.week}-${s.weekday}`)).size === p.slots.length, { message: "Solo una rutina por día" });
export type ProgramBody = z.infer<typeof ProgramBody>;

export const Program = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  weeks: z.number(),
  slots: z.array(ProgramSlot),
  progression: Progression.nullable(),
  updatedAt: z.string(),
  activeRuns: z.number(),
});
export type Program = z.infer<typeof Program>;

export const ProgramAssignInput = z.object({
  clientIds: z.array(z.string().uuid()).min(1, "Elige al menos un cliente").max(100),
  /** Primer día: la semana 1 es la semana (de lunes a domingo) que contiene este día; lo anterior a él se salta. */
  start: DateOnly,
});
export type ProgramAssignInput = z.infer<typeof ProgramAssignInput>;

export const ProgramRun = z.object({
  id: z.string(),
  programId: z.string().nullable(),
  name: z.string(),
  start: DateOnly,
  weeks: z.number(),
  total: z.number(),
  done: z.number(),
  pending: z.number(),
  ended: z.boolean(),
});
export type ProgramRun = z.infer<typeof ProgramRun>;

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Día de la semana ISO (1 = lunes … 7 = domingo). */
export const isoWeekday = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Fechas concretas de cada día del programa empezando en `start`, en orden. */
export function programDates(start: string, slots: ProgramSlot[]) {
  const monday = addDays(start, 1 - isoWeekday(start));
  return slots
    .map((s) => ({ ...s, date: addDays(monday, (s.week - 1) * 7 + (s.weekday - 1)) }))
    .filter((s) => s.date >= start)
    .sort((a, b) => a.date.localeCompare(b.date));
}
