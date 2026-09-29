import type { ProgressExercise, ProgressPoint, RoutineBlock, WorkoutLog } from "@coach/shared";

/**
 * Carga en kg a partir del texto que anota el cliente o prescribe el entrenador: «82,5», «80 kg», «2×12 kg» (dos
 * mancuernas de 12 → 24), «70% 1RM» no es una carga (null). Devuelve null si no hay un número de kilos claro.
 */
export function parseLoadKg(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(",", ".").trim();
  if (/%|rpe|rir|pc|peso corporal|bw/.test(t)) return null;
  const pair = t.match(/^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg)?$/);
  if (pair) return Number(pair[1]) * Number(pair[2]);
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(kg|kgs|kilos)?$/);
  if (!m) return null;
  const v = Number(m[1]);
  return v > 0 && v < 1000 ? v : null;
}

export const parseReps = (text: string | null | undefined): number | null => {
  const m = text?.trim().match(/^(\d{1,3})$/);
  return m ? Number(m[1]) : null;
};

/** 1RM estimado (Epley). Solo fiable hasta ~12 repeticiones; por encima se devuelve null. */
export const epley = (kg: number, reps: number) => (reps >= 1 && reps <= 12 ? Math.round(kg * (1 + reps / 30) * 10) / 10 : null);

type W = { id: string; date: string; blocks: RoutineBlock[]; log: WorkoutLog };

/** Serie temporal por ejercicio a partir de los entrenos registrados (mejor serie hecha de cada sesión). */
export function progressFromWorkouts(workouts: W[]) {
  const byExercise = new Map<string, { name: string; points: ProgressPoint[] }>();
  for (const w of [...workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    // Un mismo ejercicio puede aparecer dos veces en un entreno: se juntan sus series.
    const perEx = new Map<string, { name: string; sets: { kg: number; reps: number }[] }>();
    for (const b of w.blocks)
      for (const it of b.items) {
        const done = (w.log[it.id] ?? []).filter((s) => s.done);
        const sets = done
          .map((s) => ({ kg: parseLoadKg(s.load) ?? parseLoadKg(it.load), reps: parseReps(s.reps) ?? parseReps(it.reps) }))
          .filter((s): s is { kg: number; reps: number } => s.kg != null && s.reps != null);
        if (sets.length === 0) continue;
        const e = perEx.get(it.exerciseId) ?? { name: it.exerciseName, sets: [] };
        e.sets.push(...sets);
        perEx.set(it.exerciseId, e);
      }
    for (const [exId, { name, sets }] of perEx) {
      const withE = sets.map((s) => ({ ...s, e: epley(s.kg, s.reps) }));
      const best = withE.reduce((a, b) => ((b.e ?? 0) > (a.e ?? 0) || ((b.e ?? 0) === (a.e ?? 0) && b.kg > a.kg) ? b : a));
      const entry = byExercise.get(exId) ?? { name, points: [] };
      entry.points.push({
        date: w.date,
        workoutId: w.id,
        bestLoadKg: best.kg,
        reps: best.reps,
        e1rm: best.e,
        sets: sets.length,
        volumeKg: Math.round(sets.reduce((n, s) => n + s.kg * s.reps, 0)),
      });
      byExercise.set(exId, entry);
    }
  }
  return byExercise;
}

export function exerciseSummaries(map: ReturnType<typeof progressFromWorkouts>): ProgressExercise[] {
  return [...map.entries()]
    .map(([exerciseId, { name, points }]) => {
      const es = points.map((p) => p.e1rm).filter((x): x is number => x != null);
      return {
        exerciseId,
        exerciseName: name,
        sessions: points.length,
        lastDate: points.at(-1)!.date,
        bestE1rm: es.length ? Math.max(...es) : null,
        lastE1rm: points.at(-1)!.e1rm,
      };
    })
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.sessions - a.sessions);
}
