import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { buttonClass } from "../../components/ui/button";
import { BlockTitle, ObjectCard } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { ItemSpec } from "../../components/training/prescription";
import { WorkoutStatusMark } from "../../components/training/workout-status";
import { useMe } from "../../lib/auth";
import { useDocumentTitle } from "../../lib/title";
import { myWorkoutsQuery } from "../../lib/training";
import { dayLong, dayShort, plusDays, today } from "../../lib/dates";
import { firstName } from "../../lib/format";
import { myChecksQuery, myPlanQuery } from "../../lib/nutrition";
import { appointmentLabel, mealsFor } from "@coach/shared";
import { hhmm, localDate, myAppointmentsQuery } from "../../lib/agenda";
import { fromIso } from "../../lib/dates";
import { cn } from "../../lib/cn";
import { myQuestionnaireQuery } from "../../lib/questionnaire";
import { myCheckinsQuery } from "../../lib/followup";

export const Route = createFileRoute("/app/")({
  component: Today,
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Today() {
  const me = useMe()!;
  const t = today();
  useDocumentTitle("Hoy");
  const q = useQuery(myWorkoutsQuery(t, plusDays(t, 14)));
  const todays = (q.data ?? []).filter((w) => w.date === t);
  const next = (q.data ?? []).filter((w) => w.date > t).slice(0, 3);

  return (
    <>
      <p className="text-ink-2">Hola, {firstName(me.name)}.</p>
      <h1 className="font-wide mt-1 text-[28px] leading-[1.1] sm:text-[34px]">{cap(dayLong(t))}</h1>

      <QuestionnairePrompt />
      <CheckinPrompt />
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

      <NextAppointment />
      <TodayMeals />
    </>
  );
}

function TodayMeals() {
  const t = today();
  const plan = useQuery(myPlanQuery);
  const checks = useQuery(myChecksQuery(t, t));
  if (!plan.data) return null;
  const meals = mealsFor(plan.data, fromIso(t).getDay());
  if (meals.length === 0) return null;
  const done = meals.filter((m) => (checks.data ?? []).some((c) => c.mealId === m.id && c.done));
  return (
    <section className="mt-10" aria-labelledby="t-meals">
      <BlockTitle id="t-meals" action={<Link to="/app/comidas" className="text-sm font-medium text-primary hover:underline">Ver el día</Link>}>
        Comidas de hoy
      </BlockTitle>
      <p className="text-ink-2">
        <span className="font-narrow text-[18px] text-ink">
          {done.length} de {meals.length}
        </span>{" "}
        marcadas como hechas.
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {meals.map((m) => {
          const ok = done.includes(m);
          return (
            <li key={m.id} className="flex items-center gap-2">
              <span className={cn("h-3.5 w-[5px] rounded-[1.5px]", ok ? "bg-plate-green" : "bg-rule-strong")} aria-hidden="true" />
              <span className={ok ? "text-ink-2" : "text-ink"}>
                {m.time && <span className="font-narrow mr-1.5 text-ink-3">{m.time}</span>}
                {m.name}
              </span>
              {ok && <span className="sr-only">(hecha)</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NextAppointment() {
  const t = today();
  const q = useQuery(myAppointmentsQuery(t, plusDays(t, 15)));
  const next = (q.data ?? []).find((a) => a.status !== "cancelled" && new Date(a.endsAt) > new Date());
  if (!next) return null;
  const d = localDate(next.startsAt);
  return (
    <section className="mt-10" aria-labelledby="t-appt">
      <BlockTitle id="t-appt">Próxima sesión</BlockTitle>
      <p className="text-ink">
        <span className="font-narrow mr-2 text-[18px]">{d === t ? "Hoy" : dayShort(d)}, {hhmm(next.startsAt)}</span>
        {next.title || appointmentLabel({ ...next, clientName: null })}
        {next.location && <span className="text-ink-2">, {next.location}</span>}
      </p>
    </section>
  );
}

function CheckinPrompt() {
  const q = useQuery(myCheckinsQuery);
  const health = useQuery(myQuestionnaireQuery);
  const me = useMe()!;
  const c = q.data?.[0];
  // De uno en uno: primero el cuestionario de salud.
  if (!c || health.data?.pending) return null;
  return (
    <section className="mt-6 border-l-[5px] border-primary bg-primary-soft px-4 py-3.5" aria-labelledby="t-ci">
      <h2 id="t-ci" className="font-medium text-ink">
        Te toca: {c.formName}
      </h2>
      <p className="mt-0.5 text-sm text-ink-2">
        {c.questions.length} preguntas rápidas para {me.studio.coachName?.split(" ")[0] ?? "tu entrenador"}.
        {q.data!.length > 1 && ` Y ${q.data!.length - 1} más después.`}
      </p>
      <Link to="/app/checkin/$assignmentId" params={{ assignmentId: c.assignmentId }} className={buttonClass("primary", "md", "mt-3")}>
        Rellenarlo
      </Link>
    </section>
  );
}

function QuestionnairePrompt() {
  const q = useQuery(myQuestionnaireQuery);
  if (!q.data?.pending) return null;
  return (
    <section className="mt-6 border-l-[5px] border-primary bg-primary-soft px-4 py-3.5" aria-labelledby="t-q">
      <h2 id="t-q" className="font-medium text-ink">
        {q.data.last ? "Tu entrenador te pide que actualices tu cuestionario de salud" : "Antes de empezar: tu cuestionario de salud"}
      </h2>
      <p className="mt-0.5 text-sm text-ink-2">Son unos 3 minutos y le ayuda a ajustar el entrenamiento a ti.</p>
      <Link to="/app/salud" className={buttonClass("primary", "md", "mt-3")}>
        Rellenarlo ahora
      </Link>
    </section>
  );
}
