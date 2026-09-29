import { defineConfig, devices } from "@playwright/test";

const PORT = 4310;
const BASE = `http://localhost:${PORT}`;

/**
 * E2E contra la app compilada (API + web estática), como en producción.
 * Requiere el Postgres de desarrollo (`pnpm db:up`) y `pnpm build` antes.
 * Los specs comparten base de datos y se ejecutan en orden (un solo worker).
 */
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE, locale: "es-ES", timezoneId: "Europe/Madrid", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --import tsx e2e/reset-db.ts && node --import tsx apps/api/src/server.ts",
    url: `${BASE}/health`,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "test",
      PORT: String(PORT),
      DATABASE_URL: "postgres://coach:coach@127.0.0.1:5433/coach_e2e",
      WEB_DIR: "apps/web/dist",
      ALLOWED_ORIGINS: BASE,
      PUBLIC_URL: BASE,
      SETUP_CODE: "e2e-setup",
      AUTH_RATE_LIMIT: "1000",
      GLOBAL_RATE_LIMIT: "5000",
      LOG_LEVEL: "warn",
      AI_FAKE: "1",
      PAYMENTS_FAKE: "1",
    },
  },
});
