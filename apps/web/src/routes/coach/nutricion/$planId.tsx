import { useRef, useState } from "react";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CaretLeft, Plus, Trash, X } from "@phosphor-icons/react";
import { MEAL_PRESETS, type Meal, type MealDay, type MealPlan, type MealPlanBody } from "@coach/shared";
import { Button, IconButton } from "../../../components/ui/button";
import { controlClass } from "../../../components/ui/field";
import { Skeleton } from "../../../components/ui/spinner";
import { useToast, useUndoToast } from "../../../components/ui/toast";
import { useConfirm } from "../../../components/ui/confirm";
import { FormError } from "../../../components/form-error";
import { planQuery, useDeletePlan, useSavePlan, WEEKDAY_NAMES } from "../../../lib/nutrition";
import { clientQuery } from "../../../lib/queries";
import { newId } from "../../../lib/training";
import { errorMessage } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { useDocumentTitle } from "../../../lib/title";
import { RadioGroup } from "../../../components/ui/radio-group";

export const Route = createFileRoute("/coach/nutricion/$planId")({
  component: PlanPage,
});

function PlanPage() {
  const { planId } = Route.useParams();
  const q = useQuery(planQuery(planId));
  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <p className="text-plate-red">{errorMessage(q.error)}</p>;
  return <PlanEditor key={q.data.id} plan={q.data} />;
}

const toBody = (p: MealPlan): MealPlanBody => ({ name: p.name, notes: p.notes, targets: p.targets, mode: p.mode, days: p.days });
const cloneMeals = (meals: Meal[]) => meals.map((m) => ({ ...m, id: "m-" + newId(), items: m.items.map((i) => ({ ...i, id: "f-" + newId() })) }));

