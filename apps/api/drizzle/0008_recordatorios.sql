CREATE TABLE "reminder_log" (
	"kind" text NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_log_kind_user_id_date_pk" PRIMARY KEY("kind","user_id","date")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;