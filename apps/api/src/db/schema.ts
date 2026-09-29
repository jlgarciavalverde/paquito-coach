import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigserial, boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { BookingWindow, CheckinAnswers, CheckinQuestion, MealDay, Progression, ProgramSlot, RoutineBlock, Targets, WorkoutLog } from "@coach/shared";

/**
 * Esquema de la base de datos. Regla de oro: toda tabla con datos de un estudio lleva `studio_id`
 * y toda consulta filtra por él (ver `lib/scope.ts`). Tras cambiar este archivo: `pnpm --filter @coach/api db:generate`.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const roleEnum = pgEnum("role", ["coach", "client"]);
export const clientStatusEnum = pgEnum("client_status", ["invited", "pending", "active", "archived", "no_account"]);

export const studios = pgTable("studios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Código público para que un cliente se registre solo (queda pendiente de aceptar). Rotable. */
  joinCode: text("join_code").notNull().unique(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    healthConsentAt: ts("health_consent_at"),
    /** Recibir recordatorios push (entreno del día, resumen del entrenador). */
    reminders: boolean("reminders").notNull().default(true),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA-256 del token; el token en claro solo existe en la cookie del navegador. */
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastUsedAt: ts("last_used_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const clientProfiles = pgTable(
  "client_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    /** Cuenta vinculada; null en fichas sin cuenta o invitaciones aún sin aceptar. */
    userId: uuid("user_id").unique().references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    birthDate: date("birth_date", { mode: "string" }),
    goal: text("goal"),
    healthNotes: text("health_notes"),
    privateNotes: text("private_notes"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    status: clientStatusEnum("status").notNull(),
    /** El entrenador ha pedido que vuelva a rellenar el cuestionario de salud. */
    questionnaireRequestedAt: ts("questionnaire_requested_at"),
    /** Cliente en Stripe (se crea al primer cobro). */
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("client_profiles_studio_idx").on(t.studioId, t.status)],
);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Enlaces de un solo uso para restablecer la contraseña (los genera el entrenador para sus clientes). */
export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Registro de acciones sensibles (accesos a fichas con datos de salud, altas, bajas…). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    studioId: uuid("studio_id").references(() => studios.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: jsonb("meta"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_studio_idx").on(t.studioId, t.createdAt)],
);

// ── F2: entrenamiento ──────────────────────────────────────────────────────────

export const workoutStatusEnum = pgEnum("workout_status", ["planned", "done", "skipped"]);

/** Ejercicios. `studio_id` nulo = biblioteca común (semilla); con estudio = propios de ese entrenador. */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").references(() => studios.id, { onDelete: "cascade" }),
    /** Clave de origen de la semilla (idempotencia); nula en los propios. */
    sourceKey: text("source_key").unique(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    muscle: text("muscle").notNull(),
    secondary: text("secondary").array().notNull().default(sql`'{}'::text[]`),
    equipment: text("equipment").notNull(),
    instructions: text("instructions").array().notNull().default(sql`'{}'::text[]`),
    videoUrl: text("video_url"),
    createdAt: createdAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("exercises_studio_idx").on(t.studioId), index("exercises_name_idx").on(sql`lower(${t.name})`)],
);

/** Rutinas de la biblioteca del entrenador. El contenido (bloques y ejercicios) va en JSONB validado con Zod (ADR 0007). */
export const routines = pgTable(
  "routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    blocks: jsonb("blocks").$type<RoutineBlock[]>().notNull().default(sql`'[]'::jsonb`),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("routines_studio_idx").on(t.studioId)],
);

/**
 * Entreno asignado a un cliente en un día. Guarda una COPIA de los bloques: editar la rutina de la biblioteca
 * no cambia lo ya asignado (ni lo que el cliente ya registró).
 */
export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    routineId: uuid("routine_id").references(() => routines.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }).notNull(),
    title: text("title").notNull(),
    coachNotes: text("coach_notes").notNull().default(""),
    blocks: jsonb("blocks").$type<RoutineBlock[]>().notNull(),
    log: jsonb("log").$type<WorkoutLog>().notNull().default(sql`'{}'::jsonb`),
    status: workoutStatusEnum("status").notNull().default("planned"),
    sessionRpe: integer("session_rpe"),
    clientComment: text("client_comment"),
    completedAt: ts("completed_at"),
    seenByCoach: boolean("seen_by_coach").notNull().default(false),
    /** Si viene de un programa de varias semanas (H2). */
    programRunId: uuid("program_run_id").references((): AnyPgColumn => programRuns.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("workouts_client_date_idx").on(t.clientId, t.date), index("workouts_studio_done_idx").on(t.studioId, t.completedAt)],
);

