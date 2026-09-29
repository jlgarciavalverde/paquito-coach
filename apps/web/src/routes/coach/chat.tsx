import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/ui/surface";
import { ComingSoon } from "../../components/coming-soon";

export const Route = createFileRoute("/coach/chat")({
  component: () => (
    <>
      <PageHeader title="Mensajes" />
      <ComingSoon title="Mensajes" phase="Fase 5">
        Una conversación privada con cada cliente, en tiempo real, con fotos y avisos. Sin compartir tu número de teléfono.
      </ComingSoon>
    </>
  ),
});
