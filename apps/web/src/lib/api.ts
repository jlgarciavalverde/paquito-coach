import type { ApiError } from "@coach/shared";

/** Error de la API con el mensaje para personas ya en español. */
export class RequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Mensaje cuando la respuesta no trae uno propio (p. ej. una página de error de un proxy). */
export function fallbackMessage(status: number): string {
  if (status === 401) return "Tu sesión ha caducado. Vuelve a entrar.";
  if (status === 403) return "No tienes permiso para hacer esto.";
  if (status === 404) return "No se ha encontrado. Puede que se haya borrado.";
  if (status === 408 || status === 504) return "El servidor ha tardado demasiado. Inténtalo de nuevo.";
  if (status === 413) return "Es demasiado grande para enviarlo.";
  if (status === 429) return "Demasiados intentos seguidos. Espera un momento.";
  if (status === 502 || status === 503) return "El servidor no está disponible ahora mismo. Inténtalo en unos minutos.";
  return "Algo ha fallado. Inténtalo de nuevo.";
}

const TIMEOUT_MS = 30_000;
type Listener = (e: RequestError) => void;
const listeners = new Set<Listener>();
/** Para reaccionar en un solo sitio a errores globales (p. ej. sesión caducada → volver a entrar). */
export const onApiError = (fn: Listener) => (listeners.add(fn), () => void listeners.delete(fn));

/**
 * Llamada a la API (mismo origen; la sesión viaja en una cookie HttpOnly, nunca en JS).
 * Lanza `RequestError` con el mensaje de la API si la respuesta no es 2xx; con un mensaje propio si no hay conexión,
 * si tarda más de 30 s o si lo que llega no es JSON (páginas de error de proxies).
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  let res: Response;
  const timeout = AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS);
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    });
  } catch (e) {
    if (init.signal?.aborted) throw e; // cancelado a propósito (p. ej. al salir de la pantalla)
    if (timeout.aborted) throw new RequestError(408, "timeout", fallbackMessage(408));
    throw new RequestError(0, "network", "No hay conexión con el servidor. Revisa tu internet.");
  }
  const text = await res.text().catch(() => "");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
    if (res.ok) throw new RequestError(res.status, "bad_response", "El servidor ha respondido algo inesperado. Recarga la página.");
  }
  if (!res.ok) {
    const e = (data && typeof data === "object" ? data : {}) as Partial<ApiError>;
    const err = new RequestError(res.status, e.error ?? "http", typeof e.message === "string" && e.message ? e.message : fallbackMessage(res.status));
    for (const l of listeners) l(err);
    throw err;
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : "Algo ha fallado. Inténtalo de nuevo.");