// ── F3: nutrición ──────────────────────────────────────────────────────────────

/** Plan de comidas. `client_id` nulo = plantilla de la biblioteca. Un cliente tiene como mucho un plan activo. */
export const mealPlans = pgTable(
  "meal_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clientProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes").notNull().default(""),
    targets: jsonb("targets").$type<Targets>().notNull(),
    mode: text("mode").$type<"same" | "weekly">().notNull(),
    days: jsonb("days").$type<MealDay[]>().notNull(),
    active: boolean("active").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    index("meal_plans_studio_idx").on(t.studioId),
    uniqueIndex("meal_plans_one_active_uq").on(t.clientId).where(sql`${t.active} and ${t.archivedAt} is null`),
  ],
);

/** Lo que el cliente marca como cumplido cada día. */
export const mealChecks = pgTable(
  "meal_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    mealId: text("meal_id").notNull(),
    done: boolean("done").notNull(),
    note: text("note"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("meal_checks_uq").on(t.clientId, t.date, t.mealId)],
);

// ── F4: agenda ─────────────────────────────────────────────────────────────────

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    /** Nulo = cita sin cliente (reunión, bloqueo de agenda…). */
    clientId: uuid("client_id").references(() => clientProfiles.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"session" | "assessment" | "other">().notNull(),
    title: text("title").notNull().default(""),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    location: text("location").notNull().default(""),
    notes: text("notes").notNull().default(""),
    /** H3: asistencia y bono del que descuenta. */
    status: text("status").$type<"scheduled" | "done" | "no_show" | "cancelled">().notNull().default("scheduled"),
    /** Reservada por el propio cliente (H3b). */
    bookedByClient: boolean("booked_by_client").notNull().default(false),
    /** C2: reserva pagada al reservar. `pending` = retenida hasta `hold_expires_at` mientras paga. */
    paymentStatus: text("payment_status").$type<"pending" | "paid">(),
    holdExpiresAt: ts("hold_expires_at"),
    packId: uuid("pack_id").references((): AnyPgColumn => sessionPacks.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("appointments_studio_time_idx").on(t.studioId, t.startsAt), index("appointments_client_time_idx").on(t.clientId, t.startsAt)],
);

// ── F5: mensajes ───────────────────────────────────────────────────────────────

/** Archivos subidos (fotos del chat). Se guardan en disco (DATA_DIR/media) con el id como nombre. */
export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
  uploaderId: uuid("uploader_id").references(() => users.id, { onDelete: "set null" }),
  /** Conversación a la que pertenece (el cliente); decide quién puede verlo. */
  clientId: uuid("client_id").references(() => clientProfiles.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  createdAt: createdAt(),
});

/** Una conversación por cliente: la clave es `client_id`. */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    fromCoach: boolean("from_coach").notNull(),
    body: text("body").notNull().default(""),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("messages_client_time_idx").on(t.clientId, t.createdAt), index("messages_studio_time_idx").on(t.studioId, t.createdAt)],
);

