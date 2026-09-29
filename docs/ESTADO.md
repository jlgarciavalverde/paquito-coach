# Estado del proyecto

> Registro vivo. Lo primero que lee cualquier agente; lo último que actualiza al cerrar una sesión.
> Formato: fecha · quién (modelo/herramienta) · qué. Lo más reciente arriba.

## Ahora mismo
- **Versión**: **1.8.0** (1.3.0–1.8.0 pendientes de desplegar: el VPS no respondía el 2026-09-29 por la tarde) — MVP + post-MVP (F0–F10) + G1–G2 de agilidad + H1–H4 de paridad con Harbiz (completa salvo cobros), **desplegada en joseluis-vps** (producción + demo).
- **Tanda en curso — agilidad** (plan `~/.claude/plans/mighty-splashing-widget.md`): G1 ✅ (v1.1.0: cuaderno con sugerencias, responder desde el entreno, «Necesitan atención»); G2 ✅ (v1.2.0: paleta ⌘K, atajos, acciones en la ficha, alta encadenada, progresión de cargas, deshacer); G3 editores ágiles (v1.3.0); G4 lista de clientes, barra móvil, optimismo, medición de pasos (v1.4.0).
- **Después — paridad con Harbiz** (lo que Paquito usa hoy): H1 ✅ (v1.3.0: check-ins periódicos, fotos de progreso, medidas propias, ADR 0011); H2 ✅ (v1.4.0: programas de varias semanas con progresión); H3a ✅ (v1.5.0: bonos de sesiones y asistencia); H3b ✅ (v1.6.0: reservas por el cliente, sin lista de espera); H4 ✅ (v1.7.0: material, constancia e informes). Se intercalan con G3–G4. Sin cobros por ahora.
- **Aún no es pública**: falta la ruta en Cloudflare (bloqueo 3). Después, alta inicial en `/instalar` con el `SETUP_CODE` del `.env` del VPS.
- **Tanda en curso — IA y cobros** (plan `~/.claude/plans/mighty-splashing-widget.md`): I1 ✅ (v1.8.0: IA con Gemini gratis y sus documentos); C1 cobros con Stripe (bonos, enlaces de pago); C2 cuotas mensuales y pago al reservar.
- **Siguiente tarea**: C1. Desplegar cuando el VPS vuelva (`node tools/deploy.mjs 1.8.0`) y poner la clave de Gemini (OPERACIONES → IA). En paralelo, que Paquito lo use (bloqueos).
- **Plan aprobado**: `~/.claude/plans/mighty-splashing-widget.md` (resumen en `docs/producto/mvp.md`).

## Fases
| Fase | Contenido | Estado |
|---|---|---|
| F0 | Monorepo, docs, diseño, base API (seguridad), Postgres, tests, imagen | ✅ hecho |
| F1 | Cuentas, estudio, 3 formas de alta, ficha, inicio coach, recuperar acceso | ✅ hecho |
| F2 | Biblioteca de ejercicios (2.534 en español), editor de rutinas (bloques, A1/A2, superseries), asignar a varios clientes/días, cuaderno del cliente con descanso y RPE, actividad y semana en «Hoy» | ✅ hecho |
| — | Rediseño «hoja de entrenamiento clínica» (ADR 0008) | ✅ hecho |
| F3 | Nutrición: plantillas, plan activo por cliente (igual todos los días o por día), objetivos kcal/macros, alternativas, el cliente marca comidas, cumplimiento 7 días en la ficha | ✅ hecho |
| F4 | Agenda: citas (con o sin cliente), calendario propio semana/mes/lista con capas (citas, entrenos, comidas por cliente), arrastrar para mover, crear pulsando un hueco; agenda del cliente; citas en «Hoy» | ✅ hecho |
| F5 | Mensajes: chat en tiempo real (WebSocket con comprobación de Origin), fotos (tipo real por bytes, acceso solo de participantes), no leídos y «visto», avisos push VAPID, app instalable (manifest + sw) | ✅ hecho |
| F7 | Progreso: peso y medidas (gráficas), cargas por ejercicio con 1RM estimado (Epley) calculadas de los registros, récords en «Hoy» | ✅ hecho |
| F8 | Cuestionario de salud: PAR-Q+ (7 sí/no) + anamnesis; tras registrarse y en «Hoy» mientras esté pendiente; alertas (sí o dolor ≥ 5) en la ficha y en «Hoy» hasta revisarlas; pedir que lo repita; en la copia RGPD | ✅ hecho |
| F9 | Demo pública: instancia y BD propias, entrada con un clic, banda de aviso, re-siembra nocturna, operaciones peligrosas bloqueadas (ADR 0009) | ✅ hecho |
| F10 | Recordatorios push (8:00 y 20:00, idempotentes, preferencia por usuario), copias al Mac con simulacro real de restauración, vigilante con notificación (ADR 0010) | ✅ hecho |
| F6 | RGPD (exportar/borrar, aviso de privacidad), revisión de seguridad, recuperación de la cuenta del entrenador, primeros pasos, títulos, guardarraíl de diseño | ✅ hecho |

