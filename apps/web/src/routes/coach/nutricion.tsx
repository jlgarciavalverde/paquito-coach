import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/ui/surface";
import { ComingSoon } from "../../components/coming-soon";

export const Route = createFileRoute("/coach/nutricion")({
  component: () => (
    <>
      <PageHeader title="Nutrición" />
      <ComingSoon title="Nutrición" phase="Fase 3">
        Planes semanales por días y comidas, con alimentos, cantidades y alternativas. Objetivos de kcal y macros opcionales, duplicar días y plantillas.
      </ComingSoon>
    </>
  ),
});
