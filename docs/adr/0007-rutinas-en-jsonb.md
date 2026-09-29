# 0007 — Contenido de rutinas y entrenos en JSONB validado con Zod
- **Estado**: aceptada · **Fecha**: 2026-09-29
## Contexto
El plan preveía tablas `routine_blocks`, `routine_items`, `set_logs`. El editor guarda la rutina entera de una vez y
el cliente autoguarda su cuaderno completo cada pocos segundos.
## Decisión
`routines.blocks`, `workouts.blocks` y `workouts.log` son JSONB con la forma de `RoutineBlock[]` / `WorkoutLog`
(`packages/shared/src/training.ts`), validados con Zod al entrar. Al asignar se **copia** `blocks` al entreno
(copia congelada: cambiar la rutina no altera lo asignado ni lo registrado). La API comprueba que todos los
`exerciseId` sean de la biblioteca común o del estudio, y descarta del registro ids que no están en el entreno.
## Consecuencias
Un solo UPDATE por guardado, sin sincronizar filas hijas. Las estadísticas por ejercicio (progresión de cargas)
se harán con consultas `jsonb_array_elements` o, si crecen, con una vista materializada.
