import { useQuery } from "@tanstack/react-query";
import { statusQuery } from "../lib/status";

/** Banda fija de la demo pública: que nadie la confunda con la app de verdad. */
export function DemoBanner() {
  const q = useQuery(statusQuery);
  if (!q.data?.demo) return null;
  return (
    <div role="note" className="flex items-center justify-center gap-2 bg-plate-yellow px-4 py-1.5 text-center text-[13px] font-medium text-ink">
      Esto es una demostración con datos inventados. Lo que cambies se borra cada noche.
    </div>
  );
}
