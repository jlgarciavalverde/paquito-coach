CREATE TABLE "error_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"stack" text DEFAULT '' NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"last_request_id" text,
	"count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "error_reports_fingerprint_uq" ON "error_reports" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "error_reports_last_seen_idx" ON "error_reports" USING btree ("last_seen");