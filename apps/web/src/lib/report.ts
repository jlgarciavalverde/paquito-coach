import { RequestError, onApiError } from "./api";

declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

/**
 * Informe de errores del navegador al registro propio de la app (Q1, Admin → Errores). Sin servicios externos: la app
 * trata datos de salud. El servidor oculta correos y números; aquí además se manda la ruta sin consulta (puede llevar
 * tokens). Como mucho 10 informes por carga de página y nunca el mismo dos veces seguidas.
 */
const sent = new Set<string>();
let budget = 10;

export function reportError(err: unknown, kind: "error" | "rejection" | "api" | "render" = "error") {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Error sin mensaje");
    const key = `${kind}|${e.message}`;
    if (sent.has(key) || budget <= 0) return;
    sent.add(key);
    budget--;
    const body = JSON.stringify({
      message: `${e.name}: ${e.message}`.slice(0, 500),
      stack: (e.stack ?? "").slice(0, 4000),
      path: window.location.pathname.slice(0, 200),
      version: VERSION,
      requestId: e instanceof RequestError ? e.requestId : undefined,
      kind,
    });
    // `keepalive`: llega aunque la pestaña se cierre justo después (p. ej. un fallo al salir).
    void fetch("/api/v1/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => {});
  } catch {
    // Informar de un error nunca puede romper la app.
  }
}

/** Se engancha una vez al arrancar: errores sin capturar, promesas rechazadas y fallos 5xx de la API. */
export function installErrorReporting() {
  window.addEventListener("error", (ev) => {
    // Recursos que no cargan (imágenes, scripts de extensiones) no son errores de la app.
    if (!ev.error && !ev.message) return;
    if (ev.filename && !ev.filename.startsWith(window.location.origin)) return;
    reportError(ev.error ?? new Error(ev.message), "error");
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason;
    // Los 4xx y la falta de red son situaciones normales (se muestran a la persona), no fallos de la app.
    if (r instanceof RequestError && (r.status < 500 || r.status === 0)) return;
    if (r instanceof DOMException && r.name === "AbortError") return;
    reportError(r, "rejection");
  });
  onApiError((e) => {
    if (e.status >= 500) reportError(e, "api");
  });
}
