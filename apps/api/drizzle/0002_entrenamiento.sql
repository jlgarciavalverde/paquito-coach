CREATE TYPE "public"."workout_status" AS ENUM('planned', 'done', 'skipped');--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid,
	"source_key" text,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"muscle" text NOT NULL,
	"secondary" text[] DEFAULT '{}'::text[] NOT NULL,
	"equipment" text NOT NULL,
	"instructions" text[] DEFAULT '{}'::text[] NOT NULL,
	"video_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "exercises_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"routine_id" uuid,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"coach_notes" text DEFAULT '' NOT NULL,
	"blocks" jsonb NOT NULL,
	"log" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "workout_status" DEFAULT 'planned' NOT NULL,
	"session_rpe" integer,
	"client_comment" text,
	"completed_at" timestamp with time zone,
	"seen_by_coach" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_client_id_client_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_studio_idx" ON "exercises" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "exercises_name_idx" ON "exercises" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "routines_studio_idx" ON "routines" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "workouts_client_date_idx" ON "workouts" USING btree ("client_id","date");--> statement-breakpoint
CREATE INDEX "workouts_studio_done_idx" ON "workouts" USING btree ("studio_id","completed_at");