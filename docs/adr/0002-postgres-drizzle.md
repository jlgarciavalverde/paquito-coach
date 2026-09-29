# 0002 — Postgres + Drizzle en lugar de SQLite
- **Estado**: aceptada · **Fecha**: 2026-09-29
## Contexto
Los otros proyectos usan `node:sqlite`. Aquí hay varios estudios potenciales, datos de salud, chat con escritura concurrente y la previsión de crecer (SaaS).
## Decisión
Postgres 17 en su contenedor (red interna), Drizzle ORM para el esquema y las migraciones versionadas, driver `postgres` (JS puro, sin módulos nativos). Migraciones aplicadas al arrancar la API.
## Consecuencias
Un contenedor más y copias con `pg_dump`. Tests contra un Postgres real (BD `coach_test`), no simulado.
