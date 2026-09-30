import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { Workout } from "@coach/shared";
import { IconButton } from "../../../components/ui/button";
import { PageTitle } from "../../../components/ui/layout";
import { Skeleton } from "../../../components/ui/spinner";
import { WorkoutStatusMark } from "../../../components/training/workout-status";
import { myWorkoutsQuery } from "../../../lib/training";
import { dayLong, fromIso, isoDate, mondayOf, plusDays, today, weekLabel } from "../../../lib/dates";
import { cn } from "../../../lib/cn";
import { QueryError } from "../../../components/ui/query-state";

export const Route = createFileRoute("/app/entreno/")({
  component: Week,
});

const LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

function tone(w: Workout, t: string) {
  if (w.status === "done") return "bg-plate-green";
  if (w.status === "skipped" || w.date < t) return "bg-plate-red";
  if (w.date === t) return "bg-plate-yellow";
  return "bg-primary";
}

/** Semana de entrenos: siete días con una marca del color del disco según el estado; debajo, el día elegido. */
function Week() {
  const t = today();
  const [monday, setMonday] = useState(isoDate(mondayOf(new Date())));
  const [day, setDay] = useState(t);
  const sunday = plusDays(monday, 6);
  const q = useQuery(myWorkoutsQuery(monday, sunday));
  const days = Array.from({ length: 7 }, (_, i) => plusDays(monday, i));
  const selected = (q.data ?? []).filter((w) => w.date === day);
  const go = (n: number) => {
    const m = plusDays(monday, n * 7);
    setMonday(m);
    setDay(n === 0 ? t : m);
  };

  return (
    <>
      <PageTitle
        title="Entreno"
        actions={
          <Link to="/app/progreso" className="text-sm font-medium text-primary hover:underline">
            Ver mi progreso
          </Link>
        }
      />
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink-2">{weekLabel(monday)}</h2>
        <div className="flex">
          <IconButton label="Semana anterior" onClick={() => go(-1)}>
            <CaretLeft size={16} />
          </IconButton>
          <IconButton label="Semana siguiente" onClick={() => go(1)}>
            <CaretRight size={16} />
          </IconButton>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Días de la semana">
        {days.map((d, i) => {
          const ws = (q.data ?? []).filter((w) => w.date === d);
          const on = d === day;
          return (
            <button
              key={d}
              role="tab"
              aria-selected={on}
              aria-label={`${dayLong(d)}${ws.length ? `, ${ws.length} entreno` : ", descanso"}`}
              onClick={() => setDay(d)}
              className={cn("flex flex-col items-center gap-1 rounded-[var(--radius-control)] py-2", on ? "bg-ink text-paper" : "hover:bg-tray", d === t && !on && "text-primary")}
            >
              <span className={cn("text-[12px]", on ? "text-paper" : "text-ink-3")}>{LETTERS[i]}</span>
              <span className="font-narrow text-[20px] leading-none">{fromIso(d).getDate()}</span>
              <span className="flex h-3 items-end gap-0.5">
                {ws.map((w) => (
                  <span key={w.id} className={cn("h-3 w-[5px] rounded-[1px]", tone(w, t))} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <section className="mt-8" aria-live="polite">
        <h2 className="font-wide text-[19px]">{day === t ? "Hoy" : dayLong(day)}</h2>
        {q.isPending ? (
          <Skeleton className="mt-3 h-20" />
        ) : q.isError ? (
          <QueryError q={q} />
        ) : selected.length === 0 ? (
          <p className="mt-2 text-ink-2">Día de descanso.</p>
        ) : (
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {selected.map((w) => (
              <li key={w.id}>
                <Link to="/app/entreno/$workoutId" params={{ workoutId: w.id }} className="flex items-center justify-between gap-3 py-3.5 hover:bg-tray">
                  <span>
                    <span className="block font-medium text-ink">{w.title}</span>
                    <span className="block text-[13px] text-ink-2">{w.blocks.reduce((n, b) => n + b.items.length, 0)} ejercicios</span>
                  </span>
                  <WorkoutStatusMark w={w} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
