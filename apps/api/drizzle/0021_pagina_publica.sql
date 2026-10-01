CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "accent" text DEFAULT 'azul' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "tagline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "specialties" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "hours" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "contact_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "instagram" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "photo_media_id" uuid;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "legal_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "tax_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "legal_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_studio_fk_idx" ON "leads" USING btree ("studio_id","created_at");