import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "@phosphor-icons/react";
import type { Client } from "@coach/shared";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { clientsQuery, useClientAction } from "../../lib/queries";
import { relativeTime } from "../../lib/format";
import { errorMessage } from "../../lib/api";

/** Solicitudes de clientes que se han registrado con el código del estudio y esperan aprobación. */
export function PendingRequests() {
  const pending = useQuery(clientsQuery("pending")).data ?? [];
  if (pending.length === 0) return null;
  return (
    <section aria-labelledby="pending-title" className="mb-8 rounded-[var(--radius-lg)] border border-clay/25 bg-clay-soft/50 p-4 sm:p-5">
      <h2 id="pending-title" className="mb-3 flex items-center gap-2 text-sm font-medium text-clay">
        <span className="flex size-5 items-center justify-center rounded-full bg-clay text-[11px] font-semibold text-paper tabular">{pending.length}</span>
        {pending.length === 1 ? "Solicitud pendiente" : "Solicitudes pendientes"}
      </h2>
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {pending.map((c) => (
            <PendingRow key={c.id} client={c} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function PendingRow({ client }: { client: Client }) {
  const act = useClientAction(client.id);
  const toast = useToast();
  const run = (a: "accept" | "reject") =>
    act.mutate(a, {
      onSuccess: () => toast(a === "accept" ? `${client.name} ya es cliente tuyo` : "Solicitud rechazada"),
      onError: (e) => toast(errorMessage(e), "error"),
    });
  return (
    <motion.li
      layout
      exit={{ opacity: 0, height: 0 }}
      className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface p-3 shadow-[var(--shadow-soft)]"
    >
      <Avatar name={client.name} size={36} />
      <div className="min-w-0 flex-1 basis-[55%]">
        <p className="truncate font-medium">{client.name}</p>
        <p className="truncate text-[13px] text-ink-3">
          {client.email} · {relativeTime(client.createdAt)}
        </p>
      </div>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="ghost" icon={<X size={15} />} disabled={act.isPending} onClick={() => run("reject")}>
          Rechazar
        </Button>
        <Button size="sm" icon={<Check size={15} weight="bold" />} loading={act.isPending && act.variables === "accept"} onClick={() => run("accept")}>
          Aceptar
        </Button>
      </div>
    </motion.li>
  );
}
