import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "@phosphor-icons/react";
import { mealsFor, type Meal } from "@coach/shared";
import { PageTitle } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { useToast } from "../../components/ui/toast";
import { MealBlock, TargetsLine } from "../../components/nutrition/plan-view";
import { myChecksQuery, myPlanQuery, useCheckMeal } from "../../lib/nutrition";
import { dayLong, fromIso, isoDate, mondayOf, plusDays, today } from "../../lib/dates";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { QueryError } from "../../components/ui/query-state";

export const Route = createFileRoute("/app/comidas")({
  component: Meals,
});

const LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

function Meals() {
  const t = today();
  const monday = isoDate(mondayOf(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => plusDays(monday, i));
  const [day, setDay] = useState(t);
  const plan = useQuery(myPlanQuery);
  const checks = useQuery(myChecksQuery(monday, days[6]!));

  if (plan.isPending) return <Skeleton className="h-64" />;

  if (plan.isError) return <QueryError q={plan} />;
  if (!plan.data)
    return (
      <>
        <PageTitle title="Comidas" />
        <p className="text-ink-2">Tu entrenador todavía no te ha preparado un plan de comidas. Cuando lo haga, lo verás aquí día a día.</p>
      </>
    );
  const p = plan.data;
  const meals = mealsFor(p, fromIso(day).getDay());
  const isDone = (d: string, id: string) => (checks.data ?? []).some((c) => c.date === d && c.mealId === id && c.done);

  return (
    <>
      <PageTitle title="Comidas" lead={p.name} />
      <TargetsLine t={p.targets} />
      {p.notes && <p className="mt-3 border-l-[3px] border-primary pl-3 text-sm text-ink-2">{p.notes}</p>}

      <div className="mt-6 grid grid-cols-7 gap-1" role="tablist" aria-label="Día">
        {days.map((d, i) => {
          const ms = mealsFor(p, fromIso(d).getDay());
          const n = ms.filter((m) => isDone(d, m.id)).length;
          const on = d === day;
          return (
            <button
              key={d}
              role="tab"
              aria-selected={on}
              aria-label={`${dayLong(d)}: ${n} de ${ms.length} comidas`}
              onClick={() => setDay(d)}
              className={cn("flex flex-col items-center gap-1 rounded-[var(--radius-control)] py-2", on ? "bg-ink text-paper" : "hover:bg-tray", d === t && !on && "text-primary")}
            >
              <span className={cn("text-[12px]", on ? "text-paper" : "text-ink-3")}>{LETTERS[i]}</span>
              <span className="font-narrow text-[20px] leading-none">{fromIso(d).getDate()}</span>
              <span className="flex h-1.5 w-8 gap-px" aria-hidden="true">
                {ms.map((m) => (
                  <span key={m.id} className={cn("flex-1 rounded-[1px]", isDone(d, m.id) ? "bg-plate-green" : on ? "bg-ink-3" : "bg-rule-strong")} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <h2 className="font-wide mt-8 text-[19px]">{day === t ? "Hoy" : dayLong(day)}</h2>
      {meals.length === 0 ? (
        <p className="mt-2 text-ink-2">Ese día no tiene comidas en tu plan.</p>
      ) : (
        <div className="mt-2 divide-y divide-rule border-y border-rule">
          {meals.map((m) => (
            <MealRow key={m.id} meal={m} date={day} done={isDone(day, m.id)} future={day > t} />
          ))}
        </div>
      )}
    </>
  );
}

function MealRow({ meal, date, done, future }: { meal: Meal; date: string; done: boolean; future: boolean }) {
  const check = useCheckMeal();
  const toast = useToast();
  const toggle = () => check.mutate({ date, mealId: meal.id, done: !done, note: null }, { onError: (e) => toast(errorMessage(e), "error") });
  return (
    <MealBlock meal={meal}>
      {!future && (
        <button
          type="button"
          onClick={toggle}
          disabled={check.isPending}
          aria-pressed={done}
          aria-label={`${meal.name}: ${done ? "cumplida" : "marcar como cumplida"}`}
          className={cn("mt-0.5 inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-medium", done ? "border-plate-green bg-plate-green text-paper" : "border-rule-strong text-ink-2 hover:border-plate-green")}
        >
          <Check size={18} weight="bold" />
          <span className="hidden sm:inline">Hecha</span>
        </button>
      )}
    </MealBlock>
  );
}
