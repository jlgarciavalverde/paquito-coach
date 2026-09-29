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

/**
 * Llamada a la API (mismo origen; la sesión viaja en una cookie HttpOnly, nunca en JS).
 * Lanza `RequestError` con el mensaje de la API si la respuesta no es 2xx.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch {
    throw new RequestError(0, "network", "No hay conexión con el servidor. Revisa tu internet.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const e = (data ?? {}) as Partial<ApiError>;
    throw new RequestError(res.status, e.error ?? "http", e.message ?? "Algo ha fallado. Inténtalo de nuevo.");
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Algo ha fallado. Inténtalo de nuevo.");
