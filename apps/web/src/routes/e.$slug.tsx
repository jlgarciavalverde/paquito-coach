import { createFileRoute, notFound } from "@tanstack/react-router";
import { PublicHome } from "../components/public-home";
import { publicStudioQuery } from "../lib/public";

/** Página pública de un estudio en la dirección de la plataforma: `/e/<slug>`. */
export const Route = createFileRoute("/e/$slug")({
  loader: async ({ context, params }) => {
    const page = await context.queryClient.ensureQueryData(publicStudioQuery(params.slug));
    if (!page) throw notFound();
    return { page };
  },
  component: StudioPage,
});

function StudioPage() {
  const { page } = Route.useLoaderData();
  const { slug } = Route.useParams();
  return <PublicHome s={page} slug={slug} />;
}
