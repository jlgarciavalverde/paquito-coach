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
| Caché de Cloudflare sirviendo HTML viejo o datos privados | `Cache-Control: no-store` en HTML, `/health`, `/me` | `app.ts`, rutas | smoke |

## Pendiente (F6)
- `GET /me/export` y `DELETE /me` (derechos RGPD), aviso de privacidad y registro de actividades de tratamiento.
- Copias cifradas fuera del VPS (hoy: `pg_dump` diario + `tools/pull-backups.sh` al Mac).
- Recuperación de la contraseña **del entrenador** (hoy: por SQL en el VPS, ver OPERACIONES).
- Revisión con `/security-review` y `pnpm audit --prod` antes de la entrega.
