import { z } from "zod";
import type { RoutineBlock } from "./training";

/** Subir la carga cada semana al asignar: +N kg o +N % en los ejercicios con la carga en kilos. */
export const Progression = z.object({
  kind: z.enum(["kg", "pct"]),
  step: z.number().min(0.5).max(20),
});
export type Progression = z.infer<typeof Progression>;

const KG = /^(\d+(?:[.,]\d+)?)(\s*kg)?$/i;

/** Carga de la semana `week` (0 = la primera). Si la carga no es un número de kilos («70 % 1RM», «banda roja»), no se toca. */
export function progressLoad(load: string, week: number, p: Progression): string {
  const m = load.trim().match(KG);
  if (!m || week <= 0) return load;
  const base = Number(m[1]!.replace(",", "."));
  if (base <= 0) return load;
  const raw = p.kind === "kg" ? base + p.step * week : base * (1 + p.step / 100) ** week;
  const v = Math.round(raw * 2 - 1e-9) / 2; // a medio kilo (en empate, hacia abajo): es lo que se puede cargar
  const text = String(v).replace(".", m[1]!.includes(",") || !m[1]!.includes(".") ? "," : ".");
  return m[2] ? `${text} kg` : text;
}

/** Semana (0, 1, 2…) de `date` contando desde `start`, ambas YYYY-MM-DD. */
export function weekIndex(start: string, date: string): number {
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.max(0, Math.floor((d(date) - d(start)) / (7 * 86_400_000)));
}

export function applyProgression(blocks: RoutineBlock[], week: number, p: Progression | null | undefined): RoutineBlock[] {
  if (!p || week <= 0) return blocks;
  return blocks.map((b) => ({ ...b, items: b.items.map((it) => ({ ...it, load: progressLoad(it.load, week, p) })) }));
}
