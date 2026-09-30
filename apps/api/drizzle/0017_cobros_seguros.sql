ALTER TABLE "payments" DROP CONSTRAINT "payments_client_id_client_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "client_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "payments" SET "client_name" = cp."name" FROM "client_profiles" cp WHERE cp."id" = "payments"."client_id";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_client_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_invoice_uq" ON "payments" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "payments_intent_idx" ON "payments" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_photos_media_uq" ON "progress_photos" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_live_uq" ON "subscriptions" USING btree ("client_id") WHERE "subscriptions"."status" in ('active', 'past_due');