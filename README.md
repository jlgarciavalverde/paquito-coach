# Paquito Coach

[![Licencia: todos los derechos reservados](https://img.shields.io/badge/licencia-propietaria-lightgrey)](LICENSE)
[![Versión 2.3.0](https://img.shields.io/badge/versión-2.3.0-orange)](CHANGELOG.md)
[![Demo pública](https://img.shields.io/badge/demo-pública-brightgreen)](https://demo-paquito.redgarverde.com)
![Node 22](https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white)
![React 19](https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=black)
![Postgres 17](https://img.shields.io/badge/postgres-17-4169E1?logo=postgresql&logoColor=white)

Plataforma web para entrenadores de fuerza y readaptación y sus clientes, nacida para Paquito e
inspirada en Harbiz: alta y vínculo de clientes, rutinas y programas, cuaderno de series, plan de
comidas, agenda y reservas, bonos y cobros, check-ins, salud, chat e IA. Desde la 2.0 es **SaaS**:
cada entrenador tiene su estudio, con su página pública y su cuenta de Stripe. Con **demo pública**
de un clic para probarla sin cuenta.

![El día a día del entrenador: citas, entrenos pendientes y alertas](docs/capturas/coach-hoy.png)

## Dos vistas, una sola app

**Escritorio, para el entrenador** — panel del día (citas, entrenos por revisar, solicitudes),
ficha completa por clienta (entreno, progreso, check-ins, salud, nutrición, agenda y chat),
biblioteca de rutinas y programas de varias semanas, agenda semanal arrastrable y asistente de IA:

| Clientes | Ficha de clienta | Agenda | Entrenos |
|---|---|---|---|
| ![Clientes](docs/capturas/coach-clientes.png) | ![Ficha](docs/capturas/coach-ficha.png) | ![Agenda](docs/capturas/coach-calendario.png) | ![Entrenos](docs/capturas/coach-entrenos.png) |

| Planes de comida | Acceso a la demo (un clic) |
|---|---|
| ![Nutrición](docs/capturas/coach-nutricion.png) | ![Acceso a la demo](docs/capturas/demo-acceso.png) |

**Móvil, para la clienta** — su entreno de hoy, próximas citas, comidas, check-ins y chat con el
entrenador, con avisos push:

| Hoy | Entreno (oscuro) | Progreso |
|---|---|---|
| ![Hoy de la clienta](docs/capturas/clienta-hoy.png) | ![Entrenos en tema oscuro](docs/capturas/clienta-entrenos-oscuro.png) | ![Progreso](docs/capturas/clienta-progreso.png) |

**Asistente de IA** sobre los documentos del entrenador (tema oscuro):

![Asistente de IA](docs/capturas/coach-ia-oscuro.png)

*Capturas reales de la instancia demo (datos inventados que se re-siembran cada noche).*

## Qué incluye

- **Clientes**: alta por invitación, ficha con lesiones y objetivos, medidas y fotos de progreso,
  check-ins periódicos con alertas, cuaderno de seguimiento.
- **Entrenamiento**: rutinas con progresión de cargas, programas de varias semanas, semana de
  entrenos por clienta, récords y material descargable para la clienta.
- **Nutrición**: plan de comidas por clienta con intercambios.
- **Agenda**: citas y sesiones con bonos de sesiones, reserva y pago online (Stripe), asistencia.
- **Comunicación**: chat privado en tiempo real con fotos y avisos push (Web Push).
- **Seguridad de verdad**: sesiones con cookie `__Host`, 2FA (TOTP), verificación de correo,
  acceso por defecto denegado, aislamiento total por estudio, auditoría de acciones sensibles y
  RGPD (exportación y borrado de datos).
- **IA**: generación de rutinas a partir de los documentos del entrenador (Gemini, en el servidor,
  nunca en el navegador de la clienta).
- **Plataforma (SaaS)**: alta pública con prueba de 14 días, planes por número de clientes,
  página propia por estudio (`/e/<slug>` o dominio propio) y cobros con Stripe Connect Express
  en la cuenta de cada entrenador, sin comisión.
- **Demo pública**: instancia aparte con datos de ejemplo, entrada con un clic y re-siembra
  nocturna.

## Cómo está hecho

```mermaid
flowchart LR
    subgraph Web["apps/web — React 19 + Vite + TanStack Router/Query + Tailwind v4"]
        Coach["Vista entrenador<br/>/coach/*"] 
        Cliente["Vista clienta<br/>/app/*"]
    end
    subgraph API["apps/api — Fastify 5 + Zod + Drizzle"]
        Auth["Sesiones cookie + 2FA<br/>scrypt · CSRF · rate-limit"]
        Rutas["Rutas por módulo<br/>(autorización explícita)"]
        IA2["Asistente IA (Gemini)"]
        WS["Chat en tiempo real<br/>(WebSocket)"]
    end
    DB[("Postgres 17<br/>aislamiento por studio_id")]
    Stripe["Stripe Checkout<br/>+ webhook firmado"]
    Brevo["Brevo SMTP<br/>correo transaccional"]
    Web --> API
    Coach --> Rutas
    Cliente --> Rutas
    Auth --> DB
    Rutas --> DB
    IA2 --> DB
    WS --> DB
    Rutas --> Stripe
    Rutas --> Brevo
    subgraph Demo["Demo pública (DEMO_MODE)"]
        DDB[("coach_demo<br/>re-siembra nocturna")]
    end
    API -.-> DDB
```

- **Contrato compartido**: los esquemas Zod viven en `packages/shared` y los usan la API (valida
  entrada/salida) y la web (tipos) — nada de tipos duplicados.
- **Tests**: Vitest contra Postgres real (API y web) y Playwright + axe contra la build de
  producción, e2e incluidos de la demo.
- **Despliegue**: imagen Docker amd64 construida en el Mac, subida por SSH al VPS y vuelta atrás
  automática si `/health` no responde (`node tools/deploy.mjs X.Y.Z`); detrás de Cloudflare Tunnel.

## Documentación

- **Estado y siguiente paso**: [`docs/ESTADO.md`](docs/ESTADO.md)
- **Qué incluye el MVP** (para Paquito): [`docs/producto/mvp.md`](docs/producto/mvp.md)
- **Cómo trabajar en el código** (humanos y agentes): [`AGENTS.md`](AGENTS.md)
- Arquitectura: [`docs/arquitectura.md`](docs/arquitectura.md) · Requisitos: [`docs/requisitos.md`](docs/requisitos.md) · Flujos: [`docs/flujos.md`](docs/flujos.md) · API: [`docs/api/`](docs/api/README.md) · Seguridad: [`docs/seguridad.md`](docs/seguridad.md) · Operaciones: [`docs/OPERACIONES.md`](docs/OPERACIONES.md) · Diseño: [`docs/diseno.md`](docs/diseno.md) · Decisiones: [`docs/adr/`](docs/adr/)

## Arrancar en local

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
pnpm install && pnpm db:up && cp .env.example .env && echo SETUP_CODE=dev >> .env
pnpm dev:api & pnpm dev:web     # http://localhost:5173
```

Verificación completa antes de dar algo por hecho: `pnpm typecheck && pnpm test && pnpm build && pnpm e2e`.

## Licencia

Todos los derechos reservados desde la 2.3.0: el código se puede consultar, pero no usar, copiar
ni desplegar sin permiso. Ver [LICENSE](LICENSE). Las versiones publicadas antes de este cambio
se distribuyeron con licencia MIT y conservan esa licencia.