## Bloqueos (necesitan al humano)
1. ~~SSH al VPS~~ (funciona).
2. ~~Primera instalación~~ (hecha el 2026-09-29).
3. **Cloudflare**: añadir en el panel del túnel los hostnames públicos `paquito.redgarverde.com` → `http://coach:3000` y `demo-paquito.redgarverde.com` → `http://coach-demo:3000` (si cambias el de la demo, actualiza `DEMO_PUBLIC_URL` en el `.env` del VPS).
4. **Paquito revisa** el texto del PAR-Q+ y la anamnesis (`packages/shared/src/questionnaire.ts`) y el de `/privacidad`.
5. ~~Instalar las tareas del Mac~~ (instaladas el 2026-09-29: `com.redgarverde.coach-backups` y `coach-monitor`; registros en `~/Backups/paquito-coach/`).
6. **Alta inicial**: `ssh joseluis@192.168.18.7 'grep SETUP_CODE ~/servicios/coach/.env'` y usarlo en `https://<subdominio>/instalar` (una sola vez; lo hace Paquito con su correo o tú y luego le cambias los datos).
5. **Paquito decide**: nombre de la app (hoy «Paquito Coach», se cambia en `packages/shared/src/brand.ts` + `apps/web/index.html`), subdominio, si quiere anamnesis/PAR-Q en el MVP, y vídeos propios o YouTube.

## Después del MVP (ideas, sin priorizar con Paquito)
Fotos de progreso · programas de varias semanas (periodización) · cobros con Stripe · reservas autoservicio · vídeos propios subidos (hoy: YouTube/Vimeo) · recordatorios de comidas · nombre y marca definitivos.

## Herramientas de agente recomendadas (instalar una vez, las ejecuta el humano)
```
/plugin install frontend-design@claude-plugins-official
/plugin install typescript-lsp@claude-plugins-official
/plugin install security-guidance@claude-plugins-official
claude mcp add playwright -- npx -y @playwright/mcp@latest
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
claude mcp add shadcn -- npx -y shadcn@latest mcp
```

## Verificación actual (2026-09-29, v0.2.0)
- `pnpm typecheck` limpio · API 34 tests (incluye entrenamiento y aislamiento) · web 10 · e2e 12/12 con axe
- (v0.1.0) API 23 tests (aislamiento entre estudios, invitaciones de un uso, bloqueo por cuenta, 429 por IP, CSRF, CSP, restablecer) · web 3 tests.
- e2e: 8/8 con axe WCAG 2.1 AA (claro, oscuro, móvil, escritorio).
- Imagen de producción probada en local: `/health` ok, CSP/HSTS, `/api/docs` 404, POST sin Origin → 403, backup diario escrito.

