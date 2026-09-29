CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"price_id" uuid,
	"name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"checkout_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "payment_status" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "hold_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_settings" ADD COLUMN "pay_at_booking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_settings" ADD COLUMN "session_price_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "appointment_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "stripe_invoice_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_client_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_client_idx" ON "subscriptions" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_uq" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;