import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MealPlan } from "@coach/shared";
import { SidePanel } from "../ui/dialog";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/field";
import { useToast } from "../ui/toast";
import { clientsQuery } from "../../lib/queries";
import { useApplyPlan } from "../../lib/nutrition";

/** Aplica una plantilla a varios clientes (cada uno recibe su copia; sustituye su plan actual). */
export function ApplyPlanPanel({ plan, onClose }: { plan: MealPlan; onClose: () => void }) {
  const toast = useToast();
  const active = useQuery(clientsQuery("active")).data ?? [];
  const noAccount = useQuery(clientsQuery("no_account")).data ?? [];
  const apply = useApplyPlan(plan.id);
  const [sel, setSel] = useState<string[]>([]);
  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Aplicar «${plan.name}»`}
      description="Cada cliente recibe una copia que puedes ajustar en su ficha. Sustituye el plan que tuviera."
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={sel.length === 0} loading={apply.isPending} onClick={() => apply.mutate(sel, { onSuccess: (r) => (toast(r.applied === 1 ? "Plan aplicado" : `Plan aplicado a ${r.applied} clientes`), onClose()) })}>
            {sel.length > 1 ? `Aplicar a ${sel.length}` : "Aplicar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        {[...active, ...noAccount].map((c) => (
          <Checkbox key={c.id} label={c.name} checked={sel.includes(c.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
        ))}
        {active.length + noAccount.length === 0 && <p className="text-sm text-ink-2">No tienes clientes activos.</p>}
      </div>
    </SidePanel>
  );
}
