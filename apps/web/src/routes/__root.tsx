import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/button";

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
        <Link to="/" className="font-medium text-accent underline-offset-4 hover:underline">
          Volver al inicio
        </Link>
      }
    />
  );
}

export function CenteredMessage({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <main className="paper-grain flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-[44px] leading-tight">{title}</h1>
      <p className="mt-2 max-w-md text-ink-2">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </main>
  );
}
