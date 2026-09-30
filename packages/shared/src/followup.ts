import { z } from "zod";
import { DateOnly, SafeId } from "./common";

// ── Fotos de progreso ─────────────────────────────────────────────────────────
export const PhotoPose = z.enum(["front", "side", "back"]);
export type PhotoPose = z.infer<typeof PhotoPose>;
export const POSE_LABEL: Record<PhotoPose, string> = { front: "De frente", side: "De perfil", back: "De espaldas" };

export const ProgressPhotoInput = z.object({ mediaId: z.string().uuid(), date: DateOnly, pose: PhotoPose });
export type ProgressPhotoInput = z.infer<typeof ProgressPhotoInput>;
export const ProgressPhoto = ProgressPhotoInput.extend({ id: z.string() });
export type ProgressPhoto = z.infer<typeof ProgressPhoto>;

// ── Métricas propias del estudio (dolor, grados de flexión, salto…) ──────────
export const MetricDefInput = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(60),
  unit: z.string().trim().max(12).default(""),
  /** Para colorear la tendencia: en el dolor, bajar es bueno. */
  higherIsBetter: z.boolean().default(true),
  /** El cliente puede anotarla desde su app. */
  clientCanLog: z.boolean().default(true),
});
export type MetricDefInput = z.infer<typeof MetricDefInput>;
export const MetricDef = MetricDefInput.extend({ id: z.string(), archived: z.boolean() });
export type MetricDef = z.infer<typeof MetricDef>;

export const MetricValueInput = z.object({
  metricId: z.string().uuid(),
  date: DateOnly,
  value: z.number().min(-100000).max(100000),
  note: z.string().trim().max(300).nullable().default(null),
});
export type MetricValueInput = z.infer<typeof MetricValueInput>;
export const MetricValue = MetricValueInput.extend({});
export type MetricValue = z.infer<typeof MetricValue>;
export const CustomMetrics = z.object({ defs: z.array(MetricDef), values: z.array(MetricValue) });
export type CustomMetrics = z.infer<typeof CustomMetrics>;

// ── Check-ins periódicos ──────────────────────────────────────────────────────
export const QuestionKind = z.enum(["text", "scale", "yesno", "number", "photo"]);
export type QuestionKind = z.infer<typeof QuestionKind>;
export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  text: "Texto",
  scale: "Escala del 1 al 10",
  yesno: "Sí o no",
  number: "Número",
  photo: "Foto",
};

export const CheckinQuestion = z.object({
  id: SafeId,
  kind: QuestionKind,
  label: z.string().trim().min(1, "Escribe la pregunta").max(200),
  required: z.boolean().default(true),
});
export type CheckinQuestion = z.infer<typeof CheckinQuestion>;

export const CheckinFormInput = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(80),
  intro: z.string().trim().max(500).default(""),
  questions: z.array(CheckinQuestion).min(1, "Añade al menos una pregunta").max(30),
});
export type CheckinFormInput = z.infer<typeof CheckinFormInput>;
export const CheckinForm = CheckinFormInput.extend({ id: z.string(), updatedAt: z.string(), assignedCount: z.number() });
export type CheckinForm = z.infer<typeof CheckinForm>;

export const CHECKIN_EVERY = [7, 14, 28] as const;
export const everyLabel = (d: number) => (d === 7 ? "cada semana" : d === 14 ? "cada 2 semanas" : d === 28 ? "cada 4 semanas" : `cada ${d} días`);

export const CheckinAssignInput = z.object({
  clientIds: z.array(z.string().uuid()).min(1, "Elige al menos un cliente").max(100),
  everyDays: z.number().int().refine((n) => (CHECKIN_EVERY as readonly number[]).includes(n), "Periodicidad no válida"),
  /** Primer día que le toca. */
  start: DateOnly,
});
export type CheckinAssignInput = z.infer<typeof CheckinAssignInput>;

/** Respuesta a una pregunta: texto, número (escala/número), sí/no o id de foto. */
export const CheckinAnswer = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);
export const CheckinAnswers = z.record(SafeId, CheckinAnswer);
export type CheckinAnswers = z.infer<typeof CheckinAnswers>;

export const CheckinAssignment = z.object({
  id: z.string(),
  formId: z.string(),
  formName: z.string(),
  clientId: z.string(),
  everyDays: z.number(),
  nextDue: DateOnly,
});
export type CheckinAssignment = z.infer<typeof CheckinAssignment>;

export const CheckinResponse = z.object({
  id: z.string(),
  assignmentId: z.string().nullable(),
  formName: z.string(),
  questions: z.array(CheckinQuestion),
  dueDate: DateOnly,
  answers: CheckinAnswers,
  submittedAt: z.string(),
  seen: z.boolean(),
});
export type CheckinResponse = z.infer<typeof CheckinResponse>;

/** Lo que le toca rellenar al cliente hoy. */
export const PendingCheckin = z.object({
  assignmentId: z.string(),
  formName: z.string(),
  intro: z.string(),
  questions: z.array(CheckinQuestion),
  dueDate: DateOnly,
});
export type PendingCheckin = z.infer<typeof PendingCheckin>;

/** Valida las respuestas contra las preguntas; devuelve el primer error en español o null. */
export function checkinError(questions: CheckinQuestion[], answers: CheckinAnswers): string | null {
  for (const q of questions) {
    const a = answers[q.id];
    const empty = a === undefined || a === null || a === "";
    if (empty) {
      if (q.required) return `Falta: «${q.label}»`;
      continue;
    }
    const ok =
      q.kind === "text" ? typeof a === "string" :
      q.kind === "photo" ? typeof a === "string" && /^[0-9a-f-]{36}$/.test(a) :
      q.kind === "yesno" ? typeof a === "boolean" :
      q.kind === "scale" ? typeof a === "number" && Number.isInteger(a) && a >= 1 && a <= 10 :
      typeof a === "number" && Number.isFinite(a);
    if (!ok) return `Respuesta no válida en «${q.label}»`;
  }
  return null;
}

/** Siguiente fecha de un check-in periódico estrictamente posterior a `today`. */
export function nextDueAfter(due: string, everyDays: number, today: string): string {
  const d = new Date(`${due}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + everyDays);
  while (d <= t);
  return d.toISOString().slice(0, 10);
}
