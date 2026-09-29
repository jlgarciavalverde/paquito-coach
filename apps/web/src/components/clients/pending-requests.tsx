import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type { Client } from "@coach/shared";
import { Button } from "../ui/button";
import { Monogram } from "../ui/layout";
import { useToast } from "../ui/toast";
import { clientsQuery, useClientAction } from "../../lib/queries";
import { relativeTime } from "../../lib/format";
import { errorMessage } from "../../lib/api";

/** Personas que se han registrado con el código del estudio y esperan a que las aceptes. */
export function PendingRequests({ compact }: { compact?: boolean }) {
  const pending = useQuery(clientsQuery("pending")).data ?? [];
  if (pending.length === 0) return null;
  return (
    <section aria-labelledby="pending-title" className="border-l-[5px] border-plate-red bg-plate-red-soft px-4 py-3.5">
      <h2 id="pending-title" className="text-sm font-medium text-ink">
        {pending.length === 1 ? "1 persona quiere entrenar contigo" : `${pending.length} personas quieren entrenar contigo`}
      </h2>
      <ul className="mt-2 flex flex-col">
        <AnimatePresence initial={false}>
          {pending.map((c) => (
            <PendingRow key={c.id} client={c} compact={compact} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function PendingRow({ client, compact }: { client: Client; compact?: boolean }) {
  const act = useClientAction(client.id);
  const toast = useToast();
  const run = (a: "accept" | "reject") =>
    act.mutate(a, {
      onSuccess: () => toast(a === "accept" ? `${client.name} ya es cliente tuyo` : "Solicitud rechazada"),
      onError: (e) => toast(errorMessage(e), "error"),
    });
  return (
    <motion.li layout exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      {!compact && <Monogram name={client.name} size={32} className="bg-paper" />}
      <div className="min-w-0 flex-1 basis-[50%]">
        <p className="truncate text-sm font-medium">{client.name}</p>
        <p className="truncate text-[13px] text-ink-2">
          {client.email}, se registró {relativeTime(client.createdAt)}
        </p>
      </div>
      <div className="ml-auto flex gap-1">
        <Button size="sm" variant="quiet" disabled={act.isPending} onClick={() => run("reject")}>
          Rechazar
        </Button>
        <Button size="sm" loading={act.isPending && act.variables === "accept"} onClick={() => run("accept")}>
          Aceptar
        </Button>
      </div>
    </motion.li>
  );
}
