import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Brand } from "../components/brand";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
  notFoundComponent: NotFound,
  errorComponent: ({ error, reset }) => (
    <CenteredMessage title="Algo no ha ido bien" text={error instanceof Error && error.message ? error.message : "Error inesperado."} action={<Button onClick={reset}>Reintentar</Button>} />
  ),
});

function NotFound() {
  return (
    <CenteredMessage
      title="Página no encontrada"
      text="El enlace no existe o ya no está disponible."
      action={
        <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
          Volver al inicio
        </Link>
      }
    />
  );
}

export function CenteredMessage({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 sm:px-16">
      <Brand className="mb-12" />
      <h1 className="font-wide text-[30px] leading-tight">{title}</h1>
      <p className="mt-2 max-w-md text-ink-2">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </main>
  );
}
