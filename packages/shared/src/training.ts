import { z } from "zod";
import { Progression } from "./progression";
import { DateOnly } from "./common";

export const MUSCLES = [
  "chest", "lats", "middleBack", "lowerBack", "traps", "shoulders", "biceps", "triceps", "forearms",
  "abs", "quads", "hamstrings", "glutes", "calves", "adductors", "abductors", "neck", "other",
] as const;
export const Muscle = z.enum(MUSCLES);
export type Muscle = z.infer<typeof Muscle>;
export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: "Pecho", lats: "Dorsal", middleBack: "Espalda media", lowerBack: "Lumbar", traps: "Trapecio",
  shoulders: "Hombro", biceps: "Bíceps", triceps: "Tríceps", forearms: "Antebrazo", abs: "Core",
  quads: "Cuádriceps", hamstrings: "Isquiotibiales", glutes: "Glúteo", calves: "Gemelo",
  adductors: "Aductores", abductors: "Abductores", neck: "Cuello", other: "Otro",
};

export const EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "bands", "other"] as const;
export const Equipment = z.enum(EQUIPMENT);
export type Equipment = z.infer<typeof Equipment>;
export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barra", dumbbell: "Mancuernas", machine: "Máquina", cable: "Polea",
  bodyweight: "Peso corporal", kettlebell: "Kettlebell", bands: "Gomas", other: "Otro",
};

/** URL de vídeo admitida: YouTube o Vimeo (se incrustan sin cookies). */
export const VideoUrl = z
  .string()
  .trim()
  .url("Enlace no válido")
  .max(300)
  .refine((u) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//.test(u), "Solo enlaces de YouTube o Vimeo");

export const Exercise = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  muscle: Muscle,
  secondary: z.array(Muscle),
  equipment: Equipment,
  instructions: z.array(z.string()),
  videoUrl: z.string().nullable(),
  /** true = ejercicio propio del estudio (editable); false = biblioteca común. */
  own: z.boolean(),
});
export type Exercise = z.infer<typeof Exercise>;

export const ExerciseInput = z.object({
  name: z.string().trim().min(2, "Escribe un nombre").max(120),
  muscle: Muscle,
  equipment: Equipment,
  instructions: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  videoUrl: VideoUrl.nullable().optional(),
});
export type ExerciseInput = z.infer<typeof ExerciseInput>;

export const ExerciseQuery = z.object({
  q: z.string().trim().max(80).optional(),
  muscle: Muscle.optional(),
  equipment: Equipment.optional(),
  own: z.enum(["1"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

const shortText = (max: number) => z.string().trim().max(max).default("");

/** Una línea de la rutina: un ejercicio con su prescripción. Texto libre en reps/carga para admitir «8-10», «30 s», «70 % 1RM». */
export const RoutineItem = z.object({
  id: z.string().min(1).max(40),
  exerciseId: z.string().uuid(),
  exerciseName: z.string().max(120),
  sets: z.number().int().min(1).max(20),
  reps: shortText(20),
  load: shortText(30),
  effort: shortText(20), // RIR/RPE, p. ej. «RIR 2» o «RPE 8»
  tempo: shortText(12),
  restSec: z.number().int().min(0).max(900).nullable().default(null),
  notes: shortText(300),
  /** Mismo valor que el anterior = superserie con él. */
  group: z.string().max(4).nullable().default(null),
});
export type RoutineItem = z.infer<typeof RoutineItem>;

export const RoutineBlock = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().max(60),
  items: z.array(RoutineItem).max(30),
});
export type RoutineBlock = z.infer<typeof RoutineBlock>;

export const RoutineBody = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(100),
  description: z.string().trim().max(1000).default(""),
  blocks: z.array(RoutineBlock).max(12),
});
export type RoutineBody = z.infer<typeof RoutineBody>;

export const Routine = RoutineBody.extend({
  id: z.string(),
  updatedAt: z.string(),
  exerciseCount: z.number(),
  assignedCount: z.number(),
});
export type Routine = z.infer<typeof Routine>;

export const AssignInput = z.object({
  clientIds: z.array(z.string().uuid()).min(1, "Elige al menos un cliente").max(100),
  dates: z.array(DateOnly).min(1, "Elige al menos un día").max(120),
  /** Subir la carga cada semana contando desde el primer día asignado. */
  progression: Progression.nullable().default(null),
});
export type AssignInput = z.infer<typeof AssignInput>;

/** Lo que el cliente anota en cada serie. */
export const SetLog = z.object({
  reps: z.string().trim().max(10).default(""),
  load: z.string().trim().max(12).default(""),
  rpe: z.number().min(1).max(10).nullable().default(null),
  done: z.boolean().default(false),
});
export type SetLog = z.infer<typeof SetLog>;

/** itemId → series anotadas. */
export const WorkoutLog = z.record(z.string().max(40), z.array(SetLog).max(20));
export type WorkoutLog = z.infer<typeof WorkoutLog>;

export const WorkoutStatus = z.enum(["planned", "done", "skipped"]);
export type WorkoutStatus = z.infer<typeof WorkoutStatus>;

export const Workout = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  date: DateOnly,
  title: z.string(),
  coachNotes: z.string(),
  blocks: z.array(RoutineBlock),
  log: WorkoutLog,
  status: WorkoutStatus,
  sessionRpe: z.number().nullable(),
  clientComment: z.string().nullable(),
  completedAt: z.string().nullable(),
  routineId: z.string().nullable(),
});
export type Workout = z.infer<typeof Workout>;

export const WorkoutRange = z.object({ from: DateOnly, to: DateOnly });

export const WorkoutPatch = z.object({
  date: DateOnly.optional(),
  title: z.string().trim().min(1).max(100).optional(),
  coachNotes: z.string().trim().max(2000).optional(),
  blocks: z.array(RoutineBlock).max(12).optional(),
});

export const CompleteWorkoutInput = z.object({
  sessionRpe: z.number().int().min(1).max(10).nullable(),
  comment: z.string().trim().max(1000).nullable(),
  skipped: z.boolean().default(false),
});

/** Actividad reciente para el entrenador. */
export const ActivityItem = z.object({
  workoutId: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  title: z.string(),
  date: DateOnly,
  status: WorkoutStatus,
  sessionRpe: z.number().nullable(),
  clientComment: z.string().nullable(),
  completedAt: z.string(),
});
export type ActivityItem = z.infer<typeof ActivityItem>;

/** Escala de esfuerzo percibido (Borg CR-10 adaptada) con el color de disco que le corresponde. */
export const RPE_SCALE: { value: number; label: string; tone: "green" | "yellow" | "red" }[] = [
  { value: 1, label: "Muy suave", tone: "green" },
  { value: 2, label: "Suave", tone: "green" },
  { value: 3, label: "Suave", tone: "green" },
  { value: 4, label: "Moderado", tone: "green" },
  { value: 5, label: "Algo duro", tone: "yellow" },
  { value: 6, label: "Duro", tone: "yellow" },
  { value: 7, label: "Muy duro", tone: "yellow" },
  { value: 8, label: "Muy duro", tone: "red" },
  { value: 9, label: "Casi al máximo", tone: "red" },
  { value: 10, label: "Máximo", tone: "red" },
];

/** Un cliente que pide atención del entrenador y por qué (ver `GET /attention`). */
export const AttentionItem = z.object({
  clientId: z.string(),
  clientName: z.string(),
  reasons: z.array(z.object({ kind: z.enum(["missed", "inactive", "health", "unanswered", "checkin"]), text: z.string() })),
});
export type AttentionItem = z.infer<typeof AttentionItem>;
