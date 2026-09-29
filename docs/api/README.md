# API

- Especificación **OpenAPI 3** generada de los esquemas Zod: [`openapi.json`](openapi.json) (`pnpm openapi` la regenera; necesita `pnpm db:up`).
- Interactiva en desarrollo: `http://localhost:3000/api/docs`. En producción está desactivada.
- Prefijo `/api/v1`. JSON. Autenticación por cookie de sesión (`sid` / `__Host-sid`).
- Toda petición que no sea GET debe llevar un `Origin` permitido (si no: `403 bad_origin`).
- Errores: `{ "error": "<código estable>", "message": "<texto en español para mostrar>" }`.

| Código | Cuándo |
|---|---|
| 400 `validation`, `weak_password`, `bad_password` | datos no válidos |
| 401 `unauthorized`, `invalid_credentials` | sin sesión / credenciales |
| 403 `forbidden`, `bad_origin`, `bad_setup_code` | sin permiso |
| 404 `not_found`, `join_code_invalid` | no existe **o no es de tu estudio** |
| 409 `email_taken`, `already_setup`, `has_account`, `not_pending`, `no_account` | conflicto de estado |
| 410 `invite_used`, `invite_invalid`, `reset_invalid` | enlace caducado o usado |
| 429 `rate_limited`, `locked` | límite por IP o bloqueo por cuenta |

## Endpoints (v0.1)
| Método | Ruta | Quién | Qué |
|---|---|---|---|
| GET | `/auth/setup-status` | público | ¿falta el alta inicial? |
| POST | `/auth/setup` | público + código | crea estudio y entrenador (una vez) |
| POST | `/auth/login` · `/auth/logout` | público | sesión |
| GET | `/auth/invites/:token` · `/auth/join/:code` | público | datos para la pantalla de registro |
| POST | `/auth/register` | público | alta de cliente con invitación o código |
| POST | `/auth/password/reset` | público + token | contraseña nueva con enlace del entrenador |
| POST | `/auth/password/change` | con sesión | cambiar contraseña (cierra las demás sesiones) |
| GET | `/me` · `/me/sessions` | con sesión | yo · mis sesiones |
| DELETE | `/me/sessions/:id` | con sesión | cerrar una sesión |
| GET/POST | `/clients` | entrenador | listar (filtros `status`, `q`) · crear (con o sin invitación) |
| GET/PATCH | `/clients/:id` | entrenador | ficha (queda en auditoría) · editar |
| POST | `/clients/:id/invite` · `reset-link` · `accept` · `reject` · `archive` · `unarchive` | entrenador | acciones |
| GET/POST | `/studio/join-code` · `/studio/join-code/rotate` | entrenador | código público |
| GET | `/health` | público | versión, uptime, BD |
