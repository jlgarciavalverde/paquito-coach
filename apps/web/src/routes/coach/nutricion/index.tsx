import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Sparkle } from "@phosphor-icons/react";
import { useCoachActions } from "../../../components/coach-actions";
import type { MealPlan } from "@coach/shared";
import { Button } from "../../../components/ui/button";
import { EmptyNote, PageTitle } from "../../../components/ui/layout";
import { Skeleton } from "../../../components/ui/spinner";
import { TargetsLine } from "../../../components/nutrition/plan-view";
import { ApplyPlanPanel } from "../../../components/nutrition/apply-panel";
import { templatesQuery, useCreatePlan } from "../../../lib/nutrition";
import { relativeTime } from "../../../lib/format";
import { QueryError } from "../../../components/ui/query-state";
import { errorMessage } from "../../../lib/api";
import { useToast } from "../../../components/ui/toast";

export const Route = createFileRoute("/coach/nutricion/")({
  component: Templates,
});

function Templates() {
  const toast = useToast();
  const q = useQuery(templatesQuery);
  const create = useCreatePlan();
  const navigate = useNavigate();
  const [apply, setApply] = useState<MealPlan | null>(null);
  const newTemplate = () => create.mutate({ clientId: null }, { onError: (e) => toast(errorMessage(e), "error"), onSuccess: (p) => navigate({ to: "/coach/nutricion/$planId", params: { planId: p.id } }) });
  const act = useCoachActions();
  const btn = (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" icon={<Sparkle size={16} />} onClick={() => act.generate("mealPlan")}>
        Generar con IA
      </Button>
      <Button icon={<Plus size={16} weight="bold" />} loading={create.isPending} onClick={newTemplate}>
        Nueva plantilla
      </Button>
    </div>
  );
  return (
    <>
      <PageTitle title="Nutrición" lead="Plantillas de planes de comidas. Aplícalas a tus clientes y ajusta después cada copia en su ficha." actions={q.data?.length ? btn : undefined} />
      {q.isPending ? (
        <Skeleton className="h-40" />
      ) : q.isError ? (
        <QueryError q={q} />
      ) : q.data!.length === 0 ? (
        <EmptyNote action={btn}>
          Aún no tienes plantillas. Crea tus planes tipo (por ejemplo «Definición 2.000 kcal» o «Volumen, 5 comidas») para no empezar de cero con cada cliente. También puedes hacer el plan directamente desde la ficha de un cliente.
        </EmptyNote>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {q.data!.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
              <Link to="/coach/nutricion/$planId" params={{ planId: p.id }} className="min-w-0 flex-1 basis-[260px] hover:text-primary">
                <span className="block font-medium text-ink">{p.name}</span>
                <span className="block text-[13px] text-ink-2">
                  {p.mode === "same" ? `${p.days[0]!.meals.length} comidas, igual todos los días` : "Distinto cada día"}. Editada {relativeTime(p.updatedAt)}.
                </span>
              </Link>
              <TargetsLine t={p.targets} />
              <Button size="sm" variant="secondary" onClick={() => setApply(p)}>
                Aplicar a clientes
              </Button>
            </li>
          ))}
        </ul>
      )}
      {apply && <ApplyPlanPanel plan={apply} onClose={() => setApply(null)} />}
    </>
  );
}
