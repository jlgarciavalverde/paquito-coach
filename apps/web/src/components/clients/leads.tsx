import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@coach/shared";
import { api, errorMessage } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { leadsQuery } from "../../lib/public";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { NewClientPanel } from "./new-client-panel";

/** Personas que han escrito desde la página pública («Quiero empezar») y aún no tienen cuenta. */
export function LeadsBlock() {
  const leads = useQuery(leadsQuery).data ?? [];
  const [open, setOpen] = useState<Lead | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const handle = useMutation({
    mutationFn: (id: string) => api(`/leads/${id}/handle`, { body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: leadsQuery.queryKey }),
    onError: (e) => toast(errorMessage(e), "error"),
  });
  if (leads.length === 0) return null;
  return (
    <section aria-labelledby="leads-title" className="border-l-[5px] border-primary bg-primary-soft px-4 py-3.5">
      <h2 id="leads-title" className="text-sm font-medium text-ink">
        {leads.length === 1 ? "1 solicitud desde tu página" : `${leads.length} solicitudes desde tu página`}
      </h2>
      <ul className="mt-2 flex flex-col divide-y divide-rule">
        {leads.map((l) => (
          <li key={l.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {l.name} <span className="font-normal text-ink-2">· {relativeTime(l.createdAt)}</span>
              </p>
              <p className="text-[13px] break-words text-ink-2">
                <a className="text-primary underline underline-offset-4" href={`mailto:${l.email}`}>
                  {l.email}
                </a>
                {l.phone && (
                  <>
                    {", "}
                    <a className="text-primary underline underline-offset-4" href={`tel:${l.phone.replace(/\s/g, "")}`}>
                      {l.phone}
                    </a>
                  </>
                )}
              </p>
              {l.message && <p className="mt-1 text-[13.5px] whitespace-pre-line text-ink">«{l.message}»</p>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setOpen(l)}>
                Dar de alta
              </Button>
              <Button size="sm" variant="quiet" loading={handle.isPending && handle.variables === l.id} onClick={() => handle.mutate(l.id, { onSuccess: () => toast("Solicitud descartada") })}>
                Descartar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {open && (
        <NewClientPanel
          key={open.id}
          open
          onOpenChange={(o) => !o && setOpen(null)}
          initial={{ name: open.name, email: open.email, phone: open.phone, goal: open.message.slice(0, 300) }}
          onCreated={() => handle.mutate(open.id)}
        />
      )}
    </section>
  );
}
