import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ClientShell } from "../components/client-shell";
import { Brand } from "../components/brand";
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
      <main className="flex min-h-dvh flex-col px-6 py-8">
        <Brand />
        <div className="my-auto max-w-[440px] py-16">
          <p className="border-l-[5px] border-plate-red pl-4 font-medium text-ink">Solicitud enviada</p>
          <h1 className="font-wide mt-4 text-[28px] leading-tight">Falta que {me.studio.name} te acepte</h1>
          <p className="mt-3 text-ink-2">
            {firstName(me.name)}, tu cuenta ya está creada. En cuanto acepte tu solicitud, verás aquí tus entrenos y tu plan. No hace falta que hagas nada más.
          </p>
          <Button variant="quiet" className="mt-8 -ml-3" onClick={logout}>
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
