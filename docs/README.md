# Documentación

| Documento | Para quién | Qué contiene |
|---|---|---|
| **Producto** | | |
| [Requisitos](requisitos.md) | Cualquiera | Actores y requisitos funcionales (por área) y no funcionales |
| [Flujos](flujos.md) | Cualquiera | Alta del estudio, cuaderno de series, reserva con pago, IA y estudio en pausa |
| [MVP](producto/mvp.md) | Paquito | Qué incluye la primera versión y cómo se usa |
| [Comparación con Harbiz](producto/harbiz-auditoria.md) | Producto | Funciones de Harbiz y en qué punto está cada una aquí |
| **Técnica** | | |
| [Arquitectura](arquitectura.md) | Desarrollo | Sistema, petición autenticada, alta de clientes, plataforma, Stripe, modelo de datos y tiempo real |
| [Seguridad](seguridad.md) | Desarrollo | Revisiones y endurecimientos versión a versión, y conservación de datos |
| [API](api/README.md) | Desarrollo | Convenciones y especificación OpenAPI generada |
| [Sistema de diseño](diseno.md) | Desarrollo y diseño | Origen, tokens, componentes, maquetación y movimiento |
| [Auditoría de diseño](diseno-auditoria.md) | Diseño | Mejoras pendientes por prioridad |
| [AGENTS.md](../AGENTS.md) | Desarrollo y agentes de IA | Convenciones obligatorias, comandos y trampas conocidas |
| **Operación** | | |
| [Operaciones](OPERACIONES.md) | Quien mantiene el servidor | Instalación, despliegue, copias, vuelta atrás, avisos y demo |
| [Estado](ESTADO.md) | Desarrollo | Qué está hecho, qué sigue y bloqueos |
| [CHANGELOG](../CHANGELOG.md) | Cualquiera | Cambios de cada versión |

## Decisiones de arquitectura (ADR)

| ADR |
|---|
| [0001 — Vite + React y Fastify en un monorepo pnpm](adr/0001-stack-vite-fastify-monorepo.md) |
| [0002 — Postgres + Drizzle en lugar de SQLite](adr/0002-postgres-drizzle.md) |
| [0003 — Sesiones con token opaco en cookie, no JWT](adr/0003-sesiones-cookie-no-jwt.md) |
| [0004 — Datos separados por estudio desde el día 1](adr/0004-multi-estudio-desde-el-principio.md) |
| [0005 — Tres formas de alta de clientes](adr/0005-alta-de-clientes.md) |
| [0006 — Calendario propio en vez de FullCalendar](adr/0006-calendario-propio.md) |
| [0007 — Contenido de rutinas y entrenos en JSONB validado con Zod](adr/0007-rutinas-en-jsonb.md) |
| [0008 — Rediseño: «hoja de entrenamiento clínica» (v0.2)](adr/0008-rediseno-hoja-clinica.md) |
| [0009 — Demo pública como instancia separada](adr/0009-demo-instancia-separada.md) |
| [0010 — Recordatorios en el propio servidor y copias verificadas en el Mac](adr/0010-recordatorios-y-copias.md) |
| [0011 — Seguimiento: check-ins periódicos, fotos de progreso y medidas propias](adr/0011-seguimiento-checkins-fotos-metricas.md) |
| [0012 — IA con Gemini (plan gratuito), documentos del entrenador y seudonimización](adr/0012-ia-gemini-gratis-seudonimizada.md) |
| [0013 — Cobros con Stripe Checkout y webhooks firmados](adr/0013-cobros-stripe-checkout.md) |
| [0014 — Seguridad por capas: acceso denegado por defecto, entradas saneadas y pruebas generadas](adr/0014-seguridad-por-capas.md) |
| [0015 — Dinero: cobros idempotentes, enlaces que caducan y cobros anonimizados al borrar](adr/0015-dinero-idempotente-y-cobros-anonimizados.md) |
| [0016 — Correo con bandeja de salida (Brevo) y verificación en dos pasos (TOTP)](adr/0016-correo-con-bandeja-y-2fa.md) |
| [0017 — Página pública en `/`, marca del estudio y datos legales](adr/0017-pagina-publica-y-marca-del-estudio.md) |
| [0018 — Plataforma para varios entrenadores (SaaS): direcciones, planes y administración](adr/0018-plataforma-varios-estudios.md) |
| [0019 — Cobros de cada estudio con Stripe Connect Express y cargos directos](adr/0019-stripe-connect-express-cargos-directos.md) |

Plantilla para un ADR nuevo: [adr/0000-plantilla.md](adr/0000-plantilla.md).
