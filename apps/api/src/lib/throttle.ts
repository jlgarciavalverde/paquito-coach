/**
 * Freno por cuenta contra fuerza bruta (el límite por IP lo pone @fastify/rate-limit).
 * 5 fallos en 15 min bloquean ese correo 15 min. En memoria: hay un solo proceso; al reiniciar se olvida.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

const fails = new Map<string, number[]>();

export function isLocked(key: string, now = Date.now()) {
  const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  fails.set(key, list);
  return list.length >= MAX_FAILS;
}

/** Tope de correos vigilados a la vez: sin él, miles de correos inventados llenarían la memoria. */
const MAX_KEYS = 10_000;

export function recordFailure(key: string, now = Date.now()) {
  if (!fails.has(key) && fails.size >= MAX_KEYS) {
    for (const [k, list] of fails) if (!list.some((t) => now - t < WINDOW_MS)) fails.delete(k);
    if (fails.size >= MAX_KEYS) fails.delete(fails.keys().next().value!);
  }
  const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  fails.set(key, list);
}

export const clearFailures = (key: string) => fails.delete(key);
export const resetThrottle = () => fails.clear();
export const trackedKeys = () => fails.size;
