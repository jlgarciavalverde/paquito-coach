ALTER TABLE "client_profiles" ADD COLUMN "stripe_customer_account" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "stripe_account" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "stripe_charges_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "stripe_payouts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "stripe_details_submitted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "stripe_account" text;--> statement-breakpoint
ALTER TABLE "studios" ADD CONSTRAINT "studios_stripe_account_id_unique" UNIQUE("stripe_account_id");