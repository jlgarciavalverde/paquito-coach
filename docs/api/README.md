# API

- Especificación **OpenAPI 3** generada de los esquemas Zod: [`openapi.json`](openapi.json) (`pnpm openapi` la regenera; necesita `pnpm db:up`).
- Interactiva en desarrollo: `http://localhost:3000/api/docs`. En producción está desactivada.
- Prefijo `/api/v1`. JSON. Autenticación por cookie de sesión (`sid` / `__Host-sid`).
- Toda petición que no sea GET debe llevar un `Origin` permitido (si no: `403 bad_origin`).
- Errores: `{ "error": "<código estable>", "message": "<texto en español para mostrar>" }`.

| Código | Cuándo |
|---|---|
| 400 `validation`, `weak_password`, `bad_password`, `unknown_exercise`, `unknown_meal`, `bad_range` | datos no válidos |
| 401 `unauthorized`, `invalid_credentials` | sin sesión / credenciales |
| 403 `forbidden`, `bad_origin`, `bad_setup_code` | sin permiso |
| 404 `not_found`, `join_code_invalid` | no existe **o no es de tu estudio** |
| 409 `email_taken`, `already_setup`, `has_account`, `not_pending`, `no_account`, `not_archived`, `no_plan` | conflicto de estado |
| 410 `invite_used`, `invite_invalid`, `reset_invalid` | enlace caducado o usado |
| 429 `rate_limited`, `locked` | límite por IP o bloqueo por cuenta |

## Endpoints (v1.0)
| Método | Ruta | Quién | Qué |
|---|---|---|---|
| GET | `/auth/setup-status` | público | ¿falta el alta inicial? |
| POST | `/auth/setup` | público + código | crea estudio y entrenador (una vez) |
| POST | `/auth/login` · `/auth/logout` | público | sesión |
| GET | `/auth/invites/:token` · `/auth/join/:code` | público | datos para la pantalla de registro |
| POST | `/auth/register` | público | alta de cliente con invitación o código |
| POST | `/auth/demo` (`as`: coach/client) | público, **solo demo** | entrar con un clic |
| POST | `/auth/password/reset` | público + token | contraseña nueva con enlace del entrenador |
| POST | `/auth/password/change` | con sesión | cambiar contraseña (cierra las demás sesiones) |
| GET | `/me` · `/me/sessions` | con sesión | yo · mis sesiones |
| DELETE | `/me/sessions/:id` | con sesión | cerrar una sesión |
| PATCH | `/me/preferences` (`reminders`) | con sesión | activar/desactivar recordatorios |
| GET/POST | `/clients` | entrenador | listar (filtros `status`, `q`) · crear (con o sin invitación) |
| GET/PATCH | `/clients/:id` | entrenador | ficha (queda en auditoría) · editar |
| POST | `/clients/:id/invite` · `reset-link` · `accept` · `reject` · `archive` · `unarchive` | entrenador | acciones |
| GET/POST | `/studio/join-code` · `/studio/join-code/rotate` | entrenador | código público |
| GET | `/exercises` (`q`, `muscle`, `equipment`, `own`, `limit`) · `/exercises/:id` | con sesión | biblioteca común + propios |
| POST · PATCH · DELETE | `/exercises` · `/exercises/:id` | entrenador | ejercicios propios |
| GET · POST | `/routines` | entrenador | rutinas |
| GET · PUT · DELETE | `/routines/:id` | entrenador | rutina |
| POST | `/routines/:id/duplicate` · `/routines/:id/assign` | entrenador | duplicar · asignar (`clientIds`, `dates`) |
| GET | `/workouts?from&to` · `/today/workouts?date` · `/activity` | entrenador | semana del estudio · hoy · últimos terminados |
| GET | `/clients/:id/workouts?from&to` | entrenador | entrenos de un cliente |
| GET | `/me/workouts?from&to` | cliente activo | mis entrenos |
| GET | `/workouts/:id` | entrenador o su cliente | detalle (marca como revisado) |
| PATCH · DELETE | `/workouts/:id` | entrenador | mover, indicaciones, quitar |
| PUT | `/workouts/:id/log` | su cliente | autoguardado del cuaderno |
| POST | `/workouts/:id/complete` · `/workouts/:id/reopen` | su cliente | terminar (RPE, comentario, o no hecho) · reabrir |
| GET · POST | `/meal-plans` | entrenador | plantillas · crear (plantilla, plan de cliente en blanco o copia con `fromPlanId`) |
| GET · PUT · DELETE | `/meal-plans/:id` | entrenador | plan o plantilla |
| POST | `/meal-plans/:id/apply` | entrenador | aplicar a clientes (`clientIds`) |
| GET | `/clients/:id/meal-plan` · `/clients/:id/meal-checks?from&to` | entrenador | plan activo · cumplimiento |
| GET | `/me/meal-plan` · `/me/meal-checks?from&to` | cliente activo | mi plan · lo marcado |
| PUT | `/me/meal-checks` | cliente activo | marcar/desmarcar una comida de un día |
| GET · POST | `/appointments` (`from`, `to` ISO, `clientId`) | entrenador | citas que se solapan con el rango (máx. 2 meses) · crear |
| PATCH · DELETE | `/appointments/:id` | entrenador | mover/editar · borrar |
| GET | `/me/appointments?from&to` | cliente activo | mis citas (sin notas internas) |
| GET | `/conversations` | entrenador | bandeja: último mensaje y no leídos por cliente |
| GET · POST | `/conversations/:clientId/messages` (`before`, `limit`) | entrenador | leer (paginado hacia atrás) · escribir |
| POST | `/conversations/:clientId/read` | entrenador | marcar como leída |
| GET · POST | `/me/messages` · POST `/me/messages/read` · GET `/me/unread` | cliente activo | su conversación |
| POST | `/media?clientId=` (multipart, 8 MB, JPG/PNG/WEBP/GIF por bytes) · GET `/media/:id` | participantes | fotos del chat |
| GET · POST · DELETE | `/push/key` · `/push/subscriptions` | con sesión | avisos push (VAPID) |
| WS | `/ws` | con sesión + Origin permitido | eventos `message.new`, `message.read`, `workout.completed` |
| GET · POST | `/me/export` · `/me/delete` (`password`) | cliente | RGPD: copia JSON · borrar cuenta y datos |
| GET · POST | `/clients/:id/export` · `/clients/:id/delete` (`confirmName`, solo archivados) | entrenador | RGPD de un cliente |
| GET · PUT | `/clients/:id/metrics` · DELETE `/clients/:id/metrics/:date` | entrenador | peso y medidas (una fila por día) |
| GET · PUT | `/me/metrics` | cliente activo | mis medidas |
| GET | `/clients/:id/progress/exercises` · `/clients/:id/progress?exerciseId=` | entrenador | resumen por ejercicio · serie de sesiones (e1RM Epley) |
| GET | `/me/progress/exercises` · `/me/progress?exerciseId=` | cliente activo | lo mismo, propio |
| GET | `/me/progress/last?exerciseIds=&excludeWorkoutId=` | cliente activo | series hechas la última vez en cada ejercicio (sugerencias del cuaderno) |
| GET | `/attention` | entrenador | clientes que necesitan atención y por qué (`missed`, `inactive`, `health`, `unanswered`) |
| POST | `/activity/seen` | entrenador | marca como revisados todos los entrenos terminados |
| GET · POST | `/me/questionnaire` | cliente activo | estado (pendiente, último) · enviar PAR-Q+ y anamnesis |
| GET | `/clients/:id/questionnaire` | entrenador | estado y respuestas (auditado) |
| POST | `/clients/:id/questionnaire/review` · `/request` | entrenador | marcar revisado · pedir que lo repita |
| GET | `/questionnaires/unreviewed` | entrenador | clientes con alertas sin revisar |
| GET · POST · DELETE | `/clients/:id/photos[/:photoId]` · `/me/photos[/:photoId]` | entrenador · cliente activo | fotos de progreso (antes `POST /media`) |
| GET · POST · PUT | `/metric-defs[/:id]` | entrenador | medidas propias del estudio (`archived` para retirarlas) |
| GET · PUT · DELETE | `/clients/:id/custom-metrics[/:metricId/:date]` · `/me/custom-metrics` | entrenador · cliente activo | valores de las medidas propias |
| GET · POST · PUT · DELETE | `/checkin-forms[/:id]` · `POST /checkin-forms/:id/assign` | entrenador | formularios de check-in y a quién se piden |
| GET · POST | `/clients/:id/checkins` · `/clients/:id/checkins/seen` · `DELETE /checkin-assignments/:id` | entrenador | programados y respuestas de un cliente |
| GET · POST | `/me/checkins` · `/me/checkins/:assignmentId` | cliente activo | los que le tocan hoy · contestar |
| GET · POST · PUT · DELETE | `/programs[/:id]` | entrenador | programas de varias semanas (`slots`: semana, día, rutina; `progression`) |
| POST | `/programs/:id/assign` | entrenador | aplica a clientes desde `start`: crea los entrenos (`program_run_id`) |
| GET · POST | `/clients/:id/program-runs` · `/program-runs/:id/end` | entrenador | programas aplicados con su progreso · terminar (borra lo pendiente sin empezar) |
| GET · POST | `/clients/:id/packs` | entrenador | bonos del cliente con usadas y restantes |
| PUT · DELETE | `/packs/:id` | entrenador | editar (o `archived`) · borrar si no se ha usado (409 si sí) |
| POST | `/appointments/:id/attendance` | entrenador | `status`: scheduled/done/no_show/cancelled; descuenta o devuelve del bono |
| GET | `/me/packs` | cliente activo | sus bonos en uso |
| GET · PUT | `/studio/booking` | entrenador | ajustes de reservas (franjas, duración, plazas, antelación, cancelación) |
| GET · POST | `/me/booking?from&days` · `/me/booking` | cliente activo | huecos libres · reservar (`startsAt`; 409 si ya no está libre) |
| POST | `/me/appointments/:id/cancel` | cliente activo | cancelar dentro del plazo (409 `too_late` si no) |
| POST | `/resources/upload` | entrenador | sube un PDF (comprobado por bytes, 15 MB) |
| GET · POST · PUT · DELETE | `/resources[/:id]` · `GET /me/resources` | entrenador · cliente activo | material para todos o para algunos clientes |
| GET | `/me/achievements` | cliente activo | racha de semanas, total y récords del último mes |
| GET | `/reports` | entrenador | informe del estudio (cumplimiento, sesiones, bonos, por cliente) |
| GET | `/ai/status` · `/ai/documents` | entrenador | estado (activa, uso de hoy, límite) · documentos |
| POST · DELETE | `/ai/documents` (multipart) · `/ai/documents/:id` | entrenador | subir PDF/DOCX/TXT (texto extraído y troceado) · quitar |
| POST | `/ai/routine` · `/ai/program` · `/ai/meal-plan` · `/ai/ask` | entrenador | borradores validados con los esquemas de la app y fuentes; 409 sin clave, 429 al llegar al límite |
| GET | `/payments/info` | cualquiera con sesión | cobros activos y si es modo prueba |
| GET · POST · PUT | `/prices[/:id]` · `GET /me/prices` | entrenador · cliente activo | tarifas (importes en euros; en BD, céntimos) |
| POST | `/me/checkout` | cliente activo | cobro de una tarifa: devuelve la URL de Stripe Checkout |
| POST | `/clients/:id/payment-links` · `/payments/:id/renew` | entrenador | enlace de pago (tarifa o concepto+importe) · enlace nuevo |
| GET | `/payments` · `/clients/:id/payments` · `/me/payments` · `/payments.csv` | entrenador · cliente | cobros · CSV para el gestor |
| POST | `/stripe/webhook` | Stripe (firma) | eventos de Checkout y devoluciones; idempotente |
| GET | `/health` | público | versión, uptime, BD |
