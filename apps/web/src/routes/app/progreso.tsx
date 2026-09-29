import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "../../components/ui/layout";
import { ClientProgress } from "../../components/progress/client-progress";

export const Route = createFileRoute("/app/progreso")({
  component: () => (
    <>
      <PageTitle title="Progreso" lead="Tu peso, tus medidas y cómo suben tus cargas en cada ejercicio." />
      <ClientProgress who="me" />
    </>
  ),
});
