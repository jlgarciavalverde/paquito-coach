import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { clientsQuery } from "../../../lib/queries";

export const Route = createFileRoute("/coach/clientes/")({
  component: NoSelection,
});

/** Solo se ve en escritorio, a la derecha de la lista. */
function NoSelection() {
  const n = useQuery(clientsQuery()).data?.length ?? 0;
  return (
    <div className="flex min-h-[420px] flex-col justify-center rounded-[var(--radius-zone)] bg-tray px-10">
      <p className="font-wide text-[22px]">{n === 0 ? "Aquí verás la ficha de cada cliente" : "Elige un cliente de la lista"}</p>
      <p className="mt-2 max-w-[48ch] text-ink-2">
        La ficha reúne sus datos, sus lesiones, su plan de entrenamiento y de comidas, su agenda y vuestra conversación.
      </p>
    </div>
  );
}
