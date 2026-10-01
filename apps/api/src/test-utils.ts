import postgres from "postgres";
import type { LightMyRequestResponse } from "fastify";
import { buildApp, type App } from "./app";
import type { AppConfig } from "./config";
import { resetThrottle } from "./lib/throttle";

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? "postgres://coach:coach@127.0.0.1:5433/coach_test";
export const ORIGIN = "http://test.local";
export const SETUP_CODE = "codigo-de-instalacion";
export const TEST_DATA_DIR = new URL("../.test-data/", import.meta.url).pathname;

/** Vacía la base de datos de test (las migraciones se vuelven a aplicar al construir la app). */
export async function resetDb() {
  const sql = postgres(TEST_DB_URL, { onnotice: () => {} });
  // Conexiones que haya dejado el fichero anterior (una tarea en segundo plano tras `app.close()`) bloquearían el borrado.
  await sql`select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()`;
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await sql.end();
  resetThrottle();
}

export async function testApp(over: Partial<AppConfig> = {}, opts: Parameters<typeof buildApp>[1] = {}): Promise<App> {
  return buildApp(
    {
    databaseUrl: TEST_DB_URL,
    version: "test",
    allowedOrigins: [ORIGIN],
    publicUrl: ORIGIN,
    setupCode: SETUP_CODE,
    secureCookies: false,
    trustCloudflare: false,
    authRateLimit: 1000,
    globalRateLimit: 10_000,
    exposeDocs: false,
    logLevel: "silent",
    seedExercises: false,
    dataDir: TEST_DATA_DIR,
    geminiModel: "test",
    geminiEmbedModel: "test",
    aiDailyLimit: 1000,
    mailSmtpPort: 587,
    mailFrom: "Test <test@example.com>",
    ...over,
    },
    opts,
  );
}

/** Cliente HTTP con su propia cookie de sesión, como un navegador. */
export class Agent {
  cookie = "";
  constructor(private app: App) {}

  async req(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res: LightMyRequestResponse = await this.app.inject({
      method,
      url,
      payload: body as object | undefined,
      headers: { origin: ORIGIN, ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
    });
    const set = res.headers["set-cookie"];
    const first = Array.isArray(set) ? set[0] : set;
    if (first) this.cookie = first.split(";")[0]!.endsWith("=") ? "" : first.split(";")[0]!;
    return { status: res.statusCode, body: res.body ? safeJson(res.body) : undefined, headers: res.headers };
  }
  get = (url: string) => this.req("GET", url);
  post = (url: string, body: unknown = {}) => this.req("POST", url, body);
  patch = (url: string, body: unknown) => this.req("PATCH", url, body);
  del = (url: string) => this.req("DELETE", url);
}

const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

export const PASSWORD = "una-contraseña-larga";

/** Crea el estudio y devuelve un Agent con la sesión del entrenador. */
export async function setupCoach(app: App, email = "paquito@example.com", studioName = "Estudio Paquito") {
  const a = new Agent(app);
  const r = await a.post("/api/v1/auth/setup", { setupCode: SETUP_CODE, studioName, name: "Paquito", email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`setup falló: ${JSON.stringify(r.body)}`);
  return a;
}

/** Crea una ficha invitada y registra al cliente con ella. */
export async function inviteAndRegister(app: App, coach: Agent, name: string, email: string) {
  const c = await coach.post("/api/v1/clients", { name, email, invite: true });
  const token = new URL(c.body.invite.url).searchParams.get("invitacion")!;
  const client = new Agent(app);
  const r = await client.post("/api/v1/auth/register", { inviteToken: token, name, email, password: PASSWORD, healthDataConsent: true });
  if (r.status !== 200) throw new Error(`registro falló: ${JSON.stringify(r.body)}`);
  return { client, clientId: c.body.client.id as string };
}
