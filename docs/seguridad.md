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
| Derecho de acceso y supresión (RGPD) | Exportar en ZIP con sus fotos (o JSON), cliente y entrenador; cobertura de **todas** las tablas con `client_id`/`user_id` (`EXPORT_COVERAGE`); borrar cuenta con contraseña, borrado definitivo de ficha archivada escribiendo el nombre; borra también las fotos del disco; auditado sin datos personales | `routes/privacy.ts` | `privacy.test.ts`, `privacy.export.test.ts` (generado desde el catálogo) |
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

## Correo y verificación en dos pasos — 1.17.0 (ver ADR 0016)
| Amenaza | Defensa | Prueba |
|---|---|---|
| Robo de la contraseña del entrenador | 2FA TOTP opcional (recomendada), reto sin sesión hasta el código, códigos de recuperación de un uso, sin reutilizar pasos | `mail.p1.test.ts` → 2FA, `lib/totp.test.ts` |
| El correo como llave única | Restablecer por correo no se salta la 2FA | idem |
| Sondear cuentas con «He olvidado la contraseña» o el cambio de correo | Misma respuesta exista o no; frenos por IP y por dirección | `mail.p1.test.ts` → olvido |
| Enlaces de un uso filtrados | Hash en la BD, caducidad (1 h / 24 h), cuerpo del correo borrado al enviarse | idem → bandeja |
| Caída del proveedor de correo | Bandeja con reintentos; la petición nunca falla por el correo | idem |

## Conservación de datos
| Qué | Cuánto | Dónde |
|---|---|---|
| Sesiones | 60 días sin uso o 180 de edad | `purgeExpired` (cada 5 min) |
| Enlaces de restablecer | 1 día tras caducar | idem |
| Registro de auditoría (accesos a fichas, altas, bajas, IP) | 2 años | idem |
| Archivos subidos sin usar (foto que no llegó a enviarse…) | 1 día | `purgeOrphanMedia` |
| Correos enviados (sin cuerpo) o abandonados | 7 días | `purgeOutbox` |
| Cobros de un cliente borrado | Los que exige la ley fiscal, anonimizados (solo su nombre) | ADR 0015 |

## Auditoría profunda A1 — 1.14.0 (2026-09-30) — ver ADR 0015
Tres auditorías de solo lectura (API handler a handler, datos y rendimiento, web). Sin IDOR entre estudios ni XSS. Arreglado
en esta tanda (seguridad y dinero), con una prueba por hallazgo en `security.bypass.test.ts` y `audit.a1.test.ts`:
| Hallazgo | Arreglo |
|---|---|
| `/%61pi/v1/auth/login` se saltaba el límite de peticiones, el `no-store` y la lista negra de la demo | Ruta canónica (`lib/path.ts`) y `routeOptions.url` en todas esas comprobaciones; exenciones de CSRF por ruta exacta |
| IP falseable con `X-Forwarded-For` | `trustProxy` solo si `TRUST_CLOUDFLARE`, y solo el primer salto |
| Modo de pagos o IA de prueba en producción | La API no arranca |
| Dos eventos de Stripe → dos bonos; facturas duplicadas; dos cuotas a la vez | `UPDATE` condicional, índices únicos, cerrojos por cliente (ADR 0015) |
| Enlaces de pago viejos seguían cobrando | Se caducan en Stripe al renovar, cancelar o liberar la retención |
| Borrar cliente: Stripe seguía cobrando y los cobros se perdían | Se borra el Customer; cobros anonimizados (`client_name`, `client_id` nulo) |
| Reservas simultáneas bloqueaban la API (segunda conexión dentro del cerrojo) | `freeSlots` usa la transacción; prueba con 20 a la vez |
| Reservas ilimitadas con un bono de 1 sesión | Tope por cliente y el bono cubre solo si hay sesiones para todas |
| Cliente archivado seguía entrando | Login 403 y sesión inválida; pendientes solo ven `/me` |
| Un atacante bloqueaba la cuenta de otro | Freno por correo+IP (5) además de por correo (20) |
| Registro revelaba si un correo tenía cuenta | Se valida la invitación o el código antes |
| Push a URLs internas (SSRF) o robo de endpoint ajeno | Solo `https` a FCM/Mozilla/Apple/Windows sin puerto; no se reasigna |
| `/me/photos` aceptaba fotos subidas por el entrenador | Solo fotos que subió el propio cliente; `media_id` único |
| Llenar el disco | Cuotas de 2 GB por estudio y 300 MB por cliente; `.docx` con tamaño descomprimido máximo; tope de trozos de IA |
| Consultas enormes | Rangos de fechas ≤ 93 días; asignaciones ≤ 2.000 entrenos |
| Cuaderno editable tras terminar; completar entrenos de dentro de meses | 409 (hay que «Reabrir»); como mucho 14 días antes |
| `resetDemo` contra una BD real | Se niega si hay cuentas fuera de `@demo.coach` |
