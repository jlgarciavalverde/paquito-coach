# AGENTS.md — fuente única de verdad para cualquier agente (Claude Code, Kimi Code, otros)

> **Antes de tocar nada lee `docs/ESTADO.md`** (qué está hecho, qué sigue, bloqueos).
> **Al terminar una sesión**, actualiza `docs/ESTADO.md` y `CHANGELOG.md`. Si tomas una decisión de
> arquitectura, añade un ADR en `docs/adr/`. Si cambias endpoints, regenera `docs/api/openapi.json` (`pnpm openapi`).

## Qué es
App web tipo **Harbiz** para **Paquito** (entrenador de fuerza y readaptación, CAFYD) y sus clientes:
alta y vínculo de clientes, rutinas, plan de comidas, calendario y chat. Alcance del MVP en
`docs/producto/mvp.md`. Idioma de la interfaz, del código de dominio y de la documentación: **español**.

## Stack
| Capa | Tecnología |
|---|---|
| Monorepo | pnpm 12 workspaces, Node 22 (Homebrew `node@22`, keg-only) |
| API | Fastify 5 + `fastify-type-provider-zod` + Zod 4, Drizzle ORM + `postgres` (JS puro), Postgres 17 |
| Web | React 19, Vite 8, TanStack Router (rutas por archivo) + Query, Tailwind v4, Radix (`radix-ui`), Motion, Phosphor Icons |
| Contrato | `packages/shared` (esquemas Zod usados por API **y** web) |
| Tests | Vitest (API contra Postgres real; web), Playwright + axe (e2e contra la build de producción) |
| Despliegue | Docker (imagen amd64 construida en el Mac) en `joseluis-vps`, Cloudflare Tunnel |

## Comandos (desde la raíz; antes: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`)
```sh
pnpm db:up                 # Postgres de desarrollo (127.0.0.1:5433; BDs coach, coach_test, coach_e2e)
cp .env.example .env       # y añade SETUP_CODE=loquesea para el alta inicial
pnpm dev:api               # API en :3000 (aplica migraciones al arrancar)
pnpm dev:web               # Web en :5173 (proxy /api → :3000)
pnpm typecheck && pnpm test
pnpm build && pnpm e2e     # e2e contra la build (levanta la API en :4310 con BD coach_e2e vacía)
pnpm --filter @coach/api db:generate --name <nombre>   # tras cambiar apps/api/src/db/schema.ts
pnpm openapi               # regenera docs/api/openapi.json
node tools/deploy.mjs X.Y.Z   # despliegue (ver docs/OPERACIONES.md)
```
Documentación interactiva de la API en desarrollo: `http://localhost:3000/api/docs`.

## Estructura
```
apps/api/src/
  app.ts            buildApp(): helmet/CSP, rate-limit, cookie, CSRF (Origin), sesión, errores, rutas, estáticos
  config.ts         configuración desde variables de entorno
  db/schema.ts      esquema Drizzle (ÚNICA definición de tablas) · db/client.ts conexión + migraciones
  lib/              session (cookie + requireCoach/requireActiveClient), passwords (scrypt), tokens, throttle, audit, errors
  routes/*.ts       un archivo por módulo; registerX(app, ctx)
  *.test.ts         tests (test-utils.ts: Agent con cookie, setupCoach, inviteAndRegister)
apps/api/drizzle/   migraciones SQL generadas (se commitean; se aplican solas al arrancar)
apps/web/src/
  routes/           rutas por archivo (TanStack Router). /coach/* entrenador, /app/* cliente, /galeria diseño
  components/ui/    sistema de diseño (Button, TextField, Select, layout.tsx: PageTitle, RecordSheet, PlateMark, Monogram, HealthAlert…; dialog.tsx: Dialog, SidePanel)
  components/training/  editor/lectura de rutinas, selector de ejercicios, asignar, semana de clientes, cuaderno
  lib/              api.ts (fetch + RequestError), auth.ts (meQuery), queries.ts (TanStack Query), format.ts
packages/shared/src esquemas Zod + tipos compartidos + BRAND (nombre provisional)
e2e/                Playwright (serial, un worker, comparte BD)
deploy/             docker-compose.yml y .env.example de producción · tools/ scripts
```

## Convenciones (obligatorias)
1. **Aislamiento por estudio**: toda tabla con datos lleva `studio_id` y **toda consulta filtra por
   `req.user.studioId`**. Para leer un recurso por id: `where(id = :id AND studio_id = :studio)` y 404 si no
   existe (nunca 403: no revelar que existe en otro estudio). Cada módulo nuevo añade casos a `isolation.test.ts`.
