import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { CoachShell } from "../components/coach-shell";
import { meQuery } from "../lib/auth";

export const Route = createFileRoute("/coach")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: "/acceso" });
    if (me.role !== "coach") throw redirect({ to: "/app" });
  },
  component: () => (
    <CoachShell>
      <Outlet />
    </CoachShell>
  ),
});
