import { api } from "./api";

export type PushState = "unsupported" | "denied" | "off" | "on" | "unconfigured";

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Registra el service worker de avisos (no hace nada si el navegador no lo admite). */
export function registerServiceWorker() {
  if (!supported()) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const { key } = await api<{ key: string | null }>("/push/key");
  if (!key) return "unconfigured";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

export async function enablePush(): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const { key } = await api<{ key: string | null }>("/push/key");
  if (!key) return "unconfigured";
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api("/push/subscriptions", { body: { endpoint: json.endpoint, keys: json.keys } });
  return "on";
}

export async function disablePush(): Promise<PushState> {
  if (!supported()) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api("/push/subscriptions", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}

/**
 * Al cerrar sesión o borrar la cuenta: este dispositivo deja de recibir avisos de esa persona (en un móvil compartido, el
 * siguiente que entre no vería los mensajes del anterior). `server: false` si la sesión ya no existe (cuenta borrada: el
 * servidor ya borró sus suscripciones). Nunca falla.
 */
export async function forgetDevice({ server = true } = {}) {
  try {
    if (!supported()) return;
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (!sub) return;
    if (server) await api("/push/subscriptions", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  } catch {
    // sin service worker o sin permiso: no hay nada que olvidar
  }
}
