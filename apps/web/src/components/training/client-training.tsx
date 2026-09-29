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
import { dayShort, isoDate, mondayOf, plusDays, today, weekLabel } from "../../lib/dates";
import { cn } from "../../lib/cn";

const WEEKS = 5;

/** Pestaña «Entreno» de la ficha: semanas con lo asignado y lo que ha hecho el cliente. */
export function ClientTraining({ client }: { client: Client }) {
  const [offset, setOffset] = useState(0);
  const [assignOpen, setAssignOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
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
          <Button className="ml-2" onClick={() => setAssignOpen(true)}>
            Asignar rutina
          </Button>
        </div>
      </div>

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
    </div>
  );
}
