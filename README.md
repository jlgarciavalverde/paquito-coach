# Paquito Coach

App web para que un entrenador de fuerza y readaptación gestione a sus clientes en un solo sitio: alta y vínculo,
rutinas, plan de comidas, calendario y chat. Inspirada en Harbiz. *(Nombre provisional.)*

- **Estado y siguiente paso**: [`docs/ESTADO.md`](docs/ESTADO.md)
- **Qué incluye el MVP** (para Paquito): [`docs/producto/mvp.md`](docs/producto/mvp.md)
- **Cómo trabajar en el código** (humanos y agentes): [`AGENTS.md`](AGENTS.md)
- Arquitectura: [`docs/arquitectura.md`](docs/arquitectura.md) · API: [`docs/api/`](docs/api/README.md) · Seguridad: [`docs/seguridad.md`](docs/seguridad.md) · Operaciones: [`docs/OPERACIONES.md`](docs/OPERACIONES.md) · Diseño: [`docs/diseno.md`](docs/diseno.md) · Decisiones: [`docs/adr/`](docs/adr/)

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
pnpm install && pnpm db:up && cp .env.example .env && echo SETUP_CODE=dev >> .env
pnpm dev:api & pnpm dev:web     # http://localhost:5173
```

## Licencia

[MIT](LICENSE) © José Luis García Valverde.
