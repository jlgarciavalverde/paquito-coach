import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { mealsFor, type Client } from "@coach/shared";
import { Button, buttonClass } from "../ui/button";
import { EmptyNote } from "../ui/layout";
import { Select } from "../ui/field";
import { Skeleton } from "../ui/spinner";
import { PlanView, TargetsLine } from "./plan-view";
import { clientChecksQuery, clientPlanQuery, templatesQuery, useCreatePlan } from "../../lib/nutrition";
import { dayShort, fromIso, plusDays, today } from "../../lib/dates";
import { cn } from "../../lib/cn";
import { QueryError } from "../ui/query-state";
import { errorMessage } from "../../lib/api";
import { useToast } from "../../components/ui/toast";
import { localDate } from "../../lib/agenda";

/** Pestaña «Nutrición» de la ficha: su plan activo, cumplimiento de los últimos 7 días y cambiar/crear plan. */
export function ClientNutrition({ client }: { client: Client }) {
  const toast = useToast();
  const plan = useQuery(clientPlanQuery(client.id));
  const templates = useQuery(templatesQuery);
  const create = useCreatePlan();
  const navigate = useNavigate();
  const [tpl, setTpl] = useState("");
  const t = today();
  const from = plusDays(t, -6);
  const checks = useQuery({ ...clientChecksQuery(client.id, from, t), enabled: Boolean(plan.data) });

  const open = (id: string) => navigate({ to: "/coach/nutricion/$planId", params: { planId: id } });
  const startBlank = () => create.mutate({ clientId: client.id }, { onError: (e) => toast(errorMessage(e), "error"), onSuccess: (p) => open(p.id) });
  const fromTemplate = () => tpl && create.mutate({ clientId: client.id, fromPlanId: tpl }, { onError: (e) => toast(errorMessage(e), "error"), onSuccess: (p) => open(p.id) });

  const picker = (templates.data ?? []).length > 0 && (
    <div className="flex flex-wrap items-end gap-2">
      <Select label="Usar una plantilla" value={tpl} onChange={(e) => setTpl(e.target.value)} className="min-w-[220px]">
        <option value="">Elige…</option>
        {templates.data!.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Button variant="secondary" disabled={!tpl} loading={create.isPending && Boolean(tpl)} onClick={fromTemplate}>
        Aplicar
      </Button>
    </div>
  );

  if (plan.isPending) return <Skeleton className="h-48" />;

  if (plan.isError) return <QueryError q={plan} />;
  if (!plan.data)
    return (
      <div className="flex flex-col gap-6">
        <EmptyNote action={<Button loading={create.isPending && !tpl} onClick={startBlank}>Crear plan en blanco</Button>}>
          {client.name.split(" ")[0]} no tiene plan de comidas. Créalo desde cero o parte de una de tus plantillas.
        </EmptyNote>
        {picker}
      </div>
    );

  const p = plan.data;
  const days = Array.from({ length: 7 }, (_, i) => plusDays(from, i));
  const doneOn = (d: string) => (checks.data ?? []).filter((c) => c.date === d && c.done).length;
  const expectedOn = (d: string) => mealsFor(p, fromIso(d).getDay()).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-wide text-[19px]">{p.name}</h3>
          <div className="mt-2">
            <TargetsLine t={p.targets} />
          </div>
          {p.notes && <p className="mt-2 max-w-[60ch] text-sm text-ink-2">{p.notes}</p>}
        </div>
        <Link to="/coach/nutricion/$planId" params={{ planId: p.id }} className={buttonClass("secondary")}>
          Editar plan
        </Link>
      </div>

      <section aria-labelledby="adh-title">
        <h3 id="adh-title" className="mb-2 text-[13.5px] font-medium text-ink-2">
          Comidas marcadas como cumplidas, últimos 7 días
        </h3>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            // Días anteriores a este plan no cuentan (no tenía nada que cumplir).
            const before = d < localDate(p.createdAt);
            const e = before ? 0 : expectedOn(d);
            const n = doneOn(d);
            return (
              <div key={d} className={cn("rounded-[var(--radius-control)] px-1 py-2 text-center", d === t ? "bg-tray-2" : "bg-tray")}>
                <p className="text-[12px] text-ink-3">{dayShort(d)}</p>
                <p className="font-narrow text-[18px] text-ink">{before ? <span className="text-ink-3" aria-label="sin plan">—</span> : `${n}/${e}`}</p>
                <div className="mx-auto mt-1 flex h-1.5 max-w-[48px] gap-0.5" aria-hidden="true">
                  {Array.from({ length: e }, (_, i) => (
                    <span key={i} className={cn("flex-1 rounded-[1px]", i < n ? "bg-plate-green" : "bg-rule-strong")} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {(checks.data ?? []).some((c) => c.note) && (
          <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-2">
            {checks.data!
              .filter((c) => c.note)
              .map((c) => (
                <li key={c.date + c.mealId}>
                  <span className="font-narrow text-ink-3">{dayShort(c.date)}</span> «{c.note}»
                </li>
              ))}
          </ul>
        )}
      </section>

      <PlanView plan={p} />
      <div className="border-t border-rule pt-5">{picker}</div>
    </div>
  );
}
