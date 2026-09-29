import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WhatsappLogo } from "@phosphor-icons/react";
import { PAYMENT_STATUS_LABEL, formatEuros, type Client, type Payment } from "@coach/shared";
import { Button } from "../ui/button";
import { SidePanel } from "../ui/dialog";
import { Select, TextField } from "../ui/field";
import { BlockTitle, PlateMark } from "../ui/layout";
import { Skeleton } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { CopyField } from "../ui/copy-field";
import { FormError } from "../form-error";
import { clientPaymentsQuery, paymentsInfoQuery, pricesQuery, usePaymentLink, useRenewPayment } from "../../lib/payments";
import { useSendMessage } from "../../lib/chat";
import { dayMonth } from "../../lib/dates";
import { errorMessage } from "../../lib/api";

export const statusTone = (s: Payment["status"]) => (s === "paid" ? "green" : s === "pending" ? "blue" : s === "refunded" ? "yellow" : "red") as "green" | "blue" | "yellow" | "red";

/** Cobros de un cliente: historial y «Nuevo cobro» con enlace de pago para mandar por WhatsApp o por el chat. */
export function ClientPayments({ client }: { client: Client }) {
  const info = useQuery(paymentsInfoQuery);
  const q = useQuery(clientPaymentsQuery(client.id));
  const renew = useRenewPayment();
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState<Payment | null>(null);
  if (!info.data?.enabled) return null;
  return (
    <section aria-labelledby="cp-title" className="mb-10">
      <BlockTitle id="cp-title" action={<Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Nuevo cobro</Button>}>
        Cobros
      </BlockTitle>
      {q.isPending ? (
        <Skeleton className="h-16" />
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-ink-2">Sin cobros. Puedes mandarle un enlace de pago (un bono, una valoración…) o que compre el bono desde su app.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {q.data!.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.description}</span>
                <span className="block text-[13px] text-ink-3">{dayMonth((p.paidAt ?? p.createdAt).slice(0, 10))}</span>
              </span>
              <span className="font-narrow text-[16px]">{formatEuros(p.amount)}</span>
              <PlateMark tone={statusTone(p.status)}>{PAYMENT_STATUS_LABEL[p.status]}</PlateMark>
              {p.status === "pending" && p.url && (
                <Button size="sm" variant="quiet" onClick={() => setShared(p)}>
                  Enlace
                </Button>
              )}
              {(p.status === "expired" || (p.status === "pending" && !p.url)) && (
                <Button size="sm" variant="quiet" loading={renew.isPending} onClick={() => renew.mutate(p.id, { onSuccess: setShared })}>
                  Enlace nuevo
                </Button>
              )}
              {p.receiptUrl && (
                <a href={p.receiptUrl} target="_blank" rel="noreferrer noopener" className="text-[13px] font-medium text-primary hover:underline">
                  Recibo
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && <NewPaymentPanel client={client} onClose={() => setOpen(false)} onCreated={(p) => (setOpen(false), setShared(p))} />}
      {shared && <SharePanel client={client} payment={shared} onClose={() => setShared(null)} />}
    </section>
  );
}

function NewPaymentPanel({ client, onClose, onCreated }: { client: Client; onClose: () => void; onCreated: (p: Payment) => void }) {
  const prices = useQuery(pricesQuery);
  const m = usePaymentLink(client.id);
  const [priceId, setPriceId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const options = (prices.data ?? []).filter((p) => p.kind !== "subscription");
  const n = Number(amount.replace(",", "."));
  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Cobrar a ${client.name.split(" ")[0]}`}
      description="Se crea un enlace de pago de Stripe (tarjeta, Apple Pay o Google Pay). Si es un bono, se le activa solo al pagarlo."
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={m.isPending}
            disabled={!priceId && !(description.trim() && n >= 0.5)}
            onClick={() => m.mutate(priceId ? { priceId } : { description: description.trim(), amount: n }, { onSuccess: onCreated })}
          >
            Crear enlace de pago
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Select label="Tarifa" value={priceId} onChange={(e) => setPriceId(e.target.value)}>
          <option value="">Otro concepto</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({formatEuros(p.amount)})
            </option>
          ))}
        </Select>
        {!priceId && (
          <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-4">
            <TextField label="Concepto" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Valoración inicial" />
            <TextField label="Importe" aside="€" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="[&_input]:font-narrow [&_input]:text-[18px]" />
          </div>
        )}
        <FormError message={m.isError ? errorMessage(m.error) : null} />
      </div>
    </SidePanel>
  );
}

function SharePanel({ client, payment, onClose }: { client: Client; payment: Payment; onClose: () => void }) {
  const send = useSendMessage(client.id);
  const toast = useToast();
  const text = `Hola ${client.name.split(" ")[0]}, aquí tienes el enlace para pagar «${payment.description}» (${formatEuros(payment.amount)}): ${payment.url}`;
  return (
    <SidePanel open onOpenChange={(o) => !o && onClose()} title="Enlace de pago" description="Caduca en 23 horas; si no lo usa, crea uno nuevo desde sus cobros.">
      <div className="flex flex-col gap-4">
        {payment.url && <CopyField value={payment.url} label="Enlace de pago" />}
        <div className="flex flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-[#1b7348] px-3.5 text-sm font-medium text-white hover:bg-[#155f3b]"
          >
            <WhatsappLogo size={18} weight="fill" /> Enviar por WhatsApp
          </a>
          {client.userId && (
            <Button variant="secondary" loading={send.isPending} onClick={() => send.mutate({ body: text, mediaId: null }, { onSuccess: () => (toast("Enviado por el chat"), onClose()) })}>
              Enviar por el chat
            </Button>
          )}
        </div>
        {client.userId && <p className="text-[13px] text-ink-3">También lo verá en su app, en «Pagos».</p>}
      </div>
    </SidePanel>
  );
}
