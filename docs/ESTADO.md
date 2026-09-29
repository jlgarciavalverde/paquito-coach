# Estado del proyecto

> Registro vivo. Lo primero que lee cualquier agente; lo último que actualiza al cerrar una sesión.
> Formato: fecha · quién (modelo/herramienta) · qué. Lo más reciente arriba.

## Ahora mismo
- **Versión**: 0.2.0 (F2 Entrenamiento + rediseño completo). 0.1.0 **desplegada en joseluis-vps** (`~/servicios/coach`: `coach`, `coach-db`, `coach-backup`), sana (`/health` ok, `db: ok`, primer backup escrito). `.env` creado en el VPS con secretos generados allí.
- **Aún no es pública**: falta la ruta en Cloudflare (bloqueo 3). Después, alta inicial en `/instalar` con el `SETUP_CODE` del `.env` del VPS.
- **Siguiente tarea**: **F3 — Nutrición**.
- **Plan aprobado**: `~/.claude/plans/mighty-splashing-widget.md` (resumen en `docs/producto/mvp.md`).

## Fases
| Fase | Contenido | Estado |
|---|---|---|
| F0 | Monorepo, docs, diseño, base API (seguridad), Postgres, tests, imagen | ✅ hecho |
| F1 | Cuentas, estudio, 3 formas de alta, ficha, inicio coach, recuperar acceso | ✅ hecho |
| F2 | Biblioteca de ejercicios (2.534 en español), editor de rutinas (bloques, A1/A2, superseries), asignar a varios clientes/días, cuaderno del cliente con descanso y RPE, actividad y semana en «Hoy» | ✅ hecho |
| — | Rediseño «hoja de entrenamiento clínica» (ADR 0008) | ✅ hecho |
| F3 | Nutrición: plan semanal, plantillas, comidas cumplidas | ⏳ siguiente |
| F4 | Calendario: citas + vista unificada semana/mes, arrastrar | pendiente |
| F5 | Chat: WebSocket, imágenes, leídos, web push | pendiente |
| F6 | RGPD (exportar/borrar), revisión de seguridad, rendimiento, entrega | pendiente |

## Bloqueos (necesitan al humano)
1. ~~SSH al VPS~~ (funciona).
2. ~~Primera instalación~~ (hecha el 2026-09-29).
3. **Cloudflare**: añadir en el panel del túnel el hostname público (propuesto `paquito.redgarverde.com`) → `http://coach:3000`.
4. **Alta inicial**: `ssh joseluis@192.168.18.7 'grep SETUP_CODE ~/servicios/coach/.env'` y usarlo en `https://<subdominio>/instalar` (una sola vez; lo hace Paquito con su correo o tú y luego le cambias los datos).
5. **Paquito decide**: nombre de la app (hoy «Paquito Coach», se cambia en `packages/shared/src/brand.ts` + `apps/web/index.html`), subdominio, si quiere anamnesis/PAR-Q en el MVP, y vídeos propios o YouTube.

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
- `pnpm typecheck` limpio · API 34 tests (incluye entrenamiento y aislamiento) · web 13 · e2e 12/12 con axe
- (v0.1.0) API 23 tests (aislamiento entre estudios, invitaciones de un uso, bloqueo por cuenta, 429 por IP, CSRF, CSP, restablecer) · web 3 tests.
- e2e: 8/8 con axe WCAG 2.1 AA (claro, oscuro, móvil, escritorio).
- Imagen de producción probada en local: `/health` ok, CSP/HSTS, `/api/docs` 404, POST sin Origin → 403, backup diario escrito.

## Historial
- **2026-09-29 · Claude (Opus 5.5)** · F2 completa y **rediseño** (petición: que no parezca generado por IA). Nuevo sistema en `docs/diseno.md` + ADR 0008. Entrenamiento: API (`routes/training.ts`, ADR 0007), semilla de 2.534 ejercicios en español, editor, asignación, cuaderno del cliente (autoguardado, descanso, RPE de sesión), «Hoy» con actividad y matriz semanal. Bugs cazados por e2e: límite global contaba estáticos (429 al cargar), caché de 30 s en «Hoy», bloqueo de navegación tras guardar. Verificado: API 34 tests, web 13, e2e 12/12 con axe.
- **2026-09-29 · Claude (Opus 5.5)** · Primer despliegue de 0.1.0 en el VPS; verificado `/health` desde la red `proxy` y que Postgres no es alcanzable desde ella.
- **2026-09-29 · Claude (Opus 5.5)** · F0+F1 completas. Stack, seguridad, alta de clientes (invitación / código + aceptar / ficha sin cuenta), ficha con datos de salud (auditada), ajustes (código del estudio, sesiones, contraseña, tema), área del cliente (Hoy, perfil, pantalla «solicitud enviada»), recuperar acceso por enlace del entrenador, marcadores «En construcción» de F2–F5 dentro de la app para que Paquito vea la hoja de ruta. Docs y skills del proyecto.
