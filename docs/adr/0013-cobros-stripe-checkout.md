# 0013 — Cobros con Stripe Checkout y webhooks firmados
- **Estado**: aceptada · **Fecha**: 2026-09-29
## Contexto
Paquito quiere cobrar desde la app bonos, sesiones sueltas, cuotas mensuales y cobros puntuales. Elegido Stripe (tarjeta,
Apple Pay, Google Pay, SEPA; sin cuota fija). Bizum queda fuera (exige TPV de su banco).
## Decisión
- **Stripe Checkout** (página de Stripe): la app nunca recibe datos de tarjeta. Cada cobro se crea con `price_data` en línea
  (sin sincronizar productos) y un Customer por cliente (`client_profiles.stripe_customer_id`).
- **El importe lo fija el servidor** (tarifa del estudio o importe del entrenador); el cliente solo elige una tarifa activa.
- **El pago solo vale con el webhook firmado** (`POST /api/v1/stripe/webhook`, cuerpo crudo + `constructEvent`, fuera de la
  comprobación de Origin). Se exige que la sesión coincida con el cobro (`metadata.paymentId` + `checkout_id`) y que
  `amount_total` sea el esperado; si no, «fallido». Eventos idempotentes (`stripe_events`); si el proceso falla, se borra el
  evento para que Stripe lo reintente.
- Pagar un bono o sesión crea el `session_pack` pagado (sesiones y caducidad de la tarifa). Reembolso → cobro «devuelto» y bono archivado.
- Clave **restringida** con permisos mínimos; claves solo en el `.env` del VPS. Sin claves, cobros desactivados; demo, nunca.
- Pruebas: `createFakeGateway` no llama a Stripe pero verifica las firmas con el SDK real; en e2e (`PAYMENTS_FAKE=1`) existe
  `POST /api/v1/stripe/simulate`, que solo se registra con la pasarela simulada.
## Consecuencias
Comisión de Stripe por cobro. Las cuotas mensuales y el pago al reservar (C2) reutilizan `payments` y el webhook.
Los recibos no son facturas: se exporta CSV para el gestor.
