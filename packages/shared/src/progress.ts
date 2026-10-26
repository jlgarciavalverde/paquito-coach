import { z } from "zod";
import { DateOnly } from "./common";

const num = (min: number, max: number) => z.number().min(min).max(max).nullable().default(null);

/** Medidas de un día (una fila por día y cliente). Todas opcionales salvo la fecha. */
export const BodyMetricInput = z
  .object({
    date: DateOnly,
    weightKg: num(20, 400),
    waistCm: num(30, 250),
    hipCm: num(30, 250),
    bodyFatPct: num(2, 70),
    note: z.string().trim().max(300).nullable().default(null),
  })
  .refine((m) => m.weightKg != null || m.waistCm != null || m.hipCm != null || m.bodyFatPct != null, {
    message: "Anota al menos una medida",
  });
export type BodyMetricInput = z.infer<typeof BodyMetricInput>;

export const BodyMetric = z.object({
  date: DateOnly,
  weightKg: z.number().nullable(),
  waistCm: z.number().nullable(),
  hipCm: z.number().nullable(),
  bodyFatPct: z.number().nullable(),
  note: z.string().nullable(),
});
export type BodyMetric = z.infer<typeof BodyMetric>;

/** Una sesión de un ejercicio: su mejor serie hecha y el 1RM estimado. */
export const ProgressPoint = z.object({
  date: DateOnly,
  workoutId: z.string(),
  bestLoadKg: z.number(),
  reps: z.number(),
  e1rm: z.number().nullable(),
  sets: z.number(),
  volumeKg: z.number(),
});
export type ProgressPoint = z.infer<typeof ProgressPoint>;

export const ProgressExercise = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  sessions: z.number(),
  lastDate: DateOnly,
  bestE1rm: z.number().nullable(),
  lastE1rm: z.number().nullable(),
});
export type ProgressExercise = z.infer<typeof ProgressExercise>;

/**
 * Lo que el cliente hizo la última vez en un ejercicio (para sugerirlo al registrar) y su mejor 1RM estimado en los
 * últimos entrenos (para avisar de un récord en el momento).
 */
export const LastSets = z.record(
  z.string(),
  z.object({ date: DateOnly, sets: z.array(z.object({ reps: z.string(), load: z.string(), rpe: z.number().nullable() })), bestE1rm: z.number().nullable().default(null) }),
);
export type LastSets = z.infer<typeof LastSets>;

/**
 * Carga en kg a partir del texto que anota el cliente o prescribe el entrenador: «82,5», «80 kg», «2×12 kg» (dos
 * mancuernas de 12 → 24), «70% 1RM» no es una carga (null). Devuelve null si no hay un número de kilos claro.
 */
export function parseLoadKg(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(",", ".").trim();
  if (/%|rpe|rir|pc|peso corporal|bw/.test(t)) return null;
  const pair = t.match(/^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg)?$/);
  if (pair) return Number(pair[1]) * Number(pair[2]);
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(kg|kgs|kilos)?$/);
  if (!m) return null;
  const v = Number(m[1]);
  return v > 0 && v < 1000 ? v : null;
}

export const parseReps = (text: string | null | undefined): number | null => {
  const m = text?.trim().match(/^(\d{1,3})$/);
  return m ? Number(m[1]) : null;
};

/** 1RM estimado (Epley). Solo fiable hasta ~12 repeticiones; por encima se devuelve null. */
export const epley = (kg: number, reps: number) => (reps >= 1 && reps <= 12 ? Math.round(kg * (1 + reps / 30) * 10) / 10 : null);

