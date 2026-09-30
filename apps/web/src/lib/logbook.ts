import type { LastSets, RoutineItem, SetLog } from "@coach/shared";

export type Suggestion = { reps: string; load: string };

export const fmtKg = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const num = (t: string) => Number(t.trim().replace(",", "."));
/** Carga prescrita como número de kg («80 kg» → «80»); texto como «70 % 1RM» no sirve de sugerencia. */
export const prescribedKg = (load: string) => load.trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg)?$/i)?.[1] ?? "";

/**
 * Qué proponer en una serie vacía: lo de la serie anterior de hoy (si ya está hecha), si no lo de la misma serie
 * la última vez (o su última serie), y si no, lo prescrito. Marcar la serie sin escribir nada la da por hecha con esto.
 */
export function suggestSet(it: RoutineItem, idx: number, today: SetLog[] | undefined, last: LastSets): Suggestion {
  const prev = idx > 0 ? today?.[idx - 1] : undefined;
  if (prev?.done && (prev.reps || prev.load)) return { reps: prev.reps, load: prev.load };
  const l = last[it.exerciseId]?.sets;
  const ls = l?.[idx] ?? l?.at(-1);
  if (ls) return { reps: ls.reps, load: ls.load };
  return { reps: it.reps.match(/^\d+/)?.[0] ?? "", load: prescribedKg(it.load) };
}

/** Sube o baja reps o kg a partir de lo escrito (o de lo sugerido); nunca por debajo de 0. Texto no numérico: sin cambio. */
export function bumpValue(current: string, field: "reps" | "load", delta: number): string | null {
  const n = current.trim() === "" ? 0 : num(current);
  if (!Number.isFinite(n)) return null;
  const v = Math.max(0, n + delta);
  return field === "load" ? fmtKg(v) : String(Math.round(v));
}
