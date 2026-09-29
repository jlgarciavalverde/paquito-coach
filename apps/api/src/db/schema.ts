import { sql } from "drizzle-orm";
import { bigserial, boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { MealDay, RoutineBlock, Targets, WorkoutLog } from "@coach/shared";

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
