/**
 * Acceso por defecto denegado, ANTES de validar nada (así sin sesión no se aprende ni el formato de los datos):
 * - Sin sesión: solo las rutas públicas.
 * - Cliente: solo lo suyo (`/me…`) y la lista de abajo. Todo lo demás es del entrenador.
 * Cada handler vuelve a comprobar permisos (`requireCoach`, `requireActiveClient`…): esto es una segunda capa, no la única.
 * Si añades una ruta pública o de cliente, añádela aquí (el test `security.matrix.test.ts` lo vigila).
 */
export const PUBLIC_ROUTES = new Set([
  "GET /api/v1/auth/setup-status",
  "POST /api/v1/auth/setup",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/logout",
  "POST /api/v1/auth/register",
  "POST /api/v1/auth/password/reset",
  "GET /api/v1/auth/invites/:token",
  "GET /api/v1/auth/join/:code",
  "POST /api/v1/auth/demo",
  "POST /api/v1/auth/login/2fa", // con el reto de la contraseña ya comprobada
  "POST /api/v1/auth/password/forgot",
  "POST /api/v1/auth/email/confirm", // con el token del enlace
  "POST /api/v1/auth/unsubscribe", // con el token del enlace
  "GET /api/v1/test/mails", // solo existe con el correo simulado (e2e)
  "GET /api/v1/public/studio",
  "GET /api/v1/public/studio/photo",
  "GET /api/v1/public/legal",
  "POST /api/v1/public/contact",
  "POST /api/v1/stripe/webhook", // autenticado por la firma de Stripe
  "POST /api/v1/stripe/simulate", // solo existe con la pasarela simulada (e2e)
  // S1: plataforma
  "GET /api/v1/platform",
  "GET /api/v1/auth/slug/:slug",
  "POST /api/v1/auth/signup",
]);

/** Rutas fuera de `/me` que también puede usar un cliente (cada una limita por dentro qué ve). */
export const CLIENT_ROUTES = new Set([
  "POST /api/v1/auth/password/change",
  "GET /api/v1/exercises",
  "GET /api/v1/exercises/:id",
  "GET /api/v1/workouts/:id",
  "PUT /api/v1/workouts/:id/log",
  "POST /api/v1/workouts/:id/complete",
  "POST /api/v1/workouts/:id/reopen",
  "POST /api/v1/media",
  "GET /api/v1/media/:id",
  "GET /api/v1/push/key",
  "POST /api/v1/push/subscriptions",
  "DELETE /api/v1/push/subscriptions",
  "GET /api/v1/payments/info",
]);

export type Gate = "public" | "login" | "coach-only" | "ok";

/** Lo único que puede hacer un cliente pendiente de aceptar (además de `/me`): su contraseña y los avisos. */
const NOT_ACTIVE_OK = new Set(["POST /api/v1/auth/password/change", "GET /api/v1/push/key", "POST /api/v1/push/subscriptions", "DELETE /api/v1/push/subscriptions"]);

export function gate(method: string, route: string | undefined, user: { role: "coach" | "client"; clientStatus?: string | null } | null): Gate {
  if (!route || !route.startsWith("/api/v1/")) return "ok"; // estáticos, /health, /ws y 404
  const k = `${method} ${route}`;
  if (PUBLIC_ROUTES.has(k)) return "public";
  if (!user) return "login";
  if (user.role === "coach") return "ok";
  if (route === "/api/v1/me" || route.startsWith("/api/v1/me/")) return "ok";
  // Un cliente pendiente de aceptar aún no ve la biblioteca, los entrenos ni los archivos del estudio.
  if (CLIENT_ROUTES.has(k)) return user.clientStatus === "active" || NOT_ACTIVE_OK.has(k) ? "ok" : "coach-only";
  return "coach-only";
}

/**
 * Estudio bloqueado (prueba terminada, impago o suspensión): se puede mirar todo (GET) y solo esto otro. Así el entrenador
 * puede pagar, exportar sus datos o darse de baja, y nadie pierde el acceso a su cuenta.
 */
const LOCKED_OK = [/^\/api\/v1\/auth\//, /^\/api\/v1\/me(\/|$)/, /^\/api\/v1\/studio\/billing(\/|$)/, /^\/api\/v1\/push\//, /^\/api\/v1\/stripe\//, /^\/api\/v1\/admin\//];
export function lockedAllows(method: string, route: string | undefined) {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (!route || !route.startsWith("/api/v1/")) return true;
  return LOCKED_OK.some((r) => r.test(route));
}
