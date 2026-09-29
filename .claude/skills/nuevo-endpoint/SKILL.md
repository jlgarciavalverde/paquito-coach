---
name: nuevo-endpoint
description: Receta para añadir un endpoint o módulo nuevo a la API y consumirlo en la web respetando aislamiento por estudio, contrato Zod compartido, tests y OpenAPI. Úsala al crear rutas, tablas o pantallas que llamen a la API.
---
# Nuevo endpoint / módulo

1. **Tabla** (si hace falta) en `apps/api/src/db/schema.ts` con `studio_id` (FK a `studios`, `onDelete: cascade`) e índice por `studio_id`. Luego `pnpm --filter @coach/api db:generate --name <nombre>` y revisa el SQL generado.
2. **Contrato** en `packages/shared/src/<modulo>.ts`: esquemas de entrada (`XInput`) y salida (`X`) + tipos `z.infer`. Exporta desde `index.ts`. Mensajes de validación en español.
3. **Ruta** en `apps/api/src/routes/<modulo>.ts` con `registerX(app, ctx)`, registrada en `app.ts` dentro del prefijo `/api/v1`:
   - `schema: { tags: [...], params, querystring, body, response: { 200: X } }`
   - primera línea: `const u = requireCoach(req)` / `requireActiveClient(req)`.
   - toda consulta con `eq(tabla.studioId, u.studioId)`; lectura por id → 404 si no es del estudio.
   - si toca datos de salud o altas/bajas: `audit(db, req, "modulo.accion", { type, id })`.
   - fechas → `toISOString()` en un mapper de `lib/mappers.ts`.
4. **Tests** en `apps/api/src/<modulo>.test.ts` (camino feliz + validación) **y** casos nuevos en `isolation.test.ts` (otro estudio → 404; cliente → 403; sin sesión → 401).
5. **Web**: query/mutation en `apps/web/src/lib/queries.ts` (`queryOptions` + invalidaciones), pantalla en `routes/`, solo componentes de `components/ui`.
6. **e2e** del flujo en `e2e/` con `expectAccessible` en la pantalla nueva.
7. `pnpm openapi`, actualiza la tabla de `docs/api/README.md`, `docs/ESTADO.md` y `CHANGELOG.md`.
