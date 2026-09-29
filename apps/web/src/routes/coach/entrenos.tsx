import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/ui/surface";
import { ComingSoon } from "../../components/coming-soon";

export const Route = createFileRoute("/coach/entrenos")({
  component: () => (
    <>
      <PageHeader title="Entrenamientos" />
      <ComingSoon title="Entrenamientos" phase="Fase 2">
        Biblioteca de ejercicios con vídeo y un editor de rutinas por bloques (series, reps, carga, %RM, RIR/RPE, tempo, descanso, superseries). Guarda plantillas y asígnalas a uno o varios clientes.
      </ComingSoon>
    </>
  ),
});
