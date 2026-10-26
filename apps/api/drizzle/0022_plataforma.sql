ALTER TABLE "studios" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "plan" text DEFAULT 'fundador' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "billing_status" text DEFAULT 'comp' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "platform_customer_id" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "platform_subscription_id" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studios" ADD CONSTRAINT "studios_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "studios" ADD CONSTRAINT "studios_platform_subscription_id_unique" UNIQUE("platform_subscription_id");--> statement-breakpoint
-- Los estudios que ya existían (el de Paquito) quedan como fundadores y reciben una dirección a partir de su nombre.
-- Si la dirección ya está cogida, se repite, es corta o reservada, lleva detrás el principio de su id (único).
WITH raw AS (
  SELECT id, created_at,
    left(trim(both '-' from regexp_replace(translate(lower(name), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'), '[^a-z0-9]+', '-', 'g')), 34) AS b
  FROM studios WHERE slug IS NULL
), base AS (
  SELECT id, created_at, CASE WHEN length(trim(both '-' from b)) >= 3 THEN trim(both '-' from b) ELSE 'estudio' END AS b FROM raw
), numbered AS (
  SELECT id, b, row_number() OVER (PARTITION BY b ORDER BY created_at) AS n FROM base
)
UPDATE studios s SET slug = CASE
    WHEN numbered.n = 1 AND numbered.b <> 'estudio' AND numbered.b NOT IN ('admin', 'api', 'app', 'coach', 'www', 'alta', 'acceso', 'registro', 'instalar', 'plataforma', 'demo', 'legal')
      AND NOT EXISTS (SELECT 1 FROM studios t WHERE t.slug = numbered.b) THEN numbered.b
    ELSE numbered.b || '-' || left(replace(s.id::text, '-', ''), 6)
  END
FROM numbered WHERE s.id = numbered.id;
