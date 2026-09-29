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
