---
name: convenciones
description: Checklist de revisión antes de dar por terminado un cambio en la app de Paquito (seguridad, aislamiento, diseño, accesibilidad, textos, documentación).
---
# Checklist antes de cerrar

- [ ] Cada handler empieza con `requireCoach`/`requireActiveClient`/`requireUser`.
- [ ] Todas las consultas filtran por `studio_id`; recursos ajenos → 404. Tests de aislamiento añadidos.
- [ ] Entrada y salida validadas con esquemas de `packages/shared`.
- [ ] Nada de secretos, tokens o datos personales en logs, commits o respuestas de más.
- [ ] UI solo con tokens y `components/ui`; títulos `font-display`; sin hex sueltos; sin `<button>` dentro de `<Link>`.
- [ ] Probado en móvil (390×844) y escritorio, claro y oscuro; `expectAccessible` sin fallos.
- [ ] Textos en español de España, tuteo, botones con verbo, errores que dicen qué hacer.
- [ ] `pnpm typecheck && pnpm test && pnpm build && pnpm e2e` en verde.
- [ ] `docs/ESTADO.md`, `CHANGELOG.md`, `docs/api` (si hay endpoints) y ADR (si hay decisión) actualizados.
