CREATE TABLE "program_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"program_id" uuid,
	"name" text NOT NULL,
	"start" date NOT NULL,
	"weeks" integer NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"weeks" integer NOT NULL,
	"slots" jsonb NOT NULL,
	"progression" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "program_run_id" uuid;--> statement-breakpoint
ALTER TABLE "program_runs" ADD CONSTRAINT "program_runs_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_runs" ADD CONSTRAINT "program_runs_client_id_client_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_runs" ADD CONSTRAINT "program_runs_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "program_runs_client_idx" ON "program_runs" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_program_run_id_program_runs_id_fk" FOREIGN KEY ("program_run_id") REFERENCES "public"."program_runs"("id") ON DELETE set null ON UPDATE no action;