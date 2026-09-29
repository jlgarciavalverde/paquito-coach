# 0010 — Recordatorios en el propio servidor y copias verificadas en el Mac
- **Estado**: aceptada · **Fecha**: 2026-09-29
## Recordatorios
Planificador dentro del proceso de la API (`lib/scheduler.ts`), que comprueba cada 5 minutos la hora de Madrid. A las 8:00,
el entreno del día a cada cliente y un resumen al entrenador. A las 20:00, a quien aún no ha registrado su entreno.
Idempotente con `reminder_log (kind, user_id, date)`, de modo que un reinicio no repite avisos. Preferencia por usuario
(`users.reminders`). Sin cron externo ni cola: hay un solo proceso y el volumen es mínimo. No se activa en la demo ni en
los tests (lo arranca `server.ts`).
## Copias
El VPS guarda 14 días de `pg_dump` y de fotos. El Mac las trae cada día (`tools/pull-backups.sh`, LaunchAgent) y conserva
60 días. Tras cada descarga, **restaura de verdad** la copia más reciente en un Postgres desechable (`tools/restore-drill.sh`)
y avisa si falla. Motivo: una copia que no se ha restaurado nunca no es una copia. El primer simulacro detectó que la
copia diaria puede ser anterior al esquema actual (la previa a cada despliegue es más reciente), así que el simulacro elige
la más reciente de las dos y no presupone tablas.
## Vigilancia
`tools/monitor.sh` (LaunchAgent, cada 10 min): `/health` dentro del VPS por SSH, y por el dominio público cuando exista.
Notificación de macOS al segundo fallo seguido y al recuperarse.
