import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "../../components/coming-soon";

export const Route = createFileRoute("/app/agenda")({
  component: () => (
    <ComingSoon title="Tu agenda" phase={4}>
      Tus sesiones presenciales y tus entrenos en una vista de semana.
    </ComingSoon>
  ),
});
