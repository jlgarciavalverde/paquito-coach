# 0015 — Dinero: cobros idempotentes, enlaces que caducan y cobros anonimizados al borrar
- **Estado**: aceptada · **Fecha**: 2026-09-30
## Contexto
La auditoría profunda (tanda A1) encontró fallos que cuestan dinero: `markPaid` comprobaba «pagado» fuera de la transacción
(dos eventos de Stripe, `checkout.session.completed` + `async_payment_succeeded`, podían crear dos bonos); los enlaces de pago
viejos seguían vivos tras renovar o cancelar una reserva; las facturas de una cuota podían duplicarse; dos altas de cuota a la
vez creaban dos; y al borrar un cliente sus cobros desaparecían (hay obligación de conservarlos) mientras Stripe le seguía
cobrando la cuota.
## Decisión
- **Pagar es un cambio de estado condicional**: `UPDATE payments SET status='paid' … WHERE id=? AND status NOT IN
  ('paid','refunded') RETURNING` dentro de la transacción. Si no devuelve fila, otro evento ya lo aplicó y no se hace nada. El
  bono se crea en la misma transacción y se enlaza (`pack_id`), que además frena una segunda creación.
- **Una reserva solo se confirma si sigue esperando el pago** (`scheduled` + `pending`). Si llega el pago de una reserva ya
  cancelada o liberada, el cobro queda registrado, la cita no revive y el entrenador recibe un aviso para devolverlo o
  reprogramar.
- **Los enlaces viejos se caducan en Stripe** (`gateway.expireCheckout`) al renovar un cobro, al cancelar una reserva pendiente
  de pago y al liberar retenciones caducadas.
- **Unicidad en la base de datos**, no solo en el código: `payments.stripe_invoice_id` único (las facturas se insertan con
  `ON CONFLICT … DO UPDATE` que no pisa una pagada); una sola suscripción viva por cliente (índice único parcial);
  `customerOf` y el alta de cuota con `pg_advisory_xact_lock` por cliente.
- **Borrar un cliente**: primero se borra su Customer en Stripe (cancela sus cuotas); sus cobros **se conservan anonimizados**:
  `payments.client_id` pasa a `ON DELETE SET NULL` y cada cobro guarda `client_name` (el CSV del gestor sigue cuadrando).
- **Reservas**: tope de reservas futuras por cliente (ajuste del estudio, 4 por defecto) y un bono solo cubre la reserva si le
  quedan sesiones para todas sus reservas futuras más esta.
- **Arranque**: la API se niega a arrancar en producción con `PAYMENTS_FAKE` (o `AI_FAKE` fuera de la demo).
## Consecuencias
- Pruebas en `audit.a1.test.ts` (una por hallazgo), incluidas carreras reales con `Promise.all`.
- El nombre del cliente queda en los cobros borrados: es el mínimo que exige la contabilidad; se explica en `/privacidad`.
- Si Stripe falla al caducar un enlace o borrar el Customer, se registra y se sigue (el error `invalid_request` de algo ya
  caducado o borrado se ignora); la condición del `UPDATE` sigue protegiendo ante un pago tardío.
