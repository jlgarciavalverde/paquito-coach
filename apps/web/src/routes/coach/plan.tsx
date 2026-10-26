import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEuros, type PaidPlanId } from "@coach/shared";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { BlockTitle, PageTitle, PlateMark, RecordRow, RecordSheet } from "../../components/ui/layout";
import { QueryState } from "../../components/ui/query-state";
import { useToast } from "../../components/ui/toast";
import { api, errorMessage } from "../../lib/api";
import { meQuery } from "../../lib/auth";
import { billingQuery, daysLeft } from "../../lib/platform";
import { fmtDate as formatDate } from "../../lib/format";

export const Route = createFileRoute("/coach/plan")({
  validateSearch: z.object({ pago: z.literal("ok").optional() }),
  component: PlanPage,
});

const STATUS: Record<string, string> = { trial: "En prueba", active: "Al día", past_due: "Cobro pendiente", canceled: "Dado de baja", comp: "Sin cobro" };

/** Ajustes → Plan: en qué plan está el estudio, cuántas plazas usa y cómo pagar o cambiar. */
function PlanPage() {
  const q = useQuery({ ...billingQuery, staleTime: 0 });
  const qc = useQueryClient();
  const toast = useToast();
  const { pago } = Route.useSearch();
  // Al volver de Stripe el webhook puede tardar unos segundos: se vuelve a pedir un par de veces.
  useEffect(() => {
    if (pago !== "ok") return;
    toast("Pago recibido. Activando tu plan…");
    const ts = [2000, 5000, 10000].map((ms) =>
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: billingQuery.queryKey });
        void qc.invalidateQueries({ queryKey: meQuery.queryKey });
      }, ms),
    );
    return () => ts.forEach(clearTimeout);
  }, [pago, qc, toast]);

  const go = (url: string) => window.location.assign(url);
  const checkout = useMutation({ mutationFn: (plan: PaidPlanId) => api<{ url: string }>("/studio/billing/checkout", { body: { plan } }), onSuccess: (r) => go(r.url), onError: (e) => toast(errorMessage(e), "error") });
  const portal = useMutation({ mutationFn: () => api<{ url: string }>("/studio/billing/portal", { body: {} }), onSuccess: (r) => go(r.url), onError: (e) => toast(errorMessage(e), "error") });

  return (
    <>
      <PageTitle title="Plan" lead="Todo está incluido en todos los planes; cambia cuántos clientes puedes llevar a la vez." />
      <QueryState q={q}>
        {(b) => {
          const left = daysLeft(b.trialEndsAt);
          const subscribed = b.status === "active" || b.status === "past_due" || (b.status === "canceled" && b.access === "ok");
          return (
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
              <section>
                <BlockTitle>Tu plan</BlockTitle>
                <RecordSheet>
                  <RecordRow label="Plan">
                    <span className="font-wide text-[19px]">{b.planLabel}</span>
                  </RecordRow>
                  <RecordRow label="Estado">
                    <PlateMark tone={b.access === "locked" || b.status === "past_due" ? "red" : b.status === "trial" ? "yellow" : "green"}>
                      {b.access === "locked" ? "En pausa" : STATUS[b.status]}
                    </PlateMark>
                  </RecordRow>
                  <RecordRow label="Clientes">
                    <span className="font-narrow tabular text-[18px]">
                      {b.activeClients}
                      {b.maxClients !== null && ` de ${b.maxClients}`}
                    </span>
                    {b.maxClients === null && <span className="ml-2 text-sm text-ink-2">sin límite</span>}
                  </RecordRow>
                  {b.status === "trial" && b.trialEndsAt && (
                    <RecordRow label="Prueba">
                      {b.access === "locked" ? `Terminó el ${formatDate(b.trialEndsAt)}` : `Hasta el ${formatDate(b.trialEndsAt)} (${left === 1 ? "queda 1 día" : `quedan ${left} días`})`}
                    </RecordRow>
                  )}
                  {b.currentPeriodEnd && subscribed && (
                    <RecordRow label={b.cancelAtPeriodEnd || b.status === "canceled" ? "Termina" : "Próximo cobro"}>{formatDate(b.currentPeriodEnd)}</RecordRow>
                  )}
                </RecordSheet>
                {b.hasPortal && (
                  <Button variant="secondary" className="mt-5" loading={portal.isPending} onClick={() => portal.mutate()}>
                    Gestionar suscripción
                  </Button>
                )}
                {b.hasPortal && <p className="mt-2 max-w-[56ch] text-sm text-ink-2">Cambiar de plan o de tarjeta, ver las facturas o darte de baja. Se abre la página segura de Stripe.</p>}
                <p className="mt-8 max-w-[56ch] text-sm text-ink-2">
                  Si el estudio queda en pausa, tú y tus clientes podéis seguir consultando todo y exportar los datos; solo se bloquea crear y cambiar cosas.
                </p>
              </section>

              {b.plan !== "fundador" && b.status !== "comp" && !(b.status === "active" && b.hasPortal) && (
                <section aria-labelledby="planes">
                  <BlockTitle id="planes">Elige un plan</BlockTitle>
                  <ul className="divide-y divide-rule border-y border-rule">
                    {b.plans.map((p) => {
                      const tooSmall = p.maxClients !== null && b.activeClients > p.maxClients;
                      return (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                          <span className="min-w-0">
                            <span className="font-wide block text-[19px] text-ink">{p.label}</span>
                            <span className="block text-[14px] text-ink-2">
                              {p.maxClients === null ? "Clientes sin límite" : `Hasta ${p.maxClients} clientes`}
                              {tooSmall && ". Tienes más clientes de los que caben."}
                            </span>
                          </span>
                          <span className="flex items-center gap-4">
                            <span className="font-narrow text-[22px] text-ink">
                              {formatEuros(p.price)}
                              <span className="text-[14px] text-ink-2">/mes</span>
                            </span>
                            <Button
                              variant={p.id === "pro" ? "primary" : "secondary"}
                              disabled={!b.canPay || tooSmall || p.id === "fundador" || p.id === "prueba"}
                              loading={checkout.isPending && checkout.variables === p.id}
                              onClick={() => checkout.mutate(p.id as PaidPlanId)}
                            >
                              Elegir {p.label}
                            </Button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {!b.canPay && <p className="mt-3 max-w-[56ch] text-sm text-ink-2">El pago con tarjeta aún no está activo. Escríbenos y te activamos el plan a mano.</p>}
                </section>
              )}
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
