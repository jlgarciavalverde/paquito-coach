import { defineConfig, devices } from "@playwright/test";

const PORT = 4311;
const BASE = `http://localhost:${PORT}`;

/** E2E de la instancia demo (DEMO_MODE=1, base de datos propia `coach_demo`). `pnpm e2e:demo` tras `pnpm build`. */
export default defineConfig({
  testDir: "e2e-demo",
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: BASE, locale: "es-ES", timezoneId: "Europe/Madrid", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --import tsx apps/api/src/server.ts",
    url: `${BASE}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      PORT: String(PORT),
      DEMO_MODE: "1",
      DATABASE_URL: "postgres://coach:coach@127.0.0.1:5433/coach_demo",
      WEB_DIR: "apps/web/dist",
      ALLOWED_ORIGINS: BASE,
      PUBLIC_URL: BASE,
      AUTH_RATE_LIMIT: "1000",
      GLOBAL_RATE_LIMIT: "5000",
      LOG_LEVEL: "warn",
    },
  },
});
