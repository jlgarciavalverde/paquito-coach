import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "../../components/coming-soon";

export const Route = createFileRoute("/app/chat")({
  component: () => (
    <ComingSoon title="Chat con tu entrenador" phase="Fase 5">
      Escríbele directamente desde aquí, con fotos, sin necesidad de compartir tu número de teléfono.
    </ComingSoon>
  ),
});
