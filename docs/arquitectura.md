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

## Plataforma: varios estudios en una instalación

```mermaid
flowchart TB
  req[Petición] --> t{"lib/tenant.ts<br/>¿qué estudio?"}
  t -- "con sesión" --> su["estudio del usuario"]
  t -- "?estudio=slug" --> sl["ese estudio"]
  t -- "dominio propio<br/>(HOST_STUDIOS)" --> dom["estudio del dominio"]
  t -- "nada" --> plat["web de la plataforma<br/>/ · /alta · /precios"]
  su & sl & dom --> acc{"studioAccess<br/>prueba · plan · impago"}
  acc -- "al día" --> ok[Ruta]
  acc -- "en pausa" --> ro["solo lectura + exportar<br/>el resto 402 studio_locked"]
```

- Cada estudio tiene su página en `/e/<slug>` y, si quiere, un dominio propio (Paquito: `paquito.redgarverde.com`).
- Planes: prueba de 14 días (5 clientes), básico, pro, estudio y fundador. Solo cambia cuántos clientes ocupan plaza a la vez (ADR 0018).
- Administración de la plataforma en `/coach/admin`, solo para los correos de `PLATFORM_ADMIN_EMAILS`.

## Cobros: dos niveles de Stripe

```mermaid
flowchart LR
  subgraph plataforma["Cuenta Stripe de la plataforma"]
    sub["Stripe Billing<br/>cuota mensual del estudio"]
  end
  subgraph estudio["Cuenta Stripe Express del entrenador"]
    co["Checkout: bonos, cuotas,<br/>pagar al reservar, enlaces"]
  end
  coach["Entrenador"] -- "paga su plan" --> sub
  cliente["Cliente"] -- "cargo directo<br/>(Stripe-Account)" --> co
  sub -- "webhook (secreto plataforma)" --> wh["/api/v1/stripe/webhook"]
  co -- "webhook (secreto Connect)<br/>solo toca cobros de event.account" --> wh
  wh --> db[("payments · subscriptions<br/>stripe_events (idempotencia)")]
```

Sin comisión de la plataforma: cada entrenador cobra en su cuenta y paga la comisión de Stripe (ADR 0019). Los cobros son idempotentes y quedan anonimizados si se borra el cliente (ADR 0015).

## Modelo de datos

42 tablas en `apps/api/src/db/schema.ts`. Todas las de negocio llevan `studio_id`, y el acceso a datos pasa siempre por él (ADR 0004). Por dominios:

```mermaid
erDiagram
  studios ||--o{ users : "entrenadores y clientes"
  studios ||--o{ client_profiles : tiene
  users ||--o| client_profiles : "cuenta del cliente"
  users ||--o{ sessions : abre
  client_profiles ||--o{ invites : recibe
  studios ||--o{ audit_log : registra

  studios ||--o{ exercises : biblioteca
  studios ||--o{ routines : biblioteca
  studios ||--o{ programs : biblioteca
  routines ||--o{ workouts : "se asigna como"
  client_profiles ||--o{ workouts : "entrena (series en JSONB)"
  programs ||--o{ program_runs : "se aplica"
  client_profiles ||--o{ program_runs : sigue

  client_profiles ||--o{ meal_plans : tiene
  client_profiles ||--o{ meal_checks : marca

  client_profiles ||--o{ appointments : reserva
  client_profiles ||--o{ session_packs : compra
  studios ||--|| booking_settings : configura

  client_profiles ||--o{ messages : conversa
  messages }o--o| media : adjunta
  client_profiles ||--o{ conversation_reads : "leído hasta"

  client_profiles ||--o{ body_metrics : mide
  client_profiles ||--o{ progress_photos : sube
  metric_defs ||--o{ metric_values : define
  checkin_forms ||--o{ checkin_assignments : "se asigna"
  checkin_assignments ||--o{ checkin_responses : "se responde"
  client_profiles ||--o{ questionnaires : "PAR-Q+ / anamnesis"

  studios ||--o{ prices : tarifas
  prices ||--o{ payments : cobra
  prices ||--o{ subscriptions : cuota
  payments }o--o| session_packs : "paga bono"
  payments }o--o| appointments : "paga cita"

  studios ||--o{ ai_documents : sube
  ai_documents ||--o{ ai_chunks : "trocea"
  studios ||--o{ resources : "material para clientes"
```

| Dominio | Tablas |
|---|---|
| Identidad y acceso | `studios`, `users`, `sessions`, `client_profiles`, `invites`, `password_resets`, `email_tokens`, `audit_log`, `leads` |
| Entrenamiento | `exercises`, `routines`, `workouts`, `programs`, `program_runs` |
| Nutrición | `meal_plans`, `meal_checks` |
| Agenda y bonos | `appointments`, `booking_settings`, `session_packs` |
| Comunicación | `messages`, `media`, `conversation_reads`, `push_subscriptions`, `reminder_log`, `outbox` (correo con reintentos) |
| Seguimiento y salud | `body_metrics`, `progress_photos`, `metric_defs`, `metric_values`, `checkin_forms`, `checkin_assignments`, `checkin_responses`, `questionnaires` |
| Cobros | `prices`, `payments`, `subscriptions`, `stripe_events` |
| IA y material | `ai_documents`, `ai_chunks`, `ai_usage`, `resources` |
| Operación | `error_reports` |

## Tiempo real

`@fastify/websocket` en `/ws`, autenticado con la misma cookie. `lib/realtime.ts` guarda en memoria las conexiones de cada usuario (un solo proceso) y envía eventos tipados de `packages/shared` (`message.new`, `message.read`). Si el usuario no está conectado, el aviso va por Web Push. El socket solo acelera: al reconectar, la web se pone al día por REST, y los contadores de no leídos se refrescan también cada 2 minutos.

```mermaid
sequenceDiagram
  participant C as Cliente (móvil)
  participant A as API
  participant H as Hub (memoria)
  participant DB as Postgres
  participant E as Entrenador
  C->>A: POST /api/v1/me/messages
  A->>DB: INSERT messages (studio_id)
  A->>H: send(entrenador, message.new)
  alt entrenador conectado
    H-->>E: evento por /ws
  else desconectado
    A-->>E: Web Push
  end
  E->>A: POST /api/v1/conversations/:clientId/read
  A->>DB: conversation_reads
  A->>H: send(cliente, message.read)
```
