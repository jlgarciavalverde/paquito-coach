import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { PAYMENT_STATUS_LABEL, formatEuros } from "@coach/shared";
import { Button, buttonClass } from "../../components/ui/button";
import { BlockTitle, EmptyNote, PageTitle, PlateMark } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { useToast } from "../../components/ui/toast";
import { FormError } from "../../components/form-error";
import { statusTone } from "../../components/payments/client-payments";
import { myPaymentsQuery, myPricesQuery, paymentsInfoQuery, useCheckout } from "../../lib/payments";
import { api, errorMessage } from "../../lib/api";
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
                        {p.kind === "pack" ? `${p.sessions} sesiones` : "1 sesión"}
                        {p.validDays ? `, para usar en ${p.validDays} días` : ""}
                      </span>
                    </span>
                    <span className="font-narrow text-[17px]">{formatEuros(p.amount)}</span>
                    <Button
                      size="sm"
                      loading={checkout.isPending && checkout.variables === p.id}
                      onClick={() => checkout.mutate(p.id, { onSuccess: (r) => r.url && window.location.assign(r.url) })}
                    >
                      Comprar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <FormError message={checkout.isError ? errorMessage(checkout.error) : null} />
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

/** Solo en entornos de prueba sin Stripe real: simula la confirmación del pago. */
function Simulated({ checkoutId }: { checkoutId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 border-l-[5px] border-plate-yellow bg-tray px-4 py-3 text-sm">
      <span className="flex-1">Entorno de pruebas: aquí estaría la página de pago de Stripe.</span>
      <Button
        size="sm"
        onClick={async () => {
          await api("/stripe/simulate", { body: { checkoutId } });
          await qc.invalidateQueries({ queryKey: ["payments"] });
          toast("Pago simulado");
        }}
      >
        Simular pago
      </Button>
    </div>
  );
}
