import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PRICE_KIND_LABEL, formatEuros, type Price, type PriceKind } from "@coach/shared";
import { Button } from "../ui/button";
import { SidePanel } from "../ui/dialog";
import { Checkbox, Select, TextField } from "../ui/field";
import { BlockTitle, PlateMark } from "../ui/layout";
import { Skeleton } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { FormError } from "../form-error";
import { paymentsInfoQuery, pricesQuery, usePrice } from "../../lib/payments";
import { errorMessage } from "../../lib/api";
import { QueryError } from "../ui/query-state";

/** Ajustes → Cobros: estado de Stripe y tarifas (bonos, sesión suelta, cuota). */
export function PaymentsSettings() {
  const info = useQuery(paymentsInfoQuery);
  const q = useQuery(pricesQuery);
  const [edit, setEdit] = useState<Price | "new" | null>(null);
  return (
    <section aria-labelledby="pay-title">
      <BlockTitle id="pay-title" action={<Button size="sm" variant="secondary" onClick={() => setEdit("new")}>Nueva tarifa</Button>}>
        Cobros
      </BlockTitle>
      <p className="mb-4 max-w-[56ch] text-sm text-ink-2">
        {info.data?.enabled
          ? info.data.testMode
            ? "Stripe en modo de prueba: los pagos no son reales (tarjeta 4242 4242 4242 4242)."
            : "Stripe conectado: tus clientes pagan con tarjeta, Apple Pay o Google Pay y el dinero llega a tu cuenta."
          : "Los cobros no están activos: faltan las claves de Stripe en el servidor (docs/OPERACIONES.md). Puedes preparar ya las tarifas."}
      </p>
      {q.isPending ? (
        <Skeleton className="h-20" />
      ) : q.isError ? (
        <QueryError q={q} />
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-ink-2">Sin tarifas. Crea tus bonos («Bono 10 sesiones, 300 €, 3 meses») y el precio de la sesión suelta.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {q.data!.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setEdit(p)} className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left hover:text-primary">
                <span>
                  <span className="block font-medium">{p.name}</span>
                  <span className="block text-[13px] text-ink-2">
                    {PRICE_KIND_LABEL[p.kind]}
                    {p.kind === "pack" && `, ${p.sessions} sesiones`}
                    {p.validDays ? `, vale ${p.validDays} días` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {!p.active && <PlateMark tone="yellow">Oculta</PlateMark>}
                  <span className="font-narrow text-[17px]">
                    {formatEuros(p.amount)}
                    {p.kind === "subscription" && "/mes"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {edit && <PricePanel price={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function PricePanel({ price, onClose }: { price: Price | null; onClose: () => void }) {
  const m = usePrice();
  const toast = useToast();
  const [f, setF] = useState({
    name: price?.name ?? "",
    kind: price?.kind ?? ("pack" as PriceKind),
    amount: price ? String(price.amount).replace(".", ",") : "",
    sessions: String(price?.sessions ?? 10),
    validDays: price?.validDays ? String(price.validDays) : "90",
    active: price?.active ?? true,
  });
  const amount = Number(f.amount.replace(",", "."));
  const submit = () =>
    m.mutate(
      {
        id: price?.id,
        body: {
          name: f.name,
          kind: f.kind,
          amount,
          sessions: f.kind === "pack" ? Number(f.sessions) || 1 : null,
          validDays: f.kind === "subscription" ? null : Number(f.validDays) || null,
          active: f.active,
        },
      },
      { onSuccess: () => (toast("Tarifa guardada"), onClose()) },
    );
  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={price ? price.name : "Nueva tarifa"}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={m.isPending} disabled={!f.name.trim() || !(amount >= 0.5)}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Select label="Tipo" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PriceKind })}>
          {(Object.keys(PRICE_KIND_LABEL) as PriceKind[]).map((k) => (
            <option key={k} value={k}>
              {PRICE_KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        <TextField label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={f.kind === "pack" ? "Bono 10 sesiones" : f.kind === "session" ? "Sesión suelta" : "Entrenamiento online"} />
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Precio" aside={f.kind === "subscription" ? "€ al mes" : "€"} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="[&_input]:font-narrow [&_input]:text-[18px]" />
          {f.kind === "pack" && <TextField label="Sesiones" type="number" min={1} max={200} value={f.sessions} onChange={(e) => setF({ ...f, sessions: e.target.value })} />}
          {f.kind !== "subscription" && <TextField label="Vale durante" aside="días" type="number" min={1} max={730} value={f.validDays} onChange={(e) => setF({ ...f, validDays: e.target.value })} />}
        </div>
        {f.kind === "subscription" && <p className="text-[13px] text-ink-2">Se cobra sola cada mes con la tarjeta del cliente; puede darse de baja desde su app.</p>}
        <Checkbox label="Visible para que los clientes la compren desde su app" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        <FormError message={m.isError ? errorMessage(m.error) : null} />
      </div>
    </SidePanel>
  );
}
