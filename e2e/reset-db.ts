import postgres from "postgres";

// Base de datos de e2e vacía en cada ejecución. Se ejecuta ANTES de arrancar la API (que aplica las migraciones):
// el globalSetup de Playwright corre después de levantar el webServer, por eso no sirve para esto.
const sql = postgres("postgres://coach:coach@127.0.0.1:5433/coach_e2e", { onnotice: () => {} });
await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
await sql.end();
