import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { EQUIPMENT_LABEL, MUSCLE_LABEL, MUSCLES, type Exercise, type Muscle } from "@coach/shared";
import { SidePanel } from "../ui/dialog";
import { controlClass } from "../ui/field";
import { Skeleton } from "../ui/spinner";
import { exercisesQuery } from "../../lib/training";
import { cn } from "../../lib/cn";
import { QueryError } from "../ui/query-state";

/** Buscador de la biblioteca para añadir un ejercicio a una rutina. Se puede elegir varios seguidos. */
export function ExercisePicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (e: Exercise) => void }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<Muscle | "">("");
  const [added, setAdded] = useState<string[]>([]);
  const dq = useDeferredValue(q);
  const list = useQuery({ ...exercisesQuery({ q: dq, muscle, limit: 60 }), enabled: open });
  return (
    <SidePanel
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setAdded([]);
      }}
      title="Añadir ejercicio"
      description={added.length ? `${added.length} añadido${added.length > 1 ? "s" : ""}. Sigue eligiendo o cierra.` : "Busca en tu biblioteca y en la común (más de 2.500 ejercicios)."}
    >
      <div className="sticky -top-5 z-10 -mx-6 -mt-5 flex flex-col gap-2 bg-paper px-6 pt-5 pb-3">
        <label className="relative">
          <span className="sr-only">Buscar ejercicio</span>
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sentadilla búlgara, hip thrust…" className={cn(controlClass, "h-10 pl-9")} />
        </label>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por músculo">
          {(["", ...MUSCLES.filter((m) => m !== "other" && m !== "neck")] as (Muscle | "")[]).map((m) => (
            <button
              key={m || "all"}
              type="button"
              aria-pressed={muscle === m}
              onClick={() => setMuscle(m)}
              className={cn("h-7 shrink-0 rounded-[4px] px-2 text-[13px]", muscle === m ? "bg-ink text-paper" : "bg-tray text-ink-2 hover:bg-tray-2")}
            >
              {m ? MUSCLE_LABEL[m] : "Todos"}
            </button>
          ))}
        </div>
      </div>
      {list.isPending ? (
        <div className="flex flex-col gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : list.isError ? (
        <QueryError q={list} />
      ) : (list.data ?? []).length === 0 ? (
        <p className="py-6 text-sm text-ink-2">Nada con ese nombre. Puedes crearlo como ejercicio propio en Entrenos → Ejercicios.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {list.data!.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(e);
                  setAdded((a) => [...a, e.id]);
                }}
                className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-tray"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium text-ink">{e.name}</span>
                  <span className="block text-[13px] text-ink-2">
                    {MUSCLE_LABEL[e.muscle]}, {EQUIPMENT_LABEL[e.equipment].toLowerCase()}
                    {e.own && <span className="text-primary"> — propio</span>}
                  </span>
                </span>
                <span className={cn("font-narrow shrink-0 pr-1 text-[13px]", added.includes(e.id) ? "text-plate-green" : "text-primary")}>
                  {added.includes(e.id) ? `Añadido${added.filter((x) => x === e.id).length > 1 ? ` ×${added.filter((x) => x === e.id).length}` : ""}` : "Añadir"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SidePanel>
  );
}
