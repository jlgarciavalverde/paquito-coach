// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetDevice } from "./push";

function fakeDevice(subscribed: boolean) {
  const unsubscribe = vi.fn(async () => true);
  const sub = subscribed ? { endpoint: "https://fcm.googleapis.com/fcm/send/abc", unsubscribe } : null;
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) },
  });
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", { permission: "granted" });
  const calls: { url: string; method: string; body: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), body: String(init.body) });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  });
  return { unsubscribe, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("forgetDevice (cerrar sesión o borrar la cuenta)", () => {
  it("borra la suscripción en el servidor y en el navegador", async () => {
    const { unsubscribe, calls } = fakeDevice(true);
    await forgetDevice();
    expect(calls).toEqual([{ url: "/api/v1/push/subscriptions", method: "DELETE", body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/abc" }) }]);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("con la cuenta ya borrada, solo en el navegador", async () => {
    const { unsubscribe, calls } = fakeDevice(true);
    await forgetDevice({ server: false });
    expect(calls).toEqual([]);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("sin avisos activados o sin soporte, no hace nada y no falla", async () => {
    const { calls } = fakeDevice(false);
    await forgetDevice();
    expect(calls).toEqual([]);
    Reflect.deleteProperty(navigator, "serviceWorker");
    await expect(forgetDevice()).resolves.toBeUndefined();
  });
});
