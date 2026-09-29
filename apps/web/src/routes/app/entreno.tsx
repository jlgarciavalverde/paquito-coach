import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "../../components/coming-soon";

export const Route = createFileRoute("/app/entreno")({
  component: () => (
    <ComingSoon title="Tus entrenos" phase="Fase 2">
      Verás tu rutina de cada día con vídeos de los ejercicios y podrás apuntar cada serie (peso, repeticiones y esfuerzo). Tu entrenador lo verá al momento.
    </ComingSoon>
  ),
});
