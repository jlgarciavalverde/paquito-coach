import type { RoutineBlock, RoutineItem, WorkoutLog } from "@coach/shared";
import { fmtRest } from "../../lib/dates";
import { itemLabels } from "../../lib/training";
import { cn } from "../../lib/cn";
import { PlateMark } from "../ui/layout";

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

const kgOf = (t: string) => {
  const m = t.trim().replace(",", ".").match(/^(\d+(?:\.\d+)?)\s*(kg)?$/i);
  return m ? Number(m[1]) : null;
};
/** Diferencia entre lo hecho y lo prescrito, en palabras: «+2,5 kg sobre lo previsto», «1 serie menos». */
export function logDiff(it: RoutineItem, sets: { reps: string; load: string; done: boolean }[]) {
  const done = sets.filter((s) => s.done);
  if (done.length === 0) return null;
  const out: { text: string; tone: "up" | "down" }[] = [];
  const missing = it.sets - done.length;
  if (missing > 0) out.push({ text: missing === 1 ? "1 serie menos" : `${missing} series menos`, tone: "down" });
  const plan = kgOf(it.load);
  const best = Math.max(...done.map((s) => kgOf(s.load) ?? -1));
  if (plan != null && best >= 0 && best !== plan) {
    const d = Math.round((best - plan) * 10) / 10;
    out.push({ text: `${d > 0 ? "+" : "−"}${String(Math.abs(d)).replace(".", ",")} kg ${d > 0 ? "sobre" : "bajo"} lo previsto`, tone: d > 0 ? "up" : "down" });
  }
  return out;
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
                      {log && (logDiff(it, sets) ?? []).length > 0 && (
                        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                          {logDiff(it, sets)!.map((d) => (
                            <PlateMark key={d.text} tone={d.tone === "up" ? "green" : "yellow"} className="text-[13px]">
                              {d.text}
                            </PlateMark>
                          ))}
                        </p>
                      )}
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
