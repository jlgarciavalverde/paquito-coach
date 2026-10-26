import { StrictMode } from "react";
import { MotionConfig } from "motion/react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { ToastProvider } from "./components/ui/toast";
import { ConfirmProvider } from "./components/ui/confirm";
import { RequestError, onApiError } from "./lib/api";
import { meQuery } from "./lib/auth";
import { applyStoredTheme } from "./lib/theme";
import { registerServiceWorker } from "./lib/push";
import "./styles.css";

applyStoredTheme();
registerServiceWorker();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Se reintenta lo que puede ser pasajero (red, 5xx, 408); nunca un 4xx de verdad.
      retry: (n, e) => !(e instanceof RequestError && e.status >= 400 && e.status < 500 && e.status !== 408) && n < 2,
      refetchOnWindowFocus: true,
    },
    // Sin red, una acción falla al momento con un mensaje claro en vez de quedarse «cargando» y enviarse sola más tarde.
    mutations: { networkMode: "always" },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  // Paso de una pantalla a otra con un fundido corto del navegador (View Transitions); sin soporte o con movimiento
  // reducido, cambio directo (ver `::view-transition` en styles.css). Solo al cambiar de pantalla: ni al cargar o recargar
  // (la pantalla quedaría un instante con el estado viejo y un toque se perdería) ni al cambiar filtros de la dirección.
  defaultViewTransition: { types: ({ fromLocation, pathChanged }) => (fromLocation && pathChanged ? ["pantalla"] : false) },
});

// Sesión caducada o cerrada desde otro dispositivo en mitad del uso: fuera la caché y a la pantalla de entrar.
const PUBLIC_PATHS = ["/aviso-legal", "/terminos", "/acceso", "/registro", "/restablecer", "/instalar", "/privacidad", "/confirmar-correo", "/baja", "/alta", "/e/", "/condiciones"];
onApiError((e) => {
  if (e.status !== 401 || !queryClient.getQueryData(meQuery.queryKey)) return;
  if (PUBLIC_PATHS.some((p) => window.location.pathname.startsWith(p))) return;
  queryClient.clear();
  // Recarga completa (no navegación del router): corta cualquier navegación en curso y no deja datos en memoria.
  window.location.assign("/acceso?caducada=true");
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Con «reducir movimiento» del sistema, Motion quita desplazamientos y escalas y deja solo opacidad. */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