/** Editor del plan: objetivos arriba, días (o «todos los días») y en cada día sus comidas con alimentos y alternativas. */
function PlanEditor({ plan }: { plan: MealPlan }) {
  const toast = useToast();
  const navigate = useNavigate();
  const save = useSavePlan(plan.id);
  const del = useDeletePlan();
  const ask = useConfirm();
  const undoToast = useUndoToast();
  const client = useQuery({ ...clientQuery(plan.clientId ?? ""), enabled: Boolean(plan.clientId) }).data;
  const [doc, setDoc] = useState<MealPlanBody>(() => toBody(plan));
  const [saved, setSaved] = useState(() => JSON.stringify(toBody(plan)));
  const [day, setDay] = useState(doc.days[0]!.weekday);
  const dirty = JSON.stringify(doc) !== saved;
  useDocumentTitle(doc.name || "Plan de comidas");
  const leaving = useRef(false);
  useBlocker({
    shouldBlockFn: async () => !leaving.current && dirty && !(await ask({ title: "Hay cambios sin guardar", body: "Si sales ahora, se pierden.", confirm: "Salir sin guardar", danger: true })),
    enableBeforeUnload: () => !leaving.current && dirty,
  });

  const back = plan.clientId ? { to: "/coach/clientes/$clientId" as const, params: { clientId: plan.clientId }, label: client?.name ?? "Ficha del cliente" } : { to: "/coach/nutricion" as const, params: {}, label: "Nutrición" };
  const current = doc.days.find((d) => d.weekday === day) ?? doc.days[0]!;
  const setDays = (fn: (d: MealDay[]) => MealDay[]) => setDoc((d) => ({ ...d, days: fn(d.days) }));
  const setMeals = (fn: (m: Meal[]) => Meal[]) => setDays((ds) => ds.map((d) => (d.weekday === current.weekday ? { ...d, meals: fn(d.meals) } : d)));
  const setMeal = (id: string, patch: Partial<Meal>) => setMeals((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const switchMode = (mode: "same" | "weekly") => {
    if (mode === doc.mode) return;
    if (mode === "weekly") {
      const base = doc.days[0]!.meals;
      setDoc({ ...doc, mode, days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, meals: cloneMeals(base) })) });
      setDay(1);
    } else {
      const before = doc;
      const prevDay = day;
      setDoc({ ...doc, mode, days: [{ weekday: 0, meals: current.meals }] });
      setDay(0);
      undoToast(`Todos los días con las comidas del ${WEEKDAY_NAMES[current.weekday]?.toLowerCase()}`, () => (setDoc(before), setDay(prevDay)));
    }
  };
  const copyToAll = () => {
    const before = doc.days;
    setDays((ds) => ds.map((d) => (d.weekday === current.weekday ? d : { ...d, meals: cloneMeals(current.meals) })));
    undoToast(`Comidas del ${WEEKDAY_NAMES[current.weekday]?.toLowerCase()} copiadas al resto de días`, () => setDays(() => before));
  };

  const submit = () => {
    // Las filas de alimento vacías no se guardan.
    const clean = { ...doc, days: doc.days.map((d) => ({ ...d, meals: d.meals.map((m) => ({ ...m, items: m.items.filter((i) => i.food.trim()) })) })) };
    setDoc(clean);
    save.mutate(clean, {
      onSuccess: () => {
        setSaved(JSON.stringify(clean));
        toast("Plan guardado");
      },
    });
  };

  const num = (v: string) => (v === "" ? null : Math.max(0, Math.round(Number(v)) || 0));
  const cell = cn(controlClass, "h-9 px-2 text-sm");
  const targetFields: [keyof MealPlanBody["targets"], string, string][] = [
    ["kcal", "Kcal", "kcal"],
    ["protein", "Proteína", "g"],
    ["carbs", "Hidratos", "g"],
    ["fat", "Grasa", "g"],
  ];

  return (
    <div className="pb-24">
      <Link to={back.to} params={back.params as never} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <CaretLeft size={15} /> {back.label}
      </Link>
      <p className="text-sm text-ink-2">{plan.clientId ? `Plan de comidas de ${client?.name ?? "…"}` : "Plantilla de plan de comidas"}</p>
      <label htmlFor="p-name" className="sr-only">
        Nombre del plan
      </label>
      <input
        id="p-name"
        value={doc.name}
        onChange={(e) => setDoc({ ...doc, name: e.target.value })}
        className="font-wide w-full border-b border-transparent bg-transparent py-1 text-[30px] leading-tight outline-none hover:border-rule focus:border-primary sm:text-[34px]"
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <legend className="mb-2 text-[13.5px] font-medium">Objetivos diarios (opcionales)</legend>
          {targetFields.map(([k, label, unit]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-[13px] text-ink-2">{label}</span>
              <span className="relative">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className={cn(controlClass, "font-narrow h-11 pr-10 text-[18px]")}
                  value={doc.targets[k] ?? ""}
                  onChange={(e) => setDoc({ ...doc, targets: { ...doc.targets, [k]: num(e.target.value) } })}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-ink-3">{unit}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="text-[13.5px] font-medium">Indicaciones generales</span>
          <textarea rows={3} className={cn(controlClass, "py-2 text-sm")} value={doc.notes} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} placeholder="Agua, suplementos, qué hacer si comes fuera…" />
        </label>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <RadioGroup className="inline-flex rounded-[var(--radius-control)] border border-rule-strong p-0.5" aria-label="Estructura del plan">
          {(
            [
              ["same", "Igual todos los días"],
              ["weekly", "Distinto cada día"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={doc.mode === v} onClick={() => switchMode(v)} className={cn("h-8 rounded-[4px] px-3 text-sm font-medium", doc.mode === v ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}>
              {l}
            </button>
          ))}
        </RadioGroup>
        {doc.mode === "weekly" && (
          <Button variant="quiet" size="sm" onClick={copyToAll}>
            Copiar este día al resto
          </Button>
        )}
      </div>
      {doc.mode === "weekly" && (
        <div className="mt-3 grid grid-cols-7 gap-1" role="tablist" aria-label="Día de la semana">
          {doc.days.map((d) => (
            <button
              key={d.weekday}
              role="tab"
              aria-selected={d.weekday === current.weekday}
              onClick={() => setDay(d.weekday)}
              className={cn("rounded-[var(--radius-control)] py-2 text-sm font-medium", d.weekday === current.weekday ? "bg-primary text-primary-ink" : "bg-tray text-ink-2 hover:bg-tray-2")}
            >
              <span className="sm:hidden">{WEEKDAY_NAMES[d.weekday]!.slice(0, 2)}</span>
              <span className="hidden sm:inline">{WEEKDAY_NAMES[d.weekday]}</span>
              <span className="font-narrow block text-[12px] opacity-80">{d.meals.length} comidas</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {current.meals.map((m, mi) => (
          <section key={m.id} className="rounded-[var(--radius-zone)] bg-tray p-4" aria-label={m.name}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
              <input aria-label="Nombre de la comida" value={m.name} onChange={(e) => setMeal(m.id, { name: e.target.value })} className="font-wide min-w-0 bg-transparent text-[18px] outline-none focus:underline" />
              <div className="w-32">
                <input aria-label={`Hora de ${m.name}`} type="time" value={m.time ?? ""} onChange={(e) => setMeal(m.id, { time: e.target.value || null })} className={cn(cell, "bg-paper")} />
              </div>
              <IconButton label={`Quitar ${m.name}`} onClick={() => setMeals((ms) => ms.filter((x) => x.id !== m.id))}>
                <Trash size={16} />
              </IconButton>
            </div>
            <table className="mt-3 w-full border-collapse">
              <thead>
                <tr className="text-left text-[12.5px] text-ink-3">
                  <th className="pb-1 font-normal">Alimento</th>
                  <th className="w-32 pb-1 font-normal">Cantidad</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {m.items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-1 pr-2">
                      <input aria-label="Alimento" className={cn(cell, "bg-paper")} value={it.food} onChange={(e) => setMeal(m.id, { items: m.items.map((x) => (x.id === it.id ? { ...x, food: e.target.value } : x)) })} />
                    </td>
                    <td className="py-1 pr-2">
                      <input aria-label={`Cantidad de ${it.food || "alimento"}`} className={cn(cell, "font-narrow bg-paper")} value={it.qty} onChange={(e) => setMeal(m.id, { items: m.items.map((x) => (x.id === it.id ? { ...x, qty: e.target.value } : x)) })} />
                    </td>
                    <td>
                      <IconButton label={`Quitar ${it.food || "alimento"}`} onClick={() => setMeal(m.id, { items: m.items.filter((x) => x.id !== it.id) })}>
                        <X size={15} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => setMeal(m.id, { items: [...m.items, { id: "f-" + newId(), food: "", qty: "" }] })} className="mt-1 inline-flex items-center gap-1.5 py-1 text-sm font-medium text-primary hover:underline">
              <Plus size={14} weight="bold" /> Añadir alimento
            </button>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[13px] text-ink-2">Alternativas</span>
                <textarea rows={2} className={cn(controlClass, "bg-paper py-1.5 text-sm")} value={m.alternatives} onChange={(e) => setMeal(m.id, { alternatives: e.target.value })} placeholder={mi === 0 ? "Si no tienes avena: 2 tostadas integrales" : undefined} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[13px] text-ink-2">Nota</span>
                <textarea rows={2} className={cn(controlClass, "bg-paper py-1.5 text-sm")} value={m.notes} onChange={(e) => setMeal(m.id, { notes: e.target.value })} />
              </label>
            </div>
          </section>
        ))}
        <div>
          <p className="mb-2 text-[13.5px] font-medium">Añadir comida{doc.mode === "weekly" ? ` al ${WEEKDAY_NAMES[current.weekday]?.toLowerCase()}` : ""}</p>
          <div className="flex flex-wrap gap-1.5">
            {MEAL_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setMeals((ms) => [...ms, { id: "m-" + newId(), name: p, time: null, items: [{ id: "f-" + newId(), food: "", qty: "" }], alternatives: "", notes: "" }])}
                className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-control)] border border-dashed border-rule-strong px-2.5 text-[13.5px] text-ink-2 hover:border-primary hover:text-primary"
              >
                <Plus size={12} weight="bold" /> {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-rule bg-paper/95 backdrop-blur-sm md:bottom-0">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <p className="text-sm text-ink-2">{dirty ? "Cambios sin guardar" : "Guardado"}</p>
          <FormError message={save.isError ? errorMessage(save.error) : null} />
          <div className="ml-auto flex gap-2">
            {!plan.clientId && (
              <Button
                variant="quiet"
                onClick={() =>
                  void ask({ title: "Borrar la plantilla", body: "Los planes ya aplicados a clientes no cambian.", confirm: "Borrar plantilla", danger: true }).then((ok) => ok &&
                  del.mutate(plan.id, { onError: (e) => toast(errorMessage(e), "error"), onSuccess: () => ((leaving.current = true), navigate({ to: "/coach/nutricion" })) }))
                }
              >
                Borrar plantilla
              </Button>
            )}
            <Button onClick={submit} loading={save.isPending} disabled={!dirty || !doc.name.trim()}>
              Guardar plan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
