# 0019 — Cobros de cada estudio con Stripe Connect Express y cargos directos
- **Estado**: aceptada · **Fecha**: 2026-10-26
## Contexto
Con varios estudios (ADR 0018), los cobros a los clientes no pueden ir a la cuenta de Stripe de la plataforma: cada
entrenador tiene que cobrar en la suya. Decisiones del usuario: cuentas **Express** (Stripe hace el alta y da un panel
sencillo) y **sin comisión** de la plataforma (solo la cuota mensual).
## Decisión
- **Cargos directos** (`Stripe-Account` en cada llamada): el cliente de Stripe, la página de pago, la cuota y el cobro viven
  en la cuenta del entrenador, y **la comisión de Stripe la paga él**. Con cargos «destination» la pagaría la plataforma,
  y sin comisión propia eso sería perder dinero en cada cobro.
- `studios.stripe_account_id` + `charges/payouts/details` (se actualizan con `account.updated` y al consultar
  `GET /studio/connect`, por si el webhook tarda). Alta con `POST /studio/connect/onboard` (cuenta creada una sola vez, con
  cerrojo) y enlace de un uso de Stripe; panel con `POST /studio/connect/dashboard`.
- Cada cobro y cuota guarda `stripe_account`; el cliente de Stripe guarda en qué cuenta vive (`stripe_customer_account`) y
  se crea de nuevo si el estudio cambia de cuenta.
- **Webhook**: un mismo endpoint con dos secretos (plataforma y Connect). Un evento solo puede tocar cobros, cuotas o
  devoluciones creados en **su** cuenta (`event.account`); los eventos sin cuenta son de la plataforma (cuota de los
  estudios, ADR 0018). Así un estudio no puede dar por pagado el cobro de otro.
- Sin cuenta activa, el estudio no cobra con tarjeta (409 `payments_not_connected`), y sus clientes no ven tarifas para pagar.
## Consecuencias
- Pruebas: `connect.test.ts` (alta única, cuenta de cada objeto, eventos de otra cuenta, cuenta deshabilitada, cambio de
  cuenta, permisos); las de cobros conectan antes la cuenta simulada (`connectStripe`). e2e `16-cobros` activa los cobros.
- En Stripe hay que activar Connect (Express, España), la marca de la plataforma y un **segundo destino de webhooks de
  Connect** (docs/OPERACIONES.md). Hasta entonces, en producción no se cobra con tarjeta.
