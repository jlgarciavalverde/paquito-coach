import { z } from "zod";
import { EQUIPMENT } from "./training";
import { RoutineBody } from "./training";
import { MealPlanBody } from "./nutrition";
import { Progression } from "./progression";

/** Estado de la IA para el entrenador. */
export const AiStatus = z.object({
  enabled: z.boolean(),
  provider: z.string(),
  usedToday: z.number(),
  dailyLimit: z.number(),
  documents: z.number(),
});
export type AiStatus = z.infer<typeof AiStatus>;

export const AiDocument = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["pdf", "docx", "text"]),
  status: z.enum(["ready", "error"]),
  error: z.string().nullable(),
  chunks: z.number(),
  chars: z.number(),
  createdAt: z.string(),
});
export type AiDocument = z.infer<typeof AiDocument>;

/** Fragmento de sus documentos en el que se ha basado la respuesta. */
export const AiSource = z.object({ documentId: z.string(), title: z.string(), excerpt: z.string() });
export type AiSource = z.infer<typeof AiSource>;

const Common = {
  /** Cliente para adaptar el plan (se envían solo datos seudonimizados). */
  clientId: z.string().uuid().nullable().default(null),
  /** Incluir sus lesiones y limitaciones (sin nombre). */
  includeHealth: z.boolean().default(false),
  notes: z.string().trim().max(1000).default(""),
};

export const GenerateRoutineInput = z.object({
  focus: z.string().trim().min(3, "Cuéntale qué quieres (p. ej. «pierna, fuerza, rodilla operada»)").max(300),
  minutes: z.number().int().min(15).max(180).default(60),
  equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length).default([]),
  ...Common,
});
export type GenerateRoutineInput = z.infer<typeof GenerateRoutineInput>;

export const GeneratedRoutine = z.object({
  routine: RoutineBody,
  /** Ejercicios propuestos que no están en la biblioteca (se quitan del borrador; se añaden a mano). */
  unmatched: z.array(z.string()),
  sources: z.array(AiSource),
});
export type GeneratedRoutine = z.infer<typeof GeneratedRoutine>;

export const GenerateProgramInput = z.object({
  focus: z.string().trim().min(3).max(300),
  weeks: z.number().int().min(1).max(16).default(4),
  daysPerWeek: z.number().int().min(1).max(6).default(3),
  minutes: z.number().int().min(15).max(180).default(60),
  equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length).default([]),
  ...Common,
});
export type GenerateProgramInput = z.infer<typeof GenerateProgramInput>;

/** Programa propuesto: rutinas nuevas y en qué días de la semana van (se repiten cada semana, con progresión). */
export const GeneratedProgram = z.object({
  name: z.string(),
  description: z.string(),
  weeks: z.number(),
  progression: Progression.nullable(),
  routines: z.array(z.object({ routine: RoutineBody, weekdays: z.array(z.number().int().min(1).max(7)) })),
  unmatched: z.array(z.string()),
  sources: z.array(AiSource),
});
export type GeneratedProgram = z.infer<typeof GeneratedProgram>;

export const GenerateMealPlanInput = z.object({
  goal: z.string().trim().min(3, "Cuéntale el objetivo (p. ej. «perder grasa manteniendo fuerza»)").max(300),
  kcal: z.number().int().min(800).max(6000).nullable().default(null),
  mealsPerDay: z.number().int().min(2).max(7).default(4),
  restrictions: z.string().trim().max(300).default(""),
  ...Common,
});
export type GenerateMealPlanInput = z.infer<typeof GenerateMealPlanInput>;

export const GeneratedMealPlan = z.object({ plan: MealPlanBody, sources: z.array(AiSource) });
export type GeneratedMealPlan = z.infer<typeof GeneratedMealPlan>;

export const AskInput = z.object({ question: z.string().trim().min(3).max(500) });
export const AskAnswer = z.object({ answer: z.string(), sources: z.array(AiSource) });
export type AskAnswer = z.infer<typeof AskAnswer>;
