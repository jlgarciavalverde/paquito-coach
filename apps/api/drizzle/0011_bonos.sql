CREATE TABLE "session_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"total" integer NOT NULL,
	"expires" date,
	"price" real,
	"paid" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "status" text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "pack_id" uuid;--> statement-breakpoint
ALTER TABLE "session_packs" ADD CONSTRAINT "session_packs_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_packs" ADD CONSTRAINT "session_packs_client_id_client_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_packs_client_idx" ON "session_packs" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_pack_id_session_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."session_packs"("id") ON DELETE set null ON UPDATE no action;