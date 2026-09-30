import type { AppConfig } from "../config";

/** IP del cliente: la de Cloudflare solo detrás del túnel; si no, la del socket (sin fiarse de X-Forwarded-For). */
export function clientIp(cfg: Pick<AppConfig, "trustCloudflare">, req: { headers: Record<string, unknown>; ip: string }) {
  const cf = req.headers["cf-connecting-ip"];
  if (cfg.trustCloudflare && typeof cf === "string" && cf.length < 64) return cf;
  try {
    return req.ip;
  } catch {
    return "sin-ip"; // peticiones inyectadas sin socket (tests de WebSocket)
  }
}