## Historial
- **2026-09-29 · Claude (Opus 5.5)** · I1 → **1.8.0**: `lib/ai/{provider,gemini,fake,canned,anonymize,chunks,extract}.ts` (+tests; PDF mínimo escrito a mano para probar `unpdf`), tablas `ai_documents`/`ai_chunks`/`ai_usage` (migración `0014_ia`), `routes/ai.ts`, config `GEMINI_*`/`AI_DAILY_LIMIT`/`AI_FAKE`; web: `/coach/ia`, `components/ai/generate-panel.tsx`, `lib/drafts.ts` (borrador al editor de rutinas), entradas en Entrenos/Programas/Nutrición/ficha/⌘K. ADR 0012. Sin probar aún contra Gemini real (falta la clave). API 123, e2e 38 + demo.
- **2026-09-29 · Claude (Opus 5.5)** · H4 → **1.7.0**: `packages/shared/src/library.ts` (`weekStreaks`, `ResourceInput`, `StudioReport`; tests), tabla `resources` (migración `0013_material`), `routes/library.ts` (+ `resourceVisible` en `GET /media/:id`, `isPdf`), web: `components/followup/resources.tsx`, `/coach/informes`, `/app/material`, «Tu constancia». API 109, shared 17, e2e 37 + demo.
- **2026-09-29 · Claude (Opus 5.5)** · H3b → **1.6.0**: `packages/shared/src/booking.ts` (+tests), `booking_settings` + `appointments.booked_by_client` (migración `0012_reservas`), `lib/tz.ts` (`madridInstant`), `routes/booking.ts` (huecos, cerrojo `pg_advisory_xact_lock`, avisos push), web: `components/agenda/booking-settings.tsx`, `/app/reservar`, cancelar en la agenda del cliente. API 107, e2e 36 + demo. Trampa: `cn()` no fusiona clases de Tailwind (no hay tailwind-merge): `controlClass` trae `w-full`, para anchos fijos usar una rejilla o un contenedor.
- **2026-09-29 · Claude (Opus 5.5)** · H3a → **1.5.0**: `packages/shared/src/packs.ts`, `appointments.status/pack_id` + `session_packs` (migración `0011_bonos`), `lib/packs.ts` (uso contando citas, avisos), `routes/packs.ts`, web: `components/agenda/{client-packs,attendance}.tsx`, bono en la agenda del cliente. API 101, e2e 35 + demo.
- **2026-09-29 · Claude (Opus 5.5)** · H2 → **1.4.0**: `packages/shared/src/programs.ts` (`programDates`, validación), migración `0010_programas` (programs, program_runs, `workouts.program_run_id`), `routes/programs.ts`, web: pestaña Programas, `entrenos/programa.$programId.tsx`, `program-assign-panel.tsx`, programa en curso en la ficha. API 97, shared 13, e2e 34 + demo.
- **2026-09-29 · Claude (Opus 5.5)** · H1 → **1.3.0**: `packages/shared/src/followup.ts` (+tests), migración `0009_seguimiento` (progress_photos, metric_defs/values, checkin_forms/assignments/responses), `routes/followup.ts`, avisos en `attention.ts` y `scheduler.ts`, RGPD; web: `/coach/seguimiento` (+ editor `$formId`), pestaña Check-ins, `components/progress/{photos,custom-metrics}.tsx`, `/app/checkin/$assignmentId`, barra móvil con «Más». API 93, shared 10, e2e 33 + demo.
- **2026-09-29 · Claude (Opus 5.5)** · G2 → **1.2.0**: `packages/shared/src/progression.ts` (+tests), `components/coach-actions.tsx` (proveedor de acciones: nuevo cliente, asignar, cita, medidas, escribir), `command-palette.tsx`, `lib/shortcuts.ts`, `ui/menu.tsx`, `ui/confirm.tsx` (`useConfirm`), `useUndoToast`; ficha con `?pestana=`. Paridad con Harbiz añadida al plan (H1–H4). API 88, shared 8, web 15, e2e 30 + demo 1.
- **2026-09-29 · Claude (Opus 5.5)** · G1 → **1.1.0**: `GET /me/progress/last` (series de la última vez por ejercicio), `routes/attention.ts` (`/attention`, `/activity/seen`, con aislamiento), cuaderno reescrito (`suggest()`, foco a la siguiente serie, barra ±), `logDiff` en `prescription.tsx`, `QuickReply` en `workout-panel.tsx`, «Necesitan atención» en Hoy. e2e nuevo `09-agilidad`; el de agenda fija el reloj del navegador. API 87, web 15, e2e 29 + demo 1.
- **2026-09-29 · Claude (Opus 5.5)** · F10 → **1.0.0**: `lib/scheduler.ts` + `reminder_log` + `users.reminders` + `PATCH /me/preferences`; `tools/{pull-backups,restore-drill,monitor,install-launchd}.sh` y plantillas `deploy/launchd/`. El primer simulacro real cazó que la copia diaria podía ser anterior al esquema (se elige la más reciente, sin presuponer tablas). Revisión de autorización de las rutas nuevas y `pnpm audit --prod` limpio. API 83 tests, e2e 28 + demo 1.
- **2026-09-29 · Claude (Opus 5.5)** · F9 Demo: `demo/seed.ts` (estudio realista: 5 clientes + 1 solicitud, rutinas, 4 semanas de entrenos con cargas que suben, plan de comidas, citas, chat, peso, PAR-Q con alerta), `DEMO_MODE`, `POST /auth/demo`, bloqueos, banda, servicios `demo`/`demo-db` en compose, `pnpm e2e:demo`. Monograma ignora símbolos. API 79 tests.
- **2026-09-29 · Claude (Opus 5.5)** · F8 Salud: `packages/shared/src/questionnaire.ts` (PAR-Q+ en tuteo, anamnesis, `questionnaireAlerts`), `routes/questionnaire.ts`, tabla `questionnaires` + `client_profiles.questionnaire_requested_at`, `/app/salud`, alertas en ficha y «Hoy». Corregido: zonas con scroll de diálogos/hojas enfocables (axe `scrollable-region-focusable`). API 74 tests, e2e 28/28.
- **2026-09-29 · Claude (Opus 5.5)** · F7 Progreso: `lib/progress.ts` (carga desde texto libre, Epley, series por ejercicio, sin tabla nueva), `routes/progress.ts`, tabla `body_metrics`, gráfica SVG propia `components/progress/line-chart.tsx` (paleta validada con la skill dataviz: tokens `--chart-1/2/grid`, un eje, marcador círculo/cuadrado como segunda codificación, tabla alternativa), pestaña «Progreso» y `/app/progreso`, récords en la actividad. API 70 tests, e2e 27/27.
- **2026-09-29 · Claude (Opus 5.5)** · F6: `routes/privacy.ts` (exportar/borrar), `/privacidad`, `reset-link.js`, copia de fotos, primeros pasos, títulos, `design.test.ts`. Revisión visual completa (escritorio claro y móvil oscuro, sin errores de consola). API 53 tests, web 15, e2e 26/26. `pnpm audit --prod` limpio.
- **2026-09-29 · Claude (Opus 5.5)** · F5 Mensajes: `routes/chat.ts`, `lib/realtime.ts` (Hub), `lib/push.ts`, `lib/sniff.ts`; web `components/chat/thread.tsx`, bandeja `/coach/chat`, `/app/chat`, `public/sw.js`, manifest e iconos. Trampa: la hora de «leído» la pone Postgres (reloj de la VM distinto del Mac). Producción: volumen `./data` para fotos, claves VAPID generadas por `tools/deploy.mjs` en el VPS. Remote Control preparado (`.claude/settings.json`). API 49 tests, e2e 24/24.
- **2026-09-29 · Claude (Opus 5.5)** · F4 Agenda: `routes/agenda.ts` (citas por solapamiento de rango, máx. 2 meses; el cliente no recibe las notas internas), calendario propio con @dnd-kit (`components/agenda/calendar.tsx`, botón arrastrable único para no anidar controles), movimientos optimistas. Corregidos desbordamientos horizontales en móvil (rejillas sin `min-w-0`) y añadido e2e que lo vigila. API 43 tests, e2e 20/20.
- **2026-09-29 · Claude (Opus 5.5)** · F3 Nutrición: `routes/nutrition.ts` (planes en JSONB como las rutinas, índice único parcial «un plan activo por cliente», `meal_checks` con upsert), editor de planes, plantillas y aplicar a varios, pestaña de la ficha con cumplimiento, pantalla «Comidas» del cliente y resumen en «Hoy». API 38 tests, e2e 16/16.
- **2026-09-29 · Claude (Opus 5.5)** · F2 completa y **rediseño** (petición: que no parezca generado por IA). Nuevo sistema en `docs/diseno.md` + ADR 0008. Entrenamiento: API (`routes/training.ts`, ADR 0007), semilla de 2.534 ejercicios en español, editor, asignación, cuaderno del cliente (autoguardado, descanso, RPE de sesión), «Hoy» con actividad y matriz semanal. Bugs cazados por e2e: límite global contaba estáticos (429 al cargar), caché de 30 s en «Hoy», bloqueo de navegación tras guardar. Verificado: API 34 tests, web 10, e2e 12/12 con axe. Desplegada en el VPS (semilla de 2.534 ejercicios cargada).
- **2026-09-29 · Claude (Opus 5.5)** · Primer despliegue de 0.1.0 en el VPS; verificado `/health` desde la red `proxy` y que Postgres no es alcanzable desde ella.
- **2026-09-29 · Claude (Opus 5.5)** · F0+F1 completas. Stack, seguridad, alta de clientes (invitación / código + aceptar / ficha sin cuenta), ficha con datos de salud (auditada), ajustes (código del estudio, sesiones, contraseña, tema), área del cliente (Hoy, perfil, pantalla «solicitud enviada»), recuperar acceso por enlace del entrenador, marcadores «En construcción» de F2–F5 dentro de la app para que Paquito vea la hoja de ruta. Docs y skills del proyecto.