2. **Autorización explícita** al principio de cada handler: `requireCoach(req)`, `requireActiveClient(req)` o `requireUser(req)`.
3. **Contrato en `packages/shared`**: el esquema Zod de entrada/salida se define allí y lo usan la ruta (`schema: { body, response }`) y la web. Nada de tipos duplicados.
4. **Errores**: lanzar `HttpError(status, code, mensajeEnEspañol)`. El cliente muestra `message` tal cual.
5. **Acciones sensibles** (ver/editar ficha, altas, bajas, enlaces) → `audit(db, req, "accion", target)`.
6. **Migraciones**: cambiar `schema.ts` → `db:generate` → commitear el SQL. Nunca editar migraciones ya desplegadas.
7. **Diseño** («hoja de entrenamiento clínica», ADR 0008): solo tokens (`bg-tray`, `text-ink-2`, `bg-primary`, `bg-plate-red`…) y componentes de `components/ui`. Titulares `font-wide`, cifras `font-narrow`. Nada de hex sueltos (excepción: verde de WhatsApp). **Evitar los tics de diseño generado**: nada de sobretítulos en mayúsculas, palabras sueltas en cursiva/color, tarjetas con sombra para todo, degradados decorativos, «A · B · C», flechas «→» en botones. Ver `docs/diseno.md` y `/galeria`.
8. **Accesibilidad**: WCAG 2.1 AA verificada con axe en e2e (claro y oscuro). Botón solo-icono → `IconButton` con `label`. Nunca un `<button>` dentro de un `<Link>`: usar `buttonClass()`.
9. **Textos**: español de España, tuteo, frases cortas. Botones con verbo («Crear e invitar», «Guardar cambios»).
10. **Tests en verde antes de dar algo por hecho**: `pnpm typecheck && pnpm test && pnpm build && pnpm e2e`.
11. **Secretos**: nunca en el repo ni en el chat. Hook `gitleaks` en `.githooks/pre-commit` (`git config core.hooksPath .githooks`).

## Trampas conocidas
- `playwright` `globalSetup` corre **después** de levantar el `webServer`: el vaciado de la BD de e2e va en el propio comando (`e2e/reset-db.ts`).
- axe da falsos fallos de contraste durante las animaciones de entrada (opacidad): `expectAccessible` espera 450 ms.
- Tailwind v4 centra con la propiedad `translate`, no `transform`: las animaciones con `transform` se combinan sin romper el centrado (ver `dialog-in` en `styles.css`).
- El root `package.json` es `"type": "module"` (los scripts `.ts` de e2e usan top-level await).
- La cookie de sesión en producción es `__Host-sid` + `Secure`: por HTTP (p. ej. probar la imagen en local) el navegador no la guarda. Es lo esperado.
- **Rate limit y estáticos**: el límite global solo cuenta `/api/*` (`allowList`). Si cuenta los JS de la web, al cargar la app se agota y el navegador recibe 429 (lo cazó el e2e).
- **Datos que cambian por acción de otra persona** (actividad, entrenos de clientes): `staleTime: 0` para que se pidan al abrir la pantalla; si no, «Hoy» muestra la caché de hace 30 s.
- **`useBlocker` tras guardar**: al navegar justo después de guardar, `dirty` aún es `true` en ese render; usar el ref `leaving` (ver editor de rutina).
- **Rejillas y desbordamiento**: un hijo de `grid` tiene `min-width: auto`; una tabla o un texto largo dentro desborda en el móvil. Usar `grid-cols-1 … [&>*]:min-w-0` o `minmax(0,1fr)`. El e2e «ninguna pantalla desborda» lo vigila.
- **Arrastrar (dnd-kit)**: el elemento arrastrable ES el botón (`DragButton`); no envolver un botón en otro control. Siempre hay alternativa sin arrastrar (el panel de edición con fecha y hora).
- **Fechas y horas**: las fechas de día son `YYYY-MM-DD` locales (`lib/dates.ts`); las citas son instantes ISO; convertir con `atLocal`/`localDate`/`minutesOf` (`lib/agenda.ts`). Los e2e fijan `timezoneId: "Europe/Madrid"`.
- **Horas de la BD vs. de la app**: Postgres corre en la VM de Colima y su reloj puede diferir del Mac. Para comparar con `created_at` (p. ej. «leído hasta») usar siempre `now()` de Postgres, no `new Date()`.
- **WebSocket**: `/ws` exige cookie de sesión y `Origin` permitido (si no, 4401). En tests se usa `app.injectWS`; el `keyGenerator` del rate-limit tolera peticiones sin socket.
- La semilla de ejercicios (`apps/api/src/db/exercise-seed.json`, ~2.500) solo se carga si la biblioteca común está vacía. Los tests la desactivan (`seedExercises: false`) salvo `training.test.ts`.
- `cn()` solo concatena (sin tailwind-merge): una clase de anchura no sustituye al `w-full` de `controlClass`; da la anchura con el contenedor (rejilla).
- Fastify 5: `disableRequestLogging` está obsoleto → `logController: new LogController(...)`.
- VPS: Docker **rootless**, sin compilar allí (temperatura), Cloudflare cachea por extensión (HTML y `/health` van con `no-store`).

## Remote Control (mandar tareas desde el móvil o claude.ai/code)
- `.claude/settings.json` (en git) permite sin preguntar los comandos habituales (pnpm, tests, build, git add/commit, compose de desarrollo) y **niega** leer `.env`, `git push --force` y `rm -rf`. El despliegue (`node tools/deploy.mjs`) y cualquier cosa fuera de la lista siguen pidiendo permiso.
- `.claude/settings.local.json` (personal, fuera de git): `remoteControlAtStartup` y aviso al móvil cuando algo espera tu permiso.
- Arrancar (en una terminal del Mac, en la raíz del repo): `caffeinate -i claude remote-control --name paquito-coach`. El Mac tiene que estar encendido y con esa terminal abierta.

## Skills del proyecto
En `.claude/skills/` (Claude Code las carga solas; otros agentes: leer el `SKILL.md`):
`deploy` (desplegar una versión), `nuevo-endpoint` (receta completa esquema→ruta→test→OpenAPI→web), `convenciones` (checklist de revisión).
