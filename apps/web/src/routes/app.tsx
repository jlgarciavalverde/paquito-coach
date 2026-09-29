import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { HourglassMedium } from "@phosphor-icons/react";
import { ClientShell } from "../components/client-shell";
import { Brand } from "../components/auth-layout";
import { Button } from "../components/ui/button";
import { meQuery, useLogout, useMe } from "../lib/auth";
import { firstName } from "../lib/format";

export const Route = createFileRoute("/app")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: "/acceso" });
    if (me.role === "coach") throw redirect({ to: "/coach" });
  },
  component: ClientLayout,
});

function ClientLayout() {
  const me = useMe()!;
  const logout = useLogout();
  if (me.clientStatus === "pending") {
    return (
      <main className="paper-grain flex min-h-dvh flex-col px-6 py-8">
        <Brand />
        <div className="m-auto flex max-w-md flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-clay-soft text-clay">
            <HourglassMedium size={30} />
          </span>
          <h1 className="mt-6 font-display text-[40px] leading-tight">Solicitud enviada</h1>
          <p className="mt-2 text-ink-2">
            {firstName(me.name)}, tu cuenta está creada. En cuanto {me.studio.name} acepte tu solicitud, verás aquí tus entrenos y tu plan.
          </p>
          <Button variant="ghost" className="mt-8" onClick={logout}>
            Cerrar sesión
          </Button>
        </div>
      </main>
    );
  }
  return (
    <ClientShell>
      <Outlet />
    </ClientShell>
  );
}
