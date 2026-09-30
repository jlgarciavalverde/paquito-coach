# 0014 — Seguridad por capas: acceso denegado por defecto, entradas saneadas y pruebas generadas
- **Estado**: aceptada · **Fecha**: 2026-09-30
## Contexto
Con ~150 endpoints, confiar solo en que cada handler llame a `requireCoach`/`requireActiveClient` es frágil: un olvido deja
un agujero. Además, sin sesión, la validación respondía 400 antes que 401 (se aprendía el formato de los datos).
## Decisión
- **Acceso denegado por defecto** (`lib/access.ts`, hook `preValidation`, antes de validar): sin sesión solo pasan las rutas
  de `PUBLIC_ROUTES`; un cliente, solo `/me…` y `CLIENT_ROUTES`; el resto es del entrenador. Los handlers siguen comprobando
  (segunda capa) y el aislamiento por estudio sigue en cada consulta (404, nunca 403, entre estudios).
- **Pruebas generadas desde el registro de rutas** (`app.routeList`): `security.matrix.test.ts` (401/403 exactos para cada
  endpoint, ningún 500) y `robustness.fuzz.test.ts` (datos basura en todas las rutas que escriben y leen). Una ruta nueva
  queda cubierta sin escribir nada.
- **Entradas**: se quita el carácter NUL de cuerpo/consulta/parámetros (Postgres lo rechaza; daba 500); ids que se usan como
  claves con `SafeId` (sin `__proto__`/`constructor`); el parser JSON de Fastify rechaza `__proto__`; fechas validadas contra el
  calendario; errores de datos de Postgres → 400 y de unicidad/relación → 409 (carreras).
- **Sesiones**: token de 256 bits guardado como SHA-256; cookie HttpOnly + SameSite=Lax (+ `__Host-` y Secure en producción);
  al entrar se invalida la sesión anterior del navegador; caducidad por inactividad (60 días) y edad máxima (180 días); cambio o
  restablecimiento de contraseña y archivar cliente cierran sesiones.
- **Cabeceras**: CSP estricta (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS, nosniff,
  Referrer-Policy, `Permissions-Policy` sin cámara/micro/ubicación, y `Cache-Control: no-store` en toda la API.
- **Logs**: cookies, firma de Stripe y tokens de invitación/restablecer en URL se ocultan (`lib/redact.ts`).
- **CSV** para el gestor: celdas que empiezan por `= + - @` neutralizadas (inyección de fórmulas).
- Freno de fuerza bruta por cuenta con tope de memoria (10.000 correos).
