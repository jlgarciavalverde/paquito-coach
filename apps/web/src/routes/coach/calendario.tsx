import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "../../components/ui/layout";
import { ComingSoon } from "../../components/coming-soon";

export const Route = createFileRoute("/coach/calendario")({
  component: () => (
    <>
      <PageTitle title="Agenda" />
      <ComingSoon title="Qué hará esta sección" phase={4}>
        Citas presenciales, entrenos asignados y comidas de todos tus clientes en una vista de semana o de mes, con capas que puedes ocultar y arrastrar para cambiar de día.
      </ComingSoon>
    </>
  ),
});
