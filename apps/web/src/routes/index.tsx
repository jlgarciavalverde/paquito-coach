import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { PlatformHome } from "../components/platform/platform-home";
import { PublicHome } from "../components/public-home";
import { homeFor, meQuery } from "../lib/auth";
import { platformQuery, publicStudioQuery } from "../lib/public";
import { statusQuery } from "../lib/status";

/**
 * `/`: con sesión, a su panel. Sin sesión: en el dominio propio de un estudio, su página pública (si la ha publicado);
 * en el de la plataforma, la web para entrenadores (si el alta está abierta). Si no, a entrar.
 * `?vista=publica`: el entrenador ve su página tal cual la ven los demás.
 */
export const Route = createFileRoute("/")({
  validateSearch: z.object({ vista: z.literal("publica").optional() }),
  beforeLoad: async ({ context, search }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me && !search.vista) throw redirect({ to: homeFor(me) });
    if (me && search.vista && me.studio.slug) throw redirect({ to: "/e/$slug", params: { slug: me.studio.slug } });
    const s = await context.queryClient.ensureQueryData(statusQuery);
    if (s.needsSetup) throw redirect({ to: "/instalar" });
    if (!s.slug) {
      if (!s.signupOpen) throw redirect({ to: "/acceso" });
      return { page: null, platform: await context.queryClient.ensureQueryData(platformQuery) };
    }
    const page = s.published ? await context.queryClient.ensureQueryData(publicStudioQuery()) : null;
    if (!page) throw redirect({ to: me ? homeFor(me) : "/acceso" });
    return { page, platform: null };
  },
  component: Home,
});

function Home() {
  const { page, platform } = Route.useRouteContext();
  return page ? <PublicHome s={page} /> : <PlatformHome p={platform!} />;
}
