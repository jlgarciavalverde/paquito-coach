# Seguridad

| Amenaza | Medida | Dónde | Test |
|---|---|---|---|
| Robo de sesión por XSS | Token opaco en cookie `HttpOnly`, `Secure`, `SameSite=Lax`, prefijo `__Host-` en producción; nada en `localStorage`. CSP `script-src 'self'` sin inline | `lib/session.ts`, `app.ts` | `auth.test.ts` «login, /me, logout» |
| Filtración de BD → sesiones | Solo se guarda `sha256(token)` | `sessions.token_hash` | — |
| CSRF | `SameSite=Lax` + toda petición no-GET exige `Origin` ∈ `ALLOWED_ORIGINS` | `app.ts` hook | «rechaza peticiones sin Origin» |
| Fuerza bruta (IP) | `@fastify/rate-limit`: 300/min global, `AUTH_RATE_LIMIT` (10)/min en `/auth/*`; IP de `CF-Connecting-IP` solo en producción | `app.ts`, rutas `config.rateLimit` | «el intento 11 devuelve 429» |
| Fuerza bruta (cuenta) | 5 fallos en 15 min bloquean ese correo 15 min (en memoria) | `lib/throttle.ts` | «bloquea la cuenta tras 5 fallos» |
| Enumeración de cuentas | Mismo mensaje y mismo tiempo (hash de relleno) exista o no el correo | `lib/passwords.ts` | «mismo error para correo inexistente» |
| Contraseñas débiles | ≥ 10 caracteres + lista de comunes; scrypt N=2¹⁵ | `lib/passwords.ts` | «rechaza contraseñas cortas o comunes» |
| Acceso entre estudios / clientes | `studio_id` en todo + 404 si no es tuyo; roles por ruta | `routes/*`, `lib/session.ts` | `isolation.test.ts` |
| Invitaciones robadas/reutilizadas | 256 bits, hash en BD, un uso (UPDATE atómico), 7 días, una viva por cliente | `routes/clients.ts`, `auth.ts` | «no se puede reutilizar», «regenerar invalida» |
| Código de estudio filtrado | Solo crea solicitudes **pendientes**; rotable | `routes/studio.ts` | «rotar invalida el anterior» |
| Clickjacking | `frame-ancestors 'none'` | helmet | «CSP estricta» |
| Datos de salud (RGPD art. 9) | Consentimiento explícito al registrarse (`health_consent_at`), auditoría de consultas de ficha, notas privadas nunca expuestas al cliente | `auth.ts`, `audit_log` | «sin consentimiento no hay registro» |
| Secretos en el repo | `.env` ignorado, `gitleaks` en pre-commit, secretos del VPS generados allí con `read -rsp`/`openssl` | `.githooks/` | — |
| Exposición de red | Sin `ports:`; Postgres en red `internal`; contenedor `read_only`, `cap_drop: ALL`, `no-new-privileges` | `deploy/docker-compose.yml` | smoke test local |
| Documentación de API expuesta | `/api/docs` solo en desarrollo (`EXPOSE_API_DOCS=1` para forzar) | `config.ts` | smoke: 404 en producción |
| Secuestro del WebSocket desde otra web (CSWSH) | `/ws` exige cookie de sesión **y** `Origin` permitido; canal solo de bajada | `app.ts` | `chat.test.ts` «otro origen no puede abrirlo» |
| Fotos maliciosas (HTML/SVG disfrazado) | Tipo real por los primeros bytes (JPG/PNG/WEBP/GIF), 8 MB, se sirven con su tipo y `nosniff`; nombre = UUID | `lib/sniff.ts`, `routes/chat.ts` | «tipo real por los bytes» |
| Ver fotos ajenas | Solo participantes de la conversación (entrenador del estudio o ese cliente) | `GET /media/:id` | «solo la ve quien participa» |
| Spam de mensajes | 60 mensajes/min por usuario, 30 subidas/min | `routes/chat.ts` | — |
| Derecho de acceso y supresión (RGPD) | Exportar JSON (cliente y entrenador), borrar cuenta con contraseña, borrado definitivo de ficha archivada escribiendo el nombre; borra también las fotos del disco; auditado sin datos personales | `routes/privacy.ts` | `privacy.test.ts` |
| Caché de Cloudflare sirviendo HTML viejo o datos privados | `Cache-Control: no-store` en HTML, `/health`, `/me` | `app.ts`, rutas | smoke |

## Revisión F6 (2026-09-29)
- `pnpm audit --prod`: sin vulnerabilidades conocidas.
- Aviso de privacidad en `/privacidad` (texto base: Paquito debe revisar y completar sus datos de responsable).
- Recuperación de la contraseña del entrenador con `reset-link.js` (sin contraseñas en la terminal).
- Pendiente fuera del código: copia de las copias de seguridad fuera del VPS (programar `tools/pull-backups.sh` en el Mac con launchd) y registro de actividades de tratamiento (documento de Paquito como responsable).

## Endurecimiento 1.11.0 (2026-09-30) — ver ADR 0014
| Amenaza | Defensa | Prueba |
|---|---|---|
| Endpoint nuevo sin proteger | Acceso denegado por defecto antes de validar (`lib/access.ts`) | `security.matrix.test.ts` recorre todas las rutas registradas |
| Rotura por datos basura / NUL | Saneado global, 400/409 de Postgres, `SafeId` | `robustness.fuzz.test.ts` (13 cuerpos basura × todas las rutas × 2 roles) |
| Robo o reutilización de sesión | Token 256 bits hasheado, cookie HttpOnly/SameSite/`__Host-`, rotación al entrar, 60 días inactiva / 180 máx. | `security.web.test.ts` → sesiones |
| Fuerza bruta y enumeración | Límite por IP + por cuenta (con tope de memoria), mismo mensaje y tiempo | `security.web.test.ts` → contraseñas |
| Tokens de invitación/restablecer | Un uso (atómico), caducidad, hash, fuera de los logs | `security.web.test.ts` → tokens |
| CSRF | Comprobación de `Origin` en todo lo que escribe (también `text/plain` y `Origin: null`) | idem → CSRF |
| XSS | React escapa; CSP sin scripts externos ni en línea | idem → XSS almacenado |
| Inyección SQL | Consultas parametrizadas; `%`/`_` escapados en búsquedas | idem → inyección |
| Contaminación de prototipo | Parser JSON seguro, `SafeId`, saneado que descarta `__proto__` | idem + `lib/sanitize.test.ts` |
| Inyección de fórmulas en CSV | Prefijo `'` en celdas `= + - @` | idem → CSV |
| Asignación masiva | Esquemas Zod que descartan campos desconocidos | idem → asignación masiva |
| Webhook falso o repetido | Firma de Stripe, tolerancia de 5 min, eventos idempotentes | idem → webhook + `robustness.test.ts` (tres a la vez) |
| Carreras | Cerrojo por estudio en reservas, invitación atómica | `robustness.test.ts` → carreras |
