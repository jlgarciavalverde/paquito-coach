import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { Client, Workout } from "@coach/shared";
import { Button } from "../ui/button";
import { EmptyNote } from "../ui/layout";
import { Skeleton } from "../ui/spinner";
import { AssignPanel } from "./assign-panel";
import { WorkoutPanel } from "./workout-panel";
import { WorkoutStatusMark } from "./workout-status";
import { clientWorkoutsQuery } from "../../lib/training";
import { programRunsQuery, useEndRun } from "../../lib/programs";
import { ProgramAssignPanel } from "./program-assign-panel";
import { useConfirm } from "../ui/confirm";
import { useToast } from "../ui/toast";
import { dayShort, isoDate, mondayOf, plusDays, today, weekLabel } from "../../lib/dates";
import { cn } from "../../lib/cn";

const WEEKS = 5;

/** Pestaña «Entreno» de la ficha: semanas con lo asignado y lo que ha hecho el cliente. */
export function ClientTraining({ client }: { client: Client }) {
  const [offset, setOffset] = useState(0);
  const [assignOpen, setAssignOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [programOpen, setProgramOpen] = useState(false);
  const runs = useQuery(programRunsQuery(client.id));
  const endRun = useEndRun(client.id);
  const ask = useConfirm();
  const toast = useToast();
  const current = (runs.data ?? []).filter((r) => !r.ended);
  const base = plusDays(isoDate(mondayOf(new Date())), -7 + offset * 7 * WEEKS);
  const from = base;
  const to = plusDays(base, WEEKS * 7 - 1);
  const q = useQuery(clientWorkoutsQuery(client.id, from, to));
  const t = today();

  const weeks = useMemo(() => {
    const out: { monday: string; items: Workout[] }[] = [];
    for (let i = 0; i < WEEKS; i++) {
      const monday = plusDays(base, i * 7);
      const sunday = plusDays(monday, 6);
      out.push({ monday, items: (q.data ?? []).filter((w) => w.date >= monday && w.date <= sunday) });
    }
    return out;
  }, [q.data, base]);

  const done = (q.data ?? []).filter((w) => w.status === "done").length;
  const past = (q.data ?? []).filter((w) => w.date < t).length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {q.data && past > 0 ? `Ha completado ${done} de ${past} entrenos pasados en este periodo.` : "Planifica sus sesiones asignando rutinas de tu biblioteca."}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="quiet" size="sm" icon={<CaretLeft size={14} />} onClick={() => setOffset((o) => o - 1)} aria-label="Semanas anteriores" />
          {offset !== 0 && (
            <Button variant="quiet" size="sm" onClick={() => setOffset(0)}>
              Hoy
            </Button>
          )}
          <Button variant="quiet" size="sm" icon={<CaretRight size={14} />} onClick={() => setOffset((o) => o + 1)} aria-label="Semanas siguientes" />
          <Button variant="secondary" className="ml-2" onClick={() => setProgramOpen(true)}>
            Aplicar programa
          </Button>
          <Button onClick={() => setAssignOpen(true)}>
            Asignar rutina
          </Button>
        </div>
      </div>

      {current.map((r) => {
        const week = Math.min(r.weeks, Math.max(1, Math.floor((Date.parse(t) - Date.parse(r.start)) / (7 * 86400000)) + 1));
        return (
          <div key={r.id} className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-zone)] bg-tray px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.name}</p>
              <p className="text-[13px] text-ink-2">
                {r.start > t ? `Empieza el ${dayShort(r.start)}` : `Semana ${week} de ${r.weeks}`}. {r.done} de {r.total} entrenos hechos, {r.pending} por delante.
              </p>
            </div>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-paper" role="progressbar" aria-label={`Progreso de ${r.name}`} aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.done}>
              <div className="h-full bg-plate-green" style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
            </div>
            <Button
              size="sm"
              variant="quiet"
              onClick={async () =>
                (await ask({ title: `Terminar «${r.name}»`, body: `Se quitan los ${r.pending} entrenos que quedan sin empezar. Lo ya hecho se conserva.`, confirm: "Terminar programa", danger: true })) &&
                endRun.mutate(r.id, { onSuccess: (x) => toast(`${x.removed} entrenos quitados`) })
              }
            >
              Terminar ya
            </Button>
          </div>
        );
      })}
      {q.isPending ? (
        <Skeleton className="h-64" />
      ) : (q.data ?? []).length === 0 && offset === 0 ? (
        <EmptyNote action={<Button onClick={() => setAssignOpen(true)}>Asignar rutina</Button>}>
          {client.name.split(" ")[0]} no tiene entrenos entre la semana pasada y las próximas cuatro. Asígnale una rutina de tu biblioteca en los días que entrena.
        </EmptyNote>
      ) : (
        <div className="flex flex-col gap-6">
          {weeks.map((w) => (
            <section key={w.monday} aria-label={weekLabel(w.monday)}>
              <h3 className={cn("mb-1 text-[13.5px] font-medium", w.monday <= t && t <= plusDays(w.monday, 6) ? "text-primary" : "text-ink-2")}>
                {weekLabel(w.monday)}
                {w.monday <= t && t <= plusDays(w.monday, 6) && " (esta semana)"}
              </h3>
              {w.items.length === 0 ? (
                <p className="border-y border-rule py-3 text-sm text-ink-3">Sin entrenos</p>
              ) : (
                <ul className="divide-y divide-rule border-y border-rule">
                  {w.items.map((it) => (
                    <li key={it.id}>
                      <button type="button" onClick={() => setOpenId(it.id)} className="grid w-full grid-cols-[64px_1fr_auto] items-center gap-3 py-3 text-left hover:bg-tray">
                        <span className={cn("font-narrow text-[15px]", it.date === t ? "text-primary" : "text-ink-2")}>{dayShort(it.date)}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{it.title}</span>
                          <span className="block truncate text-[13px] text-ink-2">
                            {it.blocks.reduce((n, b) => n + b.items.length, 0)} ejercicios
                            {it.clientComment ? `, «${it.clientComment}»` : ""}
                          </span>
                        </span>
                        <WorkoutStatusMark w={it} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <AssignPanel open={assignOpen} onOpenChange={setAssignOpen} clientId={client.id} />
      <WorkoutPanel id={openId} onClose={() => setOpenId(null)} />
      {programOpen && <ProgramAssignPanel clientId={client.id} onClose={() => setProgramOpen(false)} />}
    </div>
  );
}
