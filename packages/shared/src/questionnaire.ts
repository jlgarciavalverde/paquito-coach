import { z } from "zod";

/**
 * PAR-Q+ (Physical Activity Readiness Questionnaire), 7 preguntas generales, adaptadas al tuteo de la app.
 * Cualquier «sí» es una alerta que el entrenador debe revisar antes de programar (y, según el caso, pedir valoración médica).
 * Texto base: debe revisarlo Paquito (docs/ESTADO.md → bloqueos).
 */
export const PARQ_QUESTIONS = [
  "¿Algún médico te ha dicho alguna vez que tienes un problema de corazón o la tensión alta?",
  "¿Sientes dolor en el pecho en reposo, en tu día a día o al hacer ejercicio?",
  "¿Pierdes el equilibrio por mareos o has perdido el conocimiento en los últimos 12 meses? (Responde «no» si el mareo fue por respirar muy deprisa, también durante un ejercicio intenso).",
  "¿Te han diagnosticado alguna otra enfermedad crónica, distinta del corazón o la tensión alta?",
  "¿Tomas ahora medicación recetada para una enfermedad crónica?",
  "¿Tienes ahora, o has tenido en los últimos 12 meses, un problema de huesos, articulaciones o tejidos blandos (músculo, ligamento o tendón) que pueda empeorar si aumentas tu actividad física? (Responde «no» si fue en el pasado y no te limita ahora).",
  "¿Te ha dicho algún médico que solo debes hacer actividad física con supervisión médica?",
] as const;

export const Anamnesis = z.object({
  pastInjuries: z.string().trim().max(1500).default(""),
  surgeries: z.string().trim().max(1000).default(""),
  medication: z.string().trim().max(1000).default(""),
  painNow: z.number().int().min(0).max(10).default(0),
  painArea: z.string().trim().max(200).default(""),
  currentActivity: z.string().trim().max(1000).default(""),
  goal: z.string().trim().max(1000).default(""),
  other: z.string().trim().max(1500).default(""),
});
export type Anamnesis = z.infer<typeof Anamnesis>;

export const ANAMNESIS_LABEL: Record<keyof Anamnesis, string> = {
  pastInjuries: "Lesiones que has tenido",
  surgeries: "Operaciones",
  medication: "Medicación que tomas",
  painNow: "Dolor ahora (0 a 10)",
  painArea: "Dónde te duele",
  currentActivity: "Actividad física que haces ahora",
  goal: "Qué quieres conseguir",
  other: "Algo más que deba saber tu entrenador",
};

export const QuestionnaireInput = z.object({
  parq: z.array(z.boolean()).length(PARQ_QUESTIONS.length, "Responde todas las preguntas"),
  anamnesis: Anamnesis,
});
export type QuestionnaireInput = z.infer<typeof QuestionnaireInput>;

export const Questionnaire = QuestionnaireInput.extend({
  id: z.string(),
  submittedAt: z.string(),
  reviewedAt: z.string().nullable(),
  /** Índices de las preguntas del PAR-Q respondidas con «sí», más -1 si hay dolor ≥ 5. */
  alerts: z.array(z.number()),
});
export type Questionnaire = z.infer<typeof Questionnaire>;

export const QuestionnaireState = z.object({
  /** El cliente debe rellenarlo (nunca lo ha hecho o su entrenador ha pedido que lo repita). */
  pending: z.boolean(),
  last: Questionnaire.nullable(),
});
export type QuestionnaireState = z.infer<typeof QuestionnaireState>;

export const PAIN_ALERT = 5;
export function questionnaireAlerts(q: QuestionnaireInput) {
  const a = q.parq.flatMap((yes, i) => (yes ? [i] : []));
  if (q.anamnesis.painNow >= PAIN_ALERT) a.push(-1);
  return a;
}
