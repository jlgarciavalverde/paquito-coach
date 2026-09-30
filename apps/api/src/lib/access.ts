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
  "POST /api/v1/stripe/webhook", // autenticado por la firma de Stripe
  "POST /api/v1/stripe/simulate", // solo existe con la pasarela simulada (e2e)
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

export function gate(method: string, route: string | undefined, user: { role: "coach" | "client" } | null): Gate {
  if (!route || !route.startsWith("/api/v1/")) return "ok"; // estáticos, /health, /ws y 404
  const k = `${method} ${route}`;
  if (PUBLIC_ROUTES.has(k)) return "public";
  if (!user) return "login";
  if (user.role === "coach") return "ok";
  if (route === "/api/v1/me" || route.startsWith("/api/v1/me/") || CLIENT_ROUTES.has(k)) return "ok";
  return "coach-only";
}
