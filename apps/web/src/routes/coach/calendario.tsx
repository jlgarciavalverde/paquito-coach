import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/ui/surface";
import { ComingSoon } from "../../components/coming-soon";

export const Route = createFileRoute("/coach/calendario")({
  component: () => (
    <>
      <PageHeader title="Calendario" />
      <ComingSoon title="Calendario" phase="Fase 4">
        Citas presenciales, entrenos asignados y comidas de todos tus clientes en una vista semanal o mensual, con capas que activas y desactivas y arrastrar para reprogramar.
      </ComingSoon>
    </>
  ),
});
