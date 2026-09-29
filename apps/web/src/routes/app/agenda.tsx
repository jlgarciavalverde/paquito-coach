import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { appointmentLabel } from "@coach/shared";
import { PageTitle } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { WorkoutStatusMark } from "../../components/training/workout-status";
import { hhmm, localDate, myAppointmentsQuery } from "../../lib/agenda";
import { myWorkoutsQuery } from "../../lib/training";
import { dayShort, plusDays, today } from "../../lib/dates";
import { cn } from "../../lib/cn";

export const Route = createFileRoute("/app/agenda")({
  component: MyAgenda,
});

/** Agenda del cliente: sus sesiones con el entrenador y sus entrenos, en lista por días (dos semanas). */
function MyAgenda() {
  const t = today();
  const to = plusDays(t, 13);
  const appts = useQuery(myAppointmentsQuery(t, plusDays(to, 1)));
  const workouts = useQuery(myWorkoutsQuery(t, to));
  const days = Array.from({ length: 14 }, (_, i) => plusDays(t, i));
  if (appts.isPending || workouts.isPending) return <Skeleton className="h-64" />;
  const rows = days
    .map((d) => ({ d, a: (appts.data ?? []).filter((x) => localDate(x.startsAt) === d), w: (workouts.data ?? []).filter((x) => x.date === d) }))
    .filter((r) => r.a.length || r.w.length || r.d === t);
  return (
    <>
      <PageTitle title="Agenda" lead="Tus sesiones y entrenos de las próximas dos semanas." />
      <div className="border-t border-rule">
        {rows.map(({ d, a, w }) => (
          <section key={d} className="grid grid-cols-[64px_1fr] gap-3 border-b border-rule py-3">
            <h2 className={cn("pt-0.5 text-[13.5px] capitalize", d === t ? "font-medium text-primary" : "text-ink-2")}>{d === t ? "hoy" : dayShort(d)}</h2>
            <ul className="flex flex-col gap-2">
              {a.length + w.length === 0 && <li className="text-sm text-ink-3">Nada previsto</li>}
              {a.map((x) => (
                <li key={x.id} className="flex items-baseline gap-3">
                  <span className="font-narrow w-24 shrink-0 text-[15px]">
                    {hhmm(x.startsAt)}–{hhmm(x.endsAt)}
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">{x.title || appointmentLabel({ ...x, clientName: null })}</span>
                    {x.location && <span className="block text-ink-2">{x.location}</span>}
                  </span>
                </li>
              ))}
              {w.map((x) => (
                <li key={x.id}>
                  <Link to="/app/entreno/$workoutId" params={{ workoutId: x.id }} className="flex items-center justify-between gap-3 text-sm hover:text-primary">
                    <span>Entreno: {x.title}</span>
                    <WorkoutStatusMark w={x} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
