import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "../../components/coming-soon";

export const Route = createFileRoute("/app/comidas")({
  component: () => (
    <ComingSoon title="Tu plan de comidas" phase="Fase 3">
      Tu plan semanal por días y comidas, con alternativas. Marca lo que vas cumpliendo.
    </ComingSoon>
  ),
});
