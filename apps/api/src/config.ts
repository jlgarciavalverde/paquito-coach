export interface AppConfig {
  databaseUrl: string;
  version: string;
  /** Orígenes desde los que se aceptan peticiones que modifican datos (comprobación de `Origin`). */
  allowedOrigins: string[];
  /** URL pública con la que se construyen los enlaces de invitación. */
  publicUrl: string;
  /** Código para crear la primera cuenta (entrenador). Sin él no se puede hacer el alta inicial. */
  setupCode?: string;
  /** Cookies `Secure` + prefijo `__Host-` (producción, HTTPS). */
  secureCookies: boolean;
  /** Tomar la IP del cliente de `CF-Connecting-IP` (solo detrás del túnel de Cloudflare). */
  trustCloudflare: boolean;
  authRateLimit: number;
  globalRateLimit: number;
  /** Documentación interactiva de la API en /api/docs. */
  exposeDocs: boolean;
  webDir?: string;
  logLevel?: string;
  /** Cargar la biblioteca común de ejercicios si está vacía (los tests que no la usan la desactivan). */
  seedExercises?: boolean;
  /** Carpeta de datos persistentes (fotos del chat en `media/`). */
  dataDir: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
  /** Instancia de demostración pública (base de datos propia, se re-siembra cada noche). */
  demoMode?: boolean;
}

export function configFromEnv(env = process.env): AppConfig {
  const prod = env.NODE_ENV === "production";
  const list = (v: string | undefined, def: string) =>
    (v ?? def).split(",").map((s) => s.trim()).filter(Boolean);
  return {
    databaseUrl: env.DATABASE_URL ?? "postgres://coach:coach@127.0.0.1:5433/coach",
    version: env.APP_VERSION ?? "0.0.0-dev",
    allowedOrigins: list(env.ALLOWED_ORIGINS, "http://localhost:5173,http://localhost:3000"),
    publicUrl: env.PUBLIC_URL ?? "http://localhost:5173",
    setupCode: env.SETUP_CODE || undefined,
    secureCookies: prod,
    trustCloudflare: prod,
    authRateLimit: Number(env.AUTH_RATE_LIMIT ?? 10),
    globalRateLimit: Number(env.GLOBAL_RATE_LIMIT ?? 300),
    exposeDocs: env.EXPOSE_API_DOCS === "1" || !prod,
    webDir: env.WEB_DIR,
    logLevel: env.LOG_LEVEL,
    dataDir: env.DATA_DIR ?? "data",
    vapidPublicKey: env.VAPID_PUBLIC_KEY || undefined,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY || undefined,
    vapidSubject: env.VAPID_SUBJECT || "mailto:admin@redgarverde.com",
    demoMode: env.DEMO_MODE === "1",
  };
}
