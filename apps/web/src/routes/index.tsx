import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { PublicHome } from "../components/public-home";
import { homeFor, meQuery } from "../lib/auth";
import { publicStudioQuery } from "../lib/public";
import { statusQuery } from "../lib/status";

/**
 * `/`: con sesión, a su panel; sin sesión, la página pública del estudio si está publicada; si no, a entrar.
 * `?vista=publica`: el entrenador ve su página tal cual la ven los demás.
 */
export const Route = createFileRoute("/")({
  validateSearch: z.object({ vista: z.literal("publica").optional() }),
  beforeLoad: async ({ context, search }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me && !search.vista) throw redirect({ to: homeFor(me) });
    const s = await context.queryClient.ensureQueryData(statusQuery);
    if (s.needsSetup) throw redirect({ to: "/instalar" });
    const page = s.published ? await context.queryClient.ensureQueryData(publicStudioQuery) : null;
    if (!page) throw redirect({ to: me ? homeFor(me) : "/acceso" });
    return { page };
  },
  component: Home,
});

function Home() {
  const { page } = Route.useRouteContext();
  return <PublicHome s={page} />;
}
