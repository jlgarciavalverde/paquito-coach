import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "../../components/ui/layout";
import { ComingSoon } from "../../components/coming-soon";

export const Route = createFileRoute("/coach/chat")({
  component: () => (
    <>
      <PageTitle title="Mensajes" />
      <ComingSoon title="Qué hará esta sección" phase={5}>
        Una conversación privada con cada cliente, en tiempo real, con fotos y avisos, sin compartir tu número de teléfono.
      </ComingSoon>
    </>
  ),
});
