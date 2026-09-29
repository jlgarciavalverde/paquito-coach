# 0001 — Vite + React y Fastify en un monorepo pnpm
- **Estado**: aceptada · **Fecha**: 2026-09-29
## Contexto
Hace falta un stack moderno con libertad total de diseño y endpoints claros y documentados. El usuario ya despliega dos apps con Fastify + React en el mismo VPS.
## Decisión
Monorepo pnpm: `apps/api` (Fastify 5 + Zod + OpenAPI), `apps/web` (React 19 + Vite + TanStack Router/Query + Tailwind v4 + Radix), `packages/shared` (contrato Zod). Se descarta Next.js: acopla backend y frontend, el tiempo real iría aparte y cambia la forma de desplegar.
## Consecuencias
Se reutilizan el despliegue y las lecciones de los otros proyectos. El contrato compartido evita tipos duplicados; OpenAPI se genera de los mismos esquemas.
