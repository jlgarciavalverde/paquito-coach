import type { Meal, MealPlan, Targets } from "@coach/shared";
import { WEEKDAY_NAMES } from "../../lib/nutrition";

/** Objetivos del plan en una línea de cifras (solo los que tenga). */
export function TargetsLine({ t }: { t: Targets }) {
  const parts: [string, number | null, string][] = [
    ["kcal", t.kcal, ""],
    ["proteína", t.protein, " g"],
    ["hidratos", t.carbs, " g"],
    ["grasa", t.fat, " g"],
  ];
  const shown = parts.filter(([, v]) => v != null);
  if (shown.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1">
      {shown.map(([k, v, u]) => (
        <div key={k} className="flex items-baseline gap-1.5">
          <dd className="font-narrow text-[20px] text-ink">
            {v}
            {u}
          </dd>
          <dt className="text-[13px] text-ink-2">{k}</dt>
        </div>
      ))}
    </dl>
  );
}

export function MealBlock({ meal, children }: { meal: Meal; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 py-3.5">
      <div className="min-w-0">
        <p className="font-medium text-ink">
          {meal.time && <span className="font-narrow mr-2 text-[15px] text-ink-3">{meal.time}</span>}
          {meal.name}
        </p>
        {meal.items.length > 0 ? (
          <ul className="mt-1 text-[14.5px] text-ink-2">
            {meal.items.map((i) => (
              <li key={i.id}>
                {i.food}
                {i.qty && <span className="font-narrow ml-1.5 text-ink">{i.qty}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-3">Sin alimentos anotados</p>
        )}
        {meal.alternatives && (
          <p className="mt-1.5 text-[13.5px] text-ink-2">
            <span className="font-medium text-ink">Alternativa: </span>
            {meal.alternatives}
          </p>
        )}
        {meal.notes && <p className="mt-1 text-[13.5px] text-ink-3">{meal.notes}</p>}
      </div>
      {children}
    </div>
  );
}

/** Plan completo en lectura: un bloque por día (o uno solo si es igual todos los días). */
export function PlanView({ plan }: { plan: MealPlan }) {
  return (
    <div className="flex flex-col gap-6">
      {plan.days.map((d) => (
        <section key={d.weekday}>
          <h3 className="mb-1 text-[13.5px] font-medium text-ink-2">{d.weekday === 0 ? "Todos los días" : WEEKDAY_NAMES[d.weekday]}</h3>
          {d.meals.length === 0 ? (
            <p className="border-y border-rule py-3 text-sm text-ink-3">Sin comidas</p>
          ) : (
            <div className="divide-y divide-rule border-y border-rule">
              {d.meals.map((m) => (
                <MealBlock key={m.id} meal={m} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
