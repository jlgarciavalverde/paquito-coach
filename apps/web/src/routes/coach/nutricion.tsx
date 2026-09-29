import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "../../components/ui/layout";
import { ComingSoon } from "../../components/coming-soon";

export const Route = createFileRoute("/coach/nutricion")({
  component: () => (
    <>
      <PageTitle title="Nutrición" />
      <ComingSoon title="Qué hará esta sección" phase={3}>
        Planes semanales por días y comidas, con alimentos, cantidades y alternativas. Objetivos de kcal y macros opcionales, duplicar días y plantillas.
      </ComingSoon>
    </>
  ),
});
