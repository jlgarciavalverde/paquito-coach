# Estado del proyecto

> Registro vivo. Lo primero que lee cualquier agente; lo último que actualiza al cerrar una sesión.
> Formato: fecha · quién (modelo/herramienta) · qué. Lo más reciente arriba.

## Ahora mismo
- **Versión**: 0.1.0 (F0 + F1), **no desplegada todavía**. Imagen `paquito-coach:0.1.0` construida y probada en local con el compose de producción.
- **Siguiente tarea**: primera instalación en el VPS (ver «Bloqueos»), luego **F2 — Entrenamiento**.
- **Plan aprobado**: `~/.claude/plans/mighty-splashing-widget.md` (resumen en `docs/producto/mvp.md`).

## Fases
| Fase | Contenido | Estado |
|---|---|---|
| F0 | Monorepo, docs, diseño, base API (seguridad), Postgres, tests, imagen | ✅ hecho |
| F1 | Cuentas, estudio, 3 formas de alta, ficha, inicio coach, recuperar acceso | ✅ hecho |
| F2 | Biblioteca de ejercicios (semilla free-exercise-db), editor de rutinas, asignar, registro del cliente | ⏳ siguiente |
| F3 | Nutrición: plan semanal, plantillas, comidas cumplidas | pendiente |
| F4 | Calendario: citas + vista unificada semana/mes, arrastrar | pendiente |
| F5 | Chat: WebSocket, imágenes, leídos, web push | pendiente |
| F6 | RGPD (exportar/borrar), revisión de seguridad, rendimiento, entrega | pendiente |

## Bloqueos (necesitan al humano)
1. **SSH al VPS**: en una terminal normal, `ssh-add --apple-use-keychain ~/.ssh/id_ed25519`.
2. **Primera instalación** (docs/OPERACIONES.md): crear `~/servicios/coach/.env` con `POSTGRES_PASSWORD` y `SETUP_CODE` generados en el VPS.
3. **Cloudflare**: añadir en el panel del túnel el hostname público (propuesto `paquito.redgarverde.com`) → `http://coach:3000`.
4. **Paquito decide**: nombre de la app (hoy «Paquito Coach», se cambia en `packages/shared/src/brand.ts` + `apps/web/index.html`), subdominio, si quiere anamnesis/PAR-Q en el MVP, y vídeos propios o YouTube.

## Herramientas de agente recomendadas (instalar una vez, las ejecuta el humano)
```
/plugin install frontend-design@claude-plugins-official
/plugin install typescript-lsp@claude-plugins-official
/plugin install security-guidance@claude-plugins-official
claude mcp add playwright -- npx -y @playwright/mcp@latest
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
claude mcp add shadcn -- npx -y shadcn@latest mcp
```

## Verificación actual (2026-09-29)
- `pnpm typecheck` limpio · API 23 tests (aislamiento entre estudios, invitaciones de un uso, bloqueo por cuenta, 429 por IP, CSRF, CSP, restablecer) · web 3 tests.
- e2e: 8/8 con axe WCAG 2.1 AA (claro, oscuro, móvil, escritorio).
- Imagen de producción probada en local: `/health` ok, CSP/HSTS, `/api/docs` 404, POST sin Origin → 403, backup diario escrito.

## Historial
- **2026-09-29 · Claude (Opus 5.5)** · F0+F1 completas. Stack, seguridad, alta de clientes (invitación / código + aceptar / ficha sin cuenta), ficha con datos de salud (auditada), ajustes (código del estudio, sesiones, contraseña, tema), área del cliente (Hoy, perfil, pantalla «solicitud enviada»), recuperar acceso por enlace del entrenador, marcadores «En construcción» de F2–F5 dentro de la app para que Paquito vea la hoja de ruta. Docs y skills del proyecto.
