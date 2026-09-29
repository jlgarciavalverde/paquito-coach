import type { RoutineBlock, RoutineItem, WorkoutLog } from "@coach/shared";
import { fmtRest } from "../../lib/dates";
import { itemLabels } from "../../lib/training";
import { cn } from "../../lib/cn";

/** Prescripción de una línea, como se escribe en una hoja de entrenamiento: «3 × 5  80 kg  RIR 2  30X1  3:00». */
export function ItemSpec({ it, className }: { it: RoutineItem; className?: string }) {
  const extra: [string, string][] = [
    ["Carga", it.load],
    ["Esfuerzo", it.effort],
    ["Tempo", it.tempo],
    ["Descanso", fmtRest(it.restSec)],
  ].filter(([, v]) => v) as [string, string][];
  return (
    <span className={cn("flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm text-ink-2", className)}>
      <span className="font-narrow text-[17px] text-ink">
        {it.sets} × {it.reps || "—"}
      </span>
      {extra.map(([k, v]) => (
        <span key={k}>
          <span className="sr-only">{k}: </span>
          {k === "Descanso" ? `descanso ${v}` : k === "Tempo" ? `tempo ${v}` : v}
        </span>
      ))}
    </span>
  );
}

/** Rutina completa en lectura. Si hay registro del cliente, muestra lo hecho serie a serie junto a lo prescrito. */
export function PrescriptionList({ blocks, log }: { blocks: RoutineBlock[]; log?: WorkoutLog }) {
  const labels = itemLabels(blocks);
  if (blocks.every((b) => b.items.length === 0)) return <p className="text-sm text-ink-2">Este entreno no tiene ejercicios.</p>;
  return (
    <div className="flex flex-col gap-6">
      {blocks.map((b) =>
        b.items.length === 0 ? null : (
          <section key={b.id}>
            {b.name && <h3 className="mb-1 text-[13.5px] font-medium text-ink-2">{b.name}</h3>}
            <ol className="divide-y divide-rule border-y border-rule">
              {b.items.map((it) => {
                const sets = log?.[it.id] ?? [];
                return (
                  <li key={it.id} className="grid grid-cols-[36px_1fr] gap-x-2 py-3">
                    <span className="font-narrow pt-0.5 text-[15px] text-ink-3">{labels.get(it.id)}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{it.exerciseName}</p>
                      <ItemSpec it={it} className="mt-0.5" />
                      {it.notes && <p className="mt-1 text-[13.5px] text-ink-2">{it.notes}</p>}
                      {log && (
                        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Registro del cliente">
                          {sets.length === 0 ? (
                            <span className="text-[13px] text-ink-3">Sin registrar</span>
                          ) : (
                            sets.map((s, i) => (
                              <span
                                key={i}
                                className={cn("font-narrow rounded-[4px] px-2 py-0.5 text-[14px]", s.done ? "bg-plate-green-soft text-ink" : "bg-tray text-ink-3")}
                                title={`Serie ${i + 1}`}
                              >
                                {s.reps || "—"}×{s.load || "—"}
                                {s.rpe ? <span className="text-ink-2"> @{s.rpe}</span> : null}
                              </span>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ),
      )}
    </div>
  );
}
