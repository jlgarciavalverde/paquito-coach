// Service worker: avisos push y app sin cobertura (en el gimnasio no siempre hay).
// En cada build, `vite.config.ts` rellena BUILD y PRECACHE: el archivo cambia, el navegador ve la versión nueva y la
// app ofrece «Actualizar». En desarrollo van vacíos (solo push y la caché de lo visitado).
const BUILD = "dev";
const PRECACHE = [];
const SHELL = `shell-${BUILD}`;
const API = "api-v1";
// Lecturas de la API que sirven sin red: la cuenta, los entrenos, los ejercicios y la marca. Nunca fotos ni archivos.
const API_OFFLINE = /^\/api\/v1\/(me(\/(workouts|last-sets|plan|meal-checks|appointments|packs|checkins))?|workouts\/[\w-]+|exercises\/[\w-]+|auth\/setup-status)(\?|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/index.html", ...PRECACHE]))
      .catch(() => {}),
  );
  // La primera instalación se activa ya; una actualización espera a que la app diga «Actualizar» (mensaje "skip").
  if (!self.registration.active) self.skipWaiting();
});
self.addEventListener("message", (e) => e.data?.type === "skip" && self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Red primero (con 5 s de margen si hay copia); si no hay red, la copia guardada. */
async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(fallbackUrl ?? req);
  const net = fetch(req).then((res) => {
    if (res.ok && res.status === 200) cache.put(fallbackUrl ?? req, res.clone());
    return res;
  });
  if (!cached) return net;
  const slow = new Promise((resolve) => setTimeout(() => resolve(cached), 5000));
  return Promise.race([net.catch(() => cached), slow]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/assets/")) {
    // Con hash en el nombre: nunca cambian.
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/index.html", { ignoreSearch: true })));
    return;
  }
  if (API_OFFLINE.test(url.pathname + url.search)) event.respondWith(networkFirst(req, API));
});

self.addEventListener("push", (event) => {
  let data = { title: "Tu entrenador", body: "Tienes una novedad", url: "/", tag: undefined };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
