import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../components/ui/toast";
import { ConfirmProvider } from "../components/ui/confirm";

/** Monta un componente con los mismos proveedores que la app (sin router). */
export function renderWithProviders(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
  // Como `wrapper`: así `rerender` conserva los proveedores.
  return { qc, ...render(ui, { wrapper }) };
}

/** `fetch` falso: responde según la ruta; registra las llamadas. */
export function mockFetch(routes: Record<string, (init?: RequestInit) => { status?: number; body?: unknown; raw?: string } | Promise<never>>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response(JSON.stringify({ error: "not_found", message: "No encontrado" }), { status: 404 });
    const r = await routes[key]!(init);
    return new Response(r.raw ?? (r.body === undefined ? "" : JSON.stringify(r.body)), { status: r.status ?? 200 });
  };
  return { fn: fn as unknown as typeof fetch, calls };
}