/** Hasta cuándo ha leído cada persona cada conversación. */
export const conversationReads = pgTable(
  "conversation_reads",
  {
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: ts("last_read_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.clientId, t.userId] })],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
});

// ── F7: progreso ───────────────────────────────────────────────────────────────

/** Peso y medidas del cliente: una fila por día (se sobrescribe si se vuelve a anotar ese día). */
export const bodyMetrics = pgTable(
  "body_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    weightKg: real("weight_kg"),
    waistCm: real("waist_cm"),
    hipCm: real("hip_cm"),
    bodyFatPct: real("body_fat_pct"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("body_metrics_client_date_uq").on(t.clientId, t.date)],
);

// ── F8: cuestionario de salud (PAR-Q+ y anamnesis) ─────────────────────────────

export const questionnaires = pgTable(
  "questionnaires",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("parq"),
    answers: jsonb("answers").$type<{ parq: boolean[]; anamnesis: Record<string, unknown> }>().notNull(),
    alerts: jsonb("alerts").$type<number[]>().notNull(),
    submittedAt: ts("submitted_at").notNull().defaultNow(),
    reviewedAt: ts("reviewed_at"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("questionnaires_client_idx").on(t.clientId, t.submittedAt)],
);

// ── F10: recordatorios ─────────────────────────────────────────────────────────

/** Qué recordatorio se ha mandado a quién y qué día: evita repetirlos si el servidor se reinicia. */
export const reminderLog = pgTable(
  "reminder_log",
  {
    kind: text("kind").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    sentAt: ts("sent_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.userId, t.date] })],
);

// ── H1: evolución y seguimiento (fotos, métricas propias, check-ins) ───────────

export const progressPhotos = pgTable(
  "progress_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    pose: text("pose").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("progress_photos_client_idx").on(t.clientId, t.date)],
);

export const metricDefs = pgTable("metric_defs", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  unit: text("unit").notNull().default(""),
  higherIsBetter: boolean("higher_is_better").notNull().default(true),
  clientCanLog: boolean("client_can_log").notNull().default(true),
  archivedAt: ts("archived_at"),
  createdAt: createdAt(),
});

export const metricValues = pgTable(
  "metric_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    metricId: uuid("metric_id").notNull().references(() => metricDefs.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    value: real("value").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("metric_values_uq").on(t.clientId, t.metricId, t.date)],
);

export const checkinForms = pgTable("checkin_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  intro: text("intro").notNull().default(""),
  questions: jsonb("questions").$type<CheckinQuestion[]>().notNull(),
  archivedAt: ts("archived_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Un formulario asignado a un cliente con su periodicidad; `next_due` es el próximo día que le toca. */
export const checkinAssignments = pgTable(
  "checkin_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    formId: uuid("form_id").notNull().references(() => checkinForms.id, { onDelete: "cascade" }),
    everyDays: integer("every_days").notNull(),
    nextDue: date("next_due", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("checkin_assignments_uq").on(t.clientId, t.formId)],
);

/** Respuestas: guardan copia de las preguntas para que editar el formulario no cambie lo ya contestado. */
export const checkinResponses = pgTable(
  "checkin_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id").references(() => checkinAssignments.id, { onDelete: "set null" }),
    formName: text("form_name").notNull(),
    questions: jsonb("questions").$type<CheckinQuestion[]>().notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    answers: jsonb("answers").$type<CheckinAnswers>().notNull(),
    submittedAt: ts("submitted_at").notNull().defaultNow(),
    seenAt: ts("seen_at"),
  },
  (t) => [index("checkin_responses_client_idx").on(t.clientId, t.submittedAt)],
);

// ── H2: programas de varias semanas ────────────────────────────────────────────

export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  weeks: integer("weeks").notNull(),
  slots: jsonb("slots").$type<ProgramSlot[]>().notNull(),
  progression: jsonb("progression").$type<Progression | null>(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Un programa aplicado a un cliente desde una fecha. Sus entrenos llevan `program_run_id`. */
export const programRuns = pgTable(
  "program_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    start: date("start", { mode: "string" }).notNull(),
    weeks: integer("weeks").notNull(),
    endedAt: ts("ended_at"),
    createdAt: createdAt(),
  },
  (t) => [index("program_runs_client_idx").on(t.clientId)],
);

// ── H3: bonos de sesiones ──────────────────────────────────────────────────────

export const sessionPacks = pgTable(
  "session_packs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    total: integer("total").notNull(),
    expires: date("expires", { mode: "string" }),
    price: real("price"),
    paid: boolean("paid").notNull().default(false),
    notes: text("notes").notNull().default(""),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [index("session_packs_client_idx").on(t.clientId)],
);

/** H3b: reservas por el cliente. Una fila por estudio. */
export const bookingSettings = pgTable("booking_settings", {
  studioId: uuid("studio_id").primaryKey().references(() => studios.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  slotMinutes: integer("slot_minutes").notNull().default(60),
  capacity: integer("capacity").notNull().default(1),
  noticeHours: integer("notice_hours").notNull().default(12),
  cancelHours: integer("cancel_hours").notNull().default(24),
  location: text("location").notNull().default(""),
  windows: jsonb("windows").$type<BookingWindow[]>().notNull().default(sql`'[]'::jsonb`),
  payAtBooking: boolean("pay_at_booking").notNull().default(false),
  sessionPriceId: uuid("session_price_id"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ── H4: biblioteca de material ────────────────────────────────────────────────

export const resources = pgTable("resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  kind: text("kind").$type<"link" | "pdf">().notNull(),
  url: text("url"),
  mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
  forAll: boolean("for_all").notNull().default(true),
  clientIds: jsonb("client_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
});

// ── I1: IA con los documentos del entrenador ──────────────────────────────────

/** Documentos del entrenador (su metodología). Se guarda el texto extraído, no el archivo. */
export const aiDocuments = pgTable("ai_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: text("kind").$type<"pdf" | "docx" | "text">().notNull(),
  status: text("status").$type<"ready" | "error">().notNull(),
  error: text("error"),
  chars: integer("chars").notNull().default(0),
  createdAt: createdAt(),
});

export const aiChunks = pgTable(
  "ai_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull().references(() => aiDocuments.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    text: text("text").notNull(),
    embedding: real("embedding").array().notNull(),
  },
  (t) => [index("ai_chunks_studio_idx").on(t.studioId)],
);

/** Uso de la IA (para el límite diario propio y para saber cuánto se usa). */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    tokens: integer("tokens").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_studio_idx").on(t.studioId, t.createdAt)],
);

// ── C1: cobros con Stripe ──────────────────────────────────────────────────────

/** Tarifas del estudio (importes en céntimos). */
export const prices = pgTable("prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").$type<"pack" | "session" | "subscription">().notNull(),
  amountCents: integer("amount_cents").notNull(),
  sessions: integer("sessions"),
  validDays: integer("valid_days"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** Cada cobro. El importe lo fija el servidor; Stripe confirma por webhook. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    priceId: uuid("price_id").references(() => prices.id, { onDelete: "set null" }),
    kind: text("kind").$type<"pack" | "session" | "link" | "subscription">().notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").$type<"pending" | "paid" | "failed" | "refunded" | "expired">().notNull().default("pending"),
    checkoutId: text("checkout_id"),
    checkoutUrl: text("checkout_url"),
    checkoutExpiresAt: ts("checkout_expires_at"),
    paymentIntentId: text("payment_intent_id"),
    receiptUrl: text("receipt_url"),
    packId: uuid("pack_id").references(() => sessionPacks.id, { onDelete: "set null" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
    subscriptionId: uuid("subscription_id"),
    stripeInvoiceId: text("stripe_invoice_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    paidAt: ts("paid_at"),
  },
  (t) => [index("payments_studio_idx").on(t.studioId, t.createdAt), index("payments_client_idx").on(t.clientId), uniqueIndex("payments_checkout_uq").on(t.checkoutId)],
);

/** Eventos de Stripe ya procesados (los webhooks pueden repetirse). */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

/** C2: cuotas mensuales (suscripciones de Stripe). */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    priceId: uuid("price_id").references(() => prices.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").$type<"incomplete" | "active" | "past_due" | "canceled" | "unpaid">().notNull().default("incomplete"),
    checkoutId: text("checkout_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: ts("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("subscriptions_client_idx").on(t.clientId), uniqueIndex("subscriptions_stripe_uq").on(t.stripeSubscriptionId)],
);
