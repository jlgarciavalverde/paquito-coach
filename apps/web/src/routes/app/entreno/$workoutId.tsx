import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, CaretLeft, X } from "@phosphor-icons/react";
import { RPE_SCALE, type RoutineItem, type SetLog, type Workout, type WorkoutLog } from "@coach/shared";
import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { TextArea } from "../../../components/ui/field";
import { HealthAlert } from "../../../components/ui/layout";
import { Skeleton } from "../../../components/ui/spinner";
import { useToast } from "../../../components/ui/toast";
import { ItemSpec, PrescriptionList } from "../../../components/training/prescription";
import { VideoEmbed } from "../../../components/training/video";
import { exerciseQuery, itemLabels, saveLog, useCompleteWorkout, workoutQuery } from "../../../lib/training";
import { dayLong, fmtRest } from "../../../lib/dates";
import { errorMessage } from "../../../lib/api";
import { cn } from "../../../lib/cn";

export const Route = createFileRoute("/app/entreno/$workoutId")({
  component: WorkoutPage,
});

function WorkoutPage() {
  const { workoutId } = Route.useParams();
  const q = useQuery(workoutQuery(workoutId));
  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <p className="text-plate-red">{errorMessage(q.error)}</p>;
  return q.data.status === "planned" ? <Logbook key={q.data.id} w={q.data} /> : <Finished w={q.data} />;
}

const blankSets = (it: RoutineItem): SetLog[] => Array.from({ length: it.sets }, () => ({ reps: "", load: "", rpe: null, done: false }));

