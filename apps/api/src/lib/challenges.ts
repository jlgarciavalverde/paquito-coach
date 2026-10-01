import { newToken } from "./tokens";

/**
 * Retos de la verificación en dos pasos: tras la contraseña correcta, un token de 5 minutos y 5 intentos con el que se
 * completa la entrada. En memoria (como los frenos de `throttle.ts`), con tope de tamaño: si se reinicia el servidor,
 * basta con volver a escribir la contraseña.
 */
const TTL = 5 * 60_000;
const MAX = 10_000;
const store = new Map<string, { userId: string; expires: number; attempts: number }>();

export function newChallenge(userId: string, now = Date.now()) {
  if (store.size >= MAX) for (const [k, v] of store) if (v.expires < now || store.size >= MAX) store.delete(k);
  const token = newToken();
  store.set(token, { userId, expires: now + TTL, attempts: 0 });
  return token;
}

/** El usuario del reto si sigue vivo; cada consulta cuenta como intento (al 5.º se anula). */
export function useChallengeAttempt(token: string, now = Date.now()): string | null {
  const c = store.get(token);
  if (!c || c.expires < now) {
    store.delete(token);
    return null;
  }
  if (++c.attempts > 5) {
    store.delete(token);
    return null;
  }
  return c.userId;
}
export const endChallenge = (token: string) => void store.delete(token);
export const resetChallenges = () => store.clear();
