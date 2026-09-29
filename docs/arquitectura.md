# Arquitectura

## Sistema
```mermaid
flowchart LR
  subgraph Navegador
    W[Web React<br/>/coach · /app]
  end
  subgraph Cloudflare
    CF[Túnel cloudflared]
  end
  subgraph joseluis-vps["joseluis-vps (Docker rootless)"]
    subgraph proxy[red proxy]
      APP[coach<br/>Fastify: API + estáticos]
    end
    subgraph internal[red internal · sin salida]
      DB[(coach-db<br/>Postgres 17)]
      BK[coach-backup<br/>pg_dump diario]
    end
  end
  W -- HTTPS --> CF --> APP
  APP --> DB
  BK --> DB
```
- Un solo origen: la API (`/api/v1/*`) y la web estática los sirve el mismo contenedor → **sin CORS**.
- Postgres solo es alcanzable desde la red `internal` (marcada `internal: true`: sin salida a internet). Ningún servicio publica puertos.

## Petición autenticada
```mermaid
sequenceDiagram
  participant B as Navegador
  participant A as API (Fastify)
  participant P as Postgres
  B->>A: POST /api/v1/clients (cookie sid, Origin)
  A->>A: rate-limit (IP de CF-Connecting-IP)
  A->>P: sesión = sha256(cookie) → usuario + estudio
  A->>A: CSRF: Origin ∈ ALLOWED_ORIGINS
  A->>A: validación Zod (body)
  A->>A: requireCoach(req)
  A->>P: INSERT … studio_id = req.user.studioId
  A->>P: audit_log
  A-->>B: 200 JSON validado por el esquema de respuesta
```

## Alta y vínculo de clientes
```mermaid
stateDiagram-v2
  [*] --> no_account: Ficha sin cuenta
  [*] --> invited: Ficha + invitación
  no_account --> invited: Invitar a la app
  invited --> active: Registro con el enlace (un uso, 7 días)
  [*] --> pending: Registro con código del estudio
  pending --> active: Entrenador acepta
  pending --> [*]: Entrenador rechaza (se borra la cuenta)
  active --> archived: Archivar (se cierran sus sesiones)
  no_account --> archived
  archived --> active: Recuperar (si tenía cuenta)
  archived --> no_account: Recuperar (sin cuenta)
```

## Modelo de datos (F1)
```mermaid
erDiagram
  studios ||--o{ users : tiene
  studios ||--o{ client_profiles : tiene
  users ||--o| client_profiles : "cuenta del cliente"
  users ||--o{ sessions : abre
  client_profiles ||--o{ invites : recibe
  users ||--o{ password_resets : recibe
  studios ||--o{ audit_log : registra
```
Tablas previstas por fase (plan): `exercises`, `routines`, `routine_blocks`, `routine_items`, `workout_assignments`,
`workout_logs`, `set_logs` (F2) · `meal_plans`, `meal_plan_days`, `meals`, `meal_items`, `meal_checks` (F3) ·
`appointments` (F4) · `conversations`, `messages`, `message_reads`, `media`, `push_subscriptions` (F5) · `body_metrics`.

## Tiempo real (F5, previsto)
`@fastify/websocket` en `/ws`, autenticado con la misma cookie. Bus de eventos en memoria (un proceso).
Eventos tipados en `packages/shared` (`message.new`, `message.read`, `workout.completed`…). El cliente, al
reconectar, se pone al día por REST: el socket solo acelera, nunca es la única vía de datos.