/** Cuaderno de la sesión: una tabla de series por ejercicio. Se guarda solo mientras escribes. */
function Logbook({ w }: { w: Workout }) {
  const toast = useToast();
  const labels = itemLabels(w.blocks);
  const items = w.blocks.flatMap((b) => b.items);
  const [log, setLog] = useState<WorkoutLog>(() => Object.fromEntries(items.map((it) => [it.id, w.log[it.id]?.length ? w.log[it.id]! : blankSets(it)])));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [rest, setRest] = useState<{ until: number; total: number; name: string } | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persist = useCallback(
    (next: WorkoutLog) => {
      clearTimeout(timer.current);
      setSaveState("saving");
      timer.current = setTimeout(() => {
        saveLog(w.id, next).then(
          () => setSaveState("saved"),
          () => setSaveState("error"),
        );
      }, 700);
    },
    [w.id],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  const update = (itemId: string, idx: number, patch: Partial<SetLog>) =>
    setLog((l) => {
      const next = { ...l, [itemId]: l[itemId]!.map((s, i) => (i === idx ? { ...s, ...patch } : s)) };
      persist(next);
      return next;
    });

  const toggleDone = (it: RoutineItem, idx: number) => {
    const wasDone = log[it.id]![idx]!.done;
    const s = log[it.id]![idx]!;
    // Al marcar una serie sin anotar, se da por hecha tal como estaba prescrita.
    update(it.id, idx, { done: !wasDone, reps: s.reps || (!wasDone ? it.reps.replace(/[^\d]+.*$/, "") : s.reps) });
    if (!wasDone && it.restSec) setRest({ until: Date.now() + it.restSec * 1000, total: it.restSec, name: it.exerciseName });
  };

  const doneSets = Object.values(log).flat().filter((s) => s.done).length;
  const totalSets = Object.values(log).flat().length;

  return (
    <div className="pb-40">
      <Link to="/app/entreno" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <CaretLeft size={15} /> Entreno
      </Link>
      <h1 className="font-wide text-[28px] leading-tight">{w.title}</h1>
      <p className="mt-1 text-ink-2">{dayLong(w.date)}</p>
      {w.coachNotes && (
        <div className="mt-4">
          <HealthAlert title="Indicaciones de tu entrenador">{w.coachNotes}</HealthAlert>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-8">
        {items.map((it) => (
          <ExerciseLog key={it.id} it={it} label={labels.get(it.id)!} sets={log[it.id]!} onChange={(i, p) => update(it.id, i, p)} onToggle={(i) => toggleDone(it, i)} />
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-rule bg-paper sm:bottom-0">
        {rest && <RestBar rest={rest} onEnd={() => setRest(null)} />}
        <div className="mx-auto flex max-w-[760px] items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-narrow text-[17px] leading-none text-ink">
              {doneSets} de {totalSets} series
            </p>
            <p className="mt-1 text-[12.5px] text-ink-3" aria-live="polite">
              {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado" : saveState === "error" ? "No se ha podido guardar. Revisa la conexión." : "Se guarda solo"}
            </p>
          </div>
          <Button size="lg" onClick={() => setFinishOpen(true)}>
            Terminar
          </Button>
        </div>
      </div>
      <FinishDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        w={w}
        beforeSend={async () => {
          clearTimeout(timer.current);
          await saveLog(w.id, log);
        }}
        onDone={(skipped) => toast(skipped ? "Anotado. Tu entrenador lo verá." : "Entreno terminado. Buen trabajo.")}
      />
    </div>
  );
}

function ExerciseLog({ it, label, sets, onChange, onToggle }: { it: RoutineItem; label: string; sets: SetLog[]; onChange: (i: number, p: Partial<SetLog>) => void; onToggle: (i: number) => void }) {
  const [howOpen, setHowOpen] = useState(false);
  const ex = useQuery({ ...exerciseQuery(it.exerciseId), enabled: howOpen });
  const input = "h-11 w-full rounded-[var(--radius-control)] border border-rule-strong bg-paper px-2 text-center font-narrow text-[17px] outline-none focus:border-primary";
  return (
    <section aria-label={`${label} ${it.exerciseName}`}>
      <div className="flex items-baseline gap-3">
        <span className="font-narrow text-[18px] text-primary">{label}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-medium text-ink">{it.exerciseName}</h2>
          <ItemSpec it={it} />
          {it.notes && <p className="mt-1 text-sm text-ink-2">{it.notes}</p>}
        </div>
      </div>
      <button type="button" onClick={() => setHowOpen((o) => !o)} className="mt-1 ml-8 text-[13.5px] font-medium text-primary hover:underline" aria-expanded={howOpen}>
        {howOpen ? "Ocultar cómo se hace" : "Cómo se hace"}
      </button>
      {howOpen && (
        <div className="mt-2 ml-8 flex flex-col gap-3">
          {ex.isPending ? (
            <Skeleton className="h-16" />
          ) : ex.data ? (
            <>
              {ex.data.videoUrl && <VideoEmbed url={ex.data.videoUrl} title={ex.data.name} />}
              {ex.data.instructions.length > 0 ? (
                <ol className="list-decimal pl-5 text-sm text-ink-2 marker:text-ink-3">
                  {ex.data.instructions.map((s, i) => (
                    <li key={i} className="mt-1">
                      {s}
                    </li>
                  ))}
                </ol>
              ) : (
                !ex.data.videoUrl && <p className="text-sm text-ink-2">Sin instrucciones escritas. Pregúntale a tu entrenador por el chat.</p>
              )}
            </>
          ) : null}
        </div>
      )}
      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="text-[12.5px] text-ink-3">
            <th className="w-12 pb-1 text-left font-normal">Serie</th>
            <th className="pb-1 font-normal">Reps</th>
            <th className="pb-1 font-normal">Kg</th>
            <th className="w-20 pb-1 font-normal">RPE</th>
            <th className="w-14 pb-1 font-normal">
              <span className="sr-only">Hecha</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s, i) => (
            <tr key={i} className={cn(s.done && "bg-plate-green-soft")}>
              <td className="font-narrow py-1 pl-1 text-[16px] text-ink-3">{i + 1}</td>
              <td className="px-1 py-1">
                <input aria-label={`Repeticiones, serie ${i + 1}`} inputMode="numeric" className={input} placeholder={it.reps || "—"} value={s.reps} onChange={(e) => onChange(i, { reps: e.target.value })} />
              </td>
              <td className="px-1 py-1">
                <input aria-label={`Kilos, serie ${i + 1}`} inputMode="decimal" className={input} placeholder={it.load.replace(/\s*kg$/i, "") || "—"} value={s.load} onChange={(e) => onChange(i, { load: e.target.value })} />
              </td>
              <td className="px-1 py-1">
                <select
                  aria-label={`RPE, serie ${i + 1}`}
                  className={cn(input, "px-1")}
                  value={s.rpe ?? ""}
                  onChange={(e) => onChange(i, { rpe: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">—</option>
                  {RPE_SCALE.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.value}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-1 pr-1 text-right">
                <button
                  type="button"
                  onClick={() => onToggle(i)}
                  aria-pressed={s.done}
                  aria-label={`Serie ${i + 1} hecha`}
                  className={cn("inline-flex size-11 items-center justify-center rounded-[var(--radius-control)] border", s.done ? "border-plate-green bg-plate-green text-paper" : "border-rule-strong text-ink-3 hover:border-plate-green")}
                >
                  <Check size={20} weight="bold" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Descanso tras marcar una serie: cuenta atrás con barra, se puede saltar. */
function RestBar({ rest, onEnd }: { rest: { until: number; total: number; name: string }; onEnd: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((rest.until - now) / 1000));
  useEffect(() => {
    if (left === 0) {
      navigator.vibrate?.(200);
      const t = setTimeout(onEnd, 1500);
      return () => clearTimeout(t);
    }
  }, [left, onEnd]);
  return (
    <div className="relative border-b border-rule bg-tray">
      <div className="absolute inset-y-0 left-0 bg-primary-soft transition-[width] duration-200" style={{ width: `${(left / rest.total) * 100}%` }} aria-hidden="true" />
      <div className="relative mx-auto flex max-w-[760px] items-center gap-3 px-4 py-2" role="timer" aria-live="off">
        <span className="font-narrow text-[22px] text-ink">{left === 0 ? "¡Siguiente serie!" : fmtRest(left)}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">Descanso, {rest.name}</span>
        <button type="button" onClick={onEnd} className="rounded-[var(--radius-control)] p-2 text-ink-2 hover:bg-tray-2" aria-label="Saltar descanso">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function FinishDialog({ open, onOpenChange, w, beforeSend, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; w: Workout; beforeSend: () => Promise<void>; onDone: (skipped: boolean) => void }) {
  const complete = useCompleteWorkout(w.id);
  const [rpe, setRpe] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const send = async (skipped: boolean) => {
    await beforeSend().catch(() => {});
    complete.mutate({ sessionRpe: skipped ? null : rpe, comment: comment.trim() || null, skipped }, { onSuccess: () => (onOpenChange(false), onDone(skipped)) });
  };
  const toneBg = { green: "bg-plate-green", yellow: "bg-plate-yellow", red: "bg-plate-red" } as const;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="¿Qué tal ha ido?"
      description="Tu entrenador verá el esfuerzo y tu comentario."
      footer={
        <>
          <Button variant="quiet" onClick={() => send(true)} disabled={complete.isPending}>
            No he podido hacerlo
          </Button>
          <Button onClick={() => send(false)} loading={complete.isPending && typeof complete.variables === "object" && !complete.variables.skipped}>
            Terminar entreno
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-2 text-[13.5px] font-medium">Esfuerzo de la sesión (de 1 a 10)</legend>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup">
          {RPE_SCALE.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={rpe === r.value}
              aria-label={`${r.value}, ${r.label}`}
              onClick={() => setRpe(r.value)}
              className={cn("relative flex h-12 flex-col items-center justify-center rounded-[var(--radius-control)] border", rpe === r.value ? "border-ink bg-ink text-paper" : "border-rule-strong hover:bg-tray")}
            >
              <span className="font-narrow text-[19px] leading-none">{r.value}</span>
              <span className={cn("absolute bottom-1 h-1 w-4 rounded-[1px]", toneBg[r.tone])} aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="mt-2 h-5 text-sm text-ink-2">{rpe ? RPE_SCALE[rpe - 1]!.label : ""}</p>
      </fieldset>
      <TextArea label="Comentario" aside="opcional" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Molestias, sensaciones, cambios que hiciste…" className="mt-2" />
      {complete.isError && <p className="mt-3 text-sm text-plate-red">{errorMessage(complete.error)}</p>}
    </Dialog>
  );
}

function Finished({ w }: { w: Workout }) {
  const reopen = useCompleteWorkout(w.id);
  return (
    <div>
      <Link to="/app/entreno" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <CaretLeft size={15} /> Entreno
      </Link>
      <h1 className="font-wide text-[28px] leading-tight">{w.title}</h1>
      <p className="mt-1 text-ink-2">{dayLong(w.date)}</p>
      <div className={cn("mt-5 border-l-[5px] px-4 py-3", w.status === "done" ? "border-plate-green bg-plate-green-soft" : "border-plate-red bg-plate-red-soft")}>
        <p className="font-medium">{w.status === "done" ? `Terminado${w.sessionRpe ? `, esfuerzo ${w.sessionRpe} de 10` : ""}` : "Marcado como no hecho"}</p>
        {w.clientComment && <p className="mt-0.5 text-sm text-ink-2">«{w.clientComment}»</p>}
      </div>
      <div className="mt-8">
        <PrescriptionList blocks={w.blocks} log={w.log} />
      </div>
      <Button variant="quiet" className="mt-6 -ml-3" loading={reopen.isPending} onClick={() => reopen.mutate("reopen")}>
        Reabrir para corregir
      </Button>
    </div>
  );
}
