# Flujos principales

Complementa [arquitectura.md](arquitectura.md), donde están la petición autenticada, el ciclo de alta de clientes y el chat en tiempo real.

## Del alta del estudio al primer cliente

```mermaid
flowchart TD
  A[Entrenador entra en /alta] --> B[Estudio + cuenta<br/>prueba de 14 días]
  B --> C[Verifica el correo]
  C --> D[Ajustes: nombre, color, página /e/slug]
  D --> E[Conecta Stripe Express<br/>opcional]
  D --> F{Alta de cliente}
  F -- invitación --> G[Enlace de un uso, 7 días]
  F -- código del estudio --> H[El cliente se registra → pendiente → aceptar]
  F -- ficha sin cuenta --> I[Solo datos, se puede invitar después]
  G & H --> J[PAR-Q+ al entrar]
  J --> K[Asignar rutina / programa y plan de comidas]
```

## Entreno del cliente (cuaderno de series)

```mermaid
sequenceDiagram
  actor C as Cliente
  participant W as Web (móvil)
  participant A as API
  participant DB as Postgres
  actor E as Entrenador

  C->>W: Hoy → Empezar
  W->>A: GET /api/v1/workouts/:id
  loop cada serie
    C->>W: kilos y repeticiones → «hecha»
    W->>W: guarda el borrador local y arranca el descanso
    W->>A: PUT /api/v1/workouts/:id/log
    A->>DB: workouts.log (JSONB)
    A-->>W: récord si supera su mejor marca
  end
  C->>W: Terminar
  W->>A: POST /api/v1/workouts/:id/complete
  A->>DB: completado + actividad para el entrenador
  A-->>E: aparece en «Hoy» como entreno por revisar
```

## Reserva con pago

```mermaid
sequenceDiagram
  actor C as Cliente
  participant A as API
  participant S as Stripe (cuenta del estudio)
  participant DB as Postgres

  C->>A: GET /api/v1/me/booking (huecos libres)
  C->>A: POST /api/v1/me/checkout {cita o bono}
  A->>A: ¿estudio con Stripe conectado?
  A->>DB: payment pendiente (clave de idempotencia)
  A->>S: Checkout Session (Stripe-Account del estudio)
  S-->>C: página de pago
  C->>S: paga
  S->>A: webhook checkout.session.completed (firmado)
  A->>DB: stripe_events (deduplica) → payment pagado
  A->>DB: confirma la cita o activa el bono
  A-->>C: correo y aviso push
```

## Propuesta de la IA

```mermaid
sequenceDiagram
  actor E as Entrenador
  participant A as API
  participant DB as Postgres
  participant G as Gemini

  E->>A: sube documentos (PDF, Word, texto)
  A->>DB: ai_documents + ai_chunks (~3.500 caracteres)
  E->>A: POST /api/v1/ai/routine {cliente, objetivo}
  A->>DB: ai_usage: ¿por debajo del límite diario?
  A->>DB: fragmentos relevantes + contexto del cliente
  A->>A: seudonimiza al cliente (sin nombre ni datos de contacto)
  A->>G: generateContent con esquema JSON
  G-->>A: propuesta
  A->>A: valida con RoutineBody (zod)
  A-->>E: borrador editable
  E->>A: revisa y guarda (POST /api/v1/routines)
```

## Estudio en pausa

```mermaid
stateDiagram-v2
  [*] --> prueba: alta pública
  prueba --> activo: elige plan y paga
  prueba --> pausa: pasan 14 días sin plan
  activo --> gracia: falla el cobro
  gracia --> activo: se paga
  gracia --> pausa: 7 días sin pagar
  activo --> pausa: baja al terminar el periodo
  pausa --> activo: paga
  activo --> suspendido: administrador
  suspendido --> activo: administrador
  note right of pausa
    Lectura y exportación sí.
    Escrituras → 402 studio_locked.
  end note
```
