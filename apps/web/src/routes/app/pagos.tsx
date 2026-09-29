import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { PAYMENT_STATUS_LABEL, SUBSCRIPTION_STATUS_LABEL, formatEuros } from "@coach/shared";
import { Button, buttonClass } from "../../components/ui/button";
import { BlockTitle, EmptyNote, PageTitle, PlateMark } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { useToast } from "../../components/ui/toast";
import { FormError } from "../../components/form-error";
import { statusTone } from "../../components/payments/client-payments";
import { Simulated } from "../../components/payments/simulated";
import { myPaymentsQuery, myPricesQuery, mySubscriptionsQuery, paymentsInfoQuery, useCheckout, usePortal, useSubscribe } from "../../lib/payments";
import { errorMessage } from "../../lib/api";
import { dayMonth } from "../../lib/dates";
import { useDocumentTitle } from "../../lib/title";

export const Route = createFileRoute("/app/pagos")({
  validateSearch: z.object({ pago: z.string().optional(), simulado: z.string().optional() }),
  component: Payments,
});

/** Pagos del cliente: comprar un bono o una sesión, pagar lo que le ha mandado su entrenador y ver sus recibos. */
function Payments() {
  useDocumentTitle("Pagos");
  const { pago, simulado } = Route.useSearch();
  const info = useQuery(paymentsInfoQuery);
  const prices = useQuery(myPricesQuery);
  const history = useQuery(myPaymentsQuery);
  const checkout = useCheckout();
  const subscribe = useSubscribe();
  const portal = usePortal();
  const subs = useQuery(mySubscriptionsQuery);
  const current = (subs.data ?? []).find((s) => s.status !== "canceled");
  const toast = useToast();
  const qc = useQueryClient();
  useEffect(() => {
    if (pago === "ok" && !simulado) {
      toast("Pago hecho. En unos segundos aparecerá aquí.");
      const t = setTimeout(() => void qc.invalidateQueries({ queryKey: ["payments"] }), 2500);
      return () => clearTimeout(t);
    }
  }, [pago, simulado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (info.isPending) return <Skeleton className="h-64" />;
  const pending = (history.data ?? []).filter((p) => p.status === "pending" && p.url);
  const done = (history.data ?? []).filter((p) => !(p.status === "pending" && p.url));
  return (
    <>
      <PageTitle title="Pagos" lead="Paga tus bonos y sesiones con tarjeta, Apple Pay o Google Pay. El pago se hace en la página segura de Stripe." />
      {simulado && <Simulated checkoutId={simulado} />}
      {!info.data?.enabled ? (
        <EmptyNote>Tu entrenador no tiene activados los pagos desde la app.</EmptyNote>
      ) : (
        <div className="flex flex-col gap-10">
          {pending.length > 0 && (
            <section aria-labelledby="pp-title">
              <BlockTitle id="pp-title">Pendiente de pagar</BlockTitle>
              <ul className="divide-y divide-rule border-y border-rule">
                {pending.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1 font-medium">{p.description}</span>
                    <span className="font-narrow text-[17px]">{formatEuros(p.amount)}</span>
                    <a href={p.url!} className={buttonClass("primary", "sm")}>
                      Pagar
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {current && (
            <section aria-labelledby="sub-title">
              <BlockTitle id="sub-title">Tu cuota</BlockTitle>
              <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-zone)] bg-tray px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{current.name}</span>
                  <span className="block text-[13px] text-ink-2">
                    {formatEuros(current.amount)} al mes.{" "}
                    {current.currentPeriodEnd && `${current.cancelAtPeriodEnd ? "Termina el" : "Próximo cobro el"} ${dayMonth(current.currentPeriodEnd.slice(0, 10))}.`}
                  </span>
                </span>
                <PlateMark tone={current.status === "active" ? "green" : "red"}>{SUBSCRIPTION_STATUS_LABEL[current.status]}</PlateMark>
                <Button size="sm" variant="secondary" loading={portal.isPending} onClick={() => portal.mutate(undefined, { onSuccess: (r) => window.location.assign(r.url) })}>
                  Gestionar mi cuota
                </Button>
              </div>
              {current.status !== "active" && <p className="mt-2 text-[13px] text-plate-red">No se ha podido cobrar: revisa tu tarjeta en «Gestionar mi cuota».</p>}
            </section>
          )}
          <section aria-labelledby="buy-title">
            <BlockTitle id="buy-title">Comprar</BlockTitle>
            {(prices.data ?? []).length === 0 ? (
              <p className="text-sm text-ink-2">Tu entrenador aún no ha puesto tarifas.</p>
            ) : (
              <ul className="divide-y divide-rule border-y border-rule">
                {prices.data!.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{p.name}</span>
                      <span className="block text-[13px] text-ink-2">
                        {p.kind === "subscription" ? "Cuota mensual, se cobra sola cada mes" : p.kind === "pack" ? `${p.sessions} sesiones` : "1 sesión"}
                        {p.kind !== "subscription" && p.validDays ? `, para usar en ${p.validDays} días` : ""}
                      </span>
                    </span>
                    <span className="font-narrow text-[17px]">
                      {formatEuros(p.amount)}
                      {p.kind === "subscription" && "/mes"}
                    </span>
                    {p.kind === "subscription" ? (
                      <Button size="sm" disabled={Boolean(current)} loading={subscribe.isPending && subscribe.variables === p.id} onClick={() => subscribe.mutate(p.id, { onSuccess: (r) => window.location.assign(r.url) })}>
                        Suscribirme
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        loading={checkout.isPending && checkout.variables === p.id}
                        onClick={() => checkout.mutate(p.id, { onSuccess: (r) => r.url && window.location.assign(r.url) })}
                      >
                        Comprar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <FormError message={checkout.isError ? errorMessage(checkout.error) : subscribe.isError ? errorMessage(subscribe.error) : portal.isError ? errorMessage(portal.error) : null} />
          </section>
          <section aria-labelledby="hist-title">
            <BlockTitle id="hist-title">Historial</BlockTitle>
            {done.length === 0 ? (
              <p className="text-sm text-ink-2">Aún no has hecho ningún pago desde la app.</p>
            ) : (
              <ul className="divide-y divide-rule border-y border-rule">
                {done.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{p.description}</span>
                      <span className="block text-[13px] text-ink-3">{dayMonth((p.paidAt ?? p.createdAt).slice(0, 10))}</span>
                    </span>
                    <span className="font-narrow text-[16px]">{formatEuros(p.amount)}</span>
                    <PlateMark tone={statusTone(p.status)}>{PAYMENT_STATUS_LABEL[p.status]}</PlateMark>
                    {p.receiptUrl && (
                      <a href={p.receiptUrl} target="_blank" rel="noreferrer noopener" className="text-[13px] font-medium text-primary hover:underline">
                        Recibo
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
