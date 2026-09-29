import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { buttonClass } from "../../components/ui/button";
import { BlockTitle, ObjectCard } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { ItemSpec } from "../../components/training/prescription";
import { WorkoutStatusMark } from "../../components/training/workout-status";
import { useMe } from "../../lib/auth";
import { myWorkoutsQuery } from "../../lib/training";
import { dayLong, dayShort, plusDays, today } from "../../lib/dates";
import { firstName } from "../../lib/format";

export const Route = createFileRoute("/app/")({
  component: Today,
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Today() {
  const me = useMe()!;
  const t = today();
  const q = useQuery(myWorkoutsQuery(t, plusDays(t, 14)));
  const todays = (q.data ?? []).filter((w) => w.date === t);
  const next = (q.data ?? []).filter((w) => w.date > t).slice(0, 3);

  return (
    <>
      <p className="text-ink-2">Hola, {firstName(me.name)}.</p>
      <h1 className="font-wide mt-1 text-[28px] leading-[1.1] sm:text-[34px]">{cap(dayLong(t))}</h1>

      <section className="mt-8" aria-labelledby="t-train">
        <BlockTitle id="t-train">Entreno de hoy</BlockTitle>
        {q.isPending ? (
          <Skeleton className="h-40" />
        ) : todays.length === 0 ? (
          <p className="text-ink-2">Hoy no tienes entreno. {next[0] ? `El próximo es el ${dayLong(next[0].date)}.` : "Tu entrenador te lo asignará aquí."}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {todays.map((w) => {
              const items = w.blocks.flatMap((b) => b.items);
              const doneSets = Object.values(w.log).flat().filter((s) => s.done).length;
              return (
                <ObjectCard key={w.id} className="overflow-hidden">
                  <div className="flex items-start justify-between gap-3 px-4 pt-4">
                    <div>
                      <h3 className="font-wide text-[20px] leading-tight">{w.title}</h3>
                      <p className="text-sm text-ink-2">
                        {items.length} ejercicios{doneSets > 0 && w.status === "planned" ? `, llevas ${doneSets} series` : ""}
                      </p>
                    </div>
                    <WorkoutStatusMark w={w} />
                  </div>
                  {w.coachNotes && <p className="mx-4 mt-3 border-l-[3px] border-primary pl-3 text-sm text-ink-2">{w.coachNotes}</p>}
                  <ol className="mt-3 divide-y divide-rule border-t border-rule">
                    {items.slice(0, 4).map((it) => (
                      <li key={it.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2">
                        <span className="text-sm text-ink">{it.exerciseName}</span>
                        <ItemSpec it={{ ...it, tempo: "", restSec: null, effort: "" }} />
                      </li>
                    ))}
                    {items.length > 4 && <li className="px-4 py-2 text-[13px] text-ink-3">y {items.length - 4} más</li>}
                  </ol>
                  <div className="border-t border-rule bg-tray p-3">
                    <Link to="/app/entreno/$workoutId" params={{ workoutId: w.id }} className={buttonClass("primary", "lg", "w-full")}>
                      {w.status === "done" ? "Ver lo que hiciste" : doneSets > 0 ? "Seguir entrenando" : "Empezar"}
                    </Link>
                  </div>
                </ObjectCard>
              );
            })}
          </div>
        )}
      </section>

      {next.length > 0 && (
        <section className="mt-10" aria-labelledby="t-next">
          <BlockTitle id="t-next">Próximos</BlockTitle>
          <ul className="divide-y divide-rule border-y border-rule">
            {next.map((w) => (
              <li key={w.id}>
                <Link to="/app/entreno/$workoutId" params={{ workoutId: w.id }} className="grid grid-cols-[64px_1fr] items-baseline gap-3 py-3 hover:bg-tray">
                  <span className="font-narrow text-[15px] text-ink-2">{dayShort(w.date)}</span>
                  <span className="truncate text-ink">{w.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 text-sm text-ink-2" aria-label="Más adelante">
        <p>Tu plan de comidas y tu agenda aparecerán aquí cuando tu entrenador los prepare.</p>
      </section>
    </>
  );
}
