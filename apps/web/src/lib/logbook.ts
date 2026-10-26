import { epley, parseLoadKg, parseReps, type LastSets, type RoutineItem, type SetLog } from "@coach/shared";

/** Propuesta para una serie vacía y de dónde sale (se le explica a la persona: no es lo mismo que el objetivo). */
export type Suggestion = { reps: string; load: string; from: "prev" | "last" | "plan" };

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
  if (prev?.done && (prev.reps || prev.load)) return { reps: prev.reps, load: prev.load, from: "prev" };
  const l = last[it.exerciseId]?.sets;
  const ls = l?.[idx] ?? l?.at(-1);
  if (ls) return { reps: ls.reps, load: ls.load, from: "last" };
  return { reps: it.reps.match(/^\d+/)?.[0] ?? "", load: prescribedKg(it.load), from: "plan" };
}

/** 1RM estimado de una serie (Epley, como en Progreso); con la carga y las reps prescritas si la serie no las lleva. */
export function setE1rm(it: RoutineItem, s: SetLog): number | null {
  const kg = parseLoadKg(s.load) ?? parseLoadKg(it.load);
  const reps = parseReps(s.reps) ?? parseReps(it.reps);
  return kg && reps ? epley(kg, reps) : null;
}

/**
 * ¿La serie `idx`, recién marcada, es un récord? Solo si supera el mejor 1RM estimado de los entrenos anteriores y el de
 * las demás series hechas hoy (un récord por ejercicio y sesión: la siguiente serie igual ya no avisa). Sin historial no
 * hay récord (la primera vez no se compara con nada).
 */
export function isRecord(it: RoutineItem, sets: SetLog[], idx: number, best: number | null | undefined): number | null {
  if (best === null || best === undefined) return null;
  const e = setE1rm(it, sets[idx]!);
  if (e === null || e <= best) return null;
  const others = sets.filter((s, i) => i !== idx && s.done).map((s) => setE1rm(it, s) ?? 0);
  return others.some((o) => o >= e) ? null : e;
}

/** Sube o baja reps o kg a partir de lo escrito (o de lo sugerido); nunca por debajo de 0. Texto no numérico: sin cambio. */
export function bumpValue(current: string, field: "reps" | "load", delta: number): string | null {
  const n = current.trim() === "" ? 0 : num(current);
  if (!Number.isFinite(n)) return null;
  const v = Math.max(0, n + delta);
  return field === "load" ? fmtKg(v) : String(Math.round(v));
}

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Guardado del cuaderno mientras se escribe. Reglas (cada una arregla una pérdida de series):
 * - espera `delay` ms desde el último cambio y manda **solo lo último**;
 * - **una petición cada vez**: si hay cambios mientras se guarda, se mandan después (una respuesta vieja no pisa otra nueva);
 * - `flush()` manda lo pendiente ya y espera a que todo esté guardado; si falla, **rechaza** (para no dar el entreno por
 *   terminado con series sin guardar);
 * - `leave()` al salir de la pantalla: lo pendiente se manda con `keepalive` (llega aunque se cierre la pestaña).
 */
export function createLogSaver<T>(opts: { save: (log: T, keepalive?: boolean) => Promise<unknown>; onState: (s: SaveState) => void; delay?: number }) {
  const delay = opts.delay ?? 700;
  let pending: T | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;
  let failed = false;

  const run = async (): Promise<void> => {
    while (pending !== null) {
      const log = pending;
      pending = null;
      try {
        await opts.save(log);
        failed = false;
      } catch (e) {
        if (pending === null) pending = log; // se reintenta en el siguiente cambio o en flush()
        failed = true;
        opts.onState("error");
        throw e;
      }
    }
    opts.onState("saved");
  };
  const start = () => {
    if (!inFlight) inFlight = run().finally(() => (inFlight = null));
    return inFlight;
  };

  return {
    schedule(log: T) {
      pending = log;
      opts.onState("saving");
      clearTimeout(timer);
      timer = setTimeout(() => void (inFlight ? inFlight.then(start, start) : start()).catch(() => {}), delay);
    },
    /** Manda lo pendiente ya y espera a que todo esté guardado. Rechaza si no se ha podido guardar. */
    async flush() {
      clearTimeout(timer);
      if (inFlight) await inFlight.catch(() => {});
      if (pending !== null) {
        opts.onState("saving");
        await start();
      } else if (failed) throw new Error("save_failed");
    },
    /** Al desmontar: nada de estados; lo pendiente, con keepalive. */
    leave() {
      clearTimeout(timer);
      if (pending !== null) void opts.save(pending, true).catch(() => {});
      pending = null;
    },
    get dirty() {
      return pending !== null || inFlight !== null;
    },
  };
}
