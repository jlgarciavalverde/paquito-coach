import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CHECKIN_EVERY, everyLabel, type CheckinForm } from "@coach/shared";
import { SidePanel } from "../ui/dialog";
import { Button } from "../ui/button";
import { Checkbox, Select, TextField } from "../ui/field";
import { useToast } from "../ui/toast";
import { FormError } from "../form-error";
import { checkinFormsQuery, useAssignCheckin } from "../../lib/followup";
import { clientsQuery } from "../../lib/queries";
import { dayLong, today } from "../../lib/dates";
import { errorMessage } from "../../lib/api";

/** Pedir un check-in periódico: desde el formulario (a varios clientes) o desde la ficha (eligiendo formulario). */
export function AssignCheckinPanel({ form, clientId, onClose }: { form?: CheckinForm; clientId?: string; onClose: () => void }) {
  const toast = useToast();
  const forms = useQuery({ ...checkinFormsQuery, enabled: !form });
  const clients = useQuery({ ...clientsQuery("active"), enabled: !clientId });
  const [formId, setFormId] = useState(form?.id ?? "");
  const [selected, setSelected] = useState<string[]>(clientId ? [clientId] : []);
  const [every, setEvery] = useState<number>(7);
  const [start, setStart] = useState(today());
  const m = useAssignCheckin();
  const fid = form?.id ?? formId;
  const submit = () =>
    m.mutate(
      { formId: fid, body: { clientIds: selected, everyDays: every, start } },
      { onSuccess: (r) => (toast(r.assigned === 1 ? "Check-in programado" : `Check-in programado a ${r.assigned} clientes`), onClose()) },
    );
  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={form ? `Pedir «${form.name}»` : "Pedir un check-in"}
      description="Le aparecerá en su pantalla de Hoy el día que toque, con un aviso en el móvil."
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={m.isPending} disabled={!fid || selected.length === 0}>
            Programar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {!form && (
          <Select label="Formulario" value={formId} onChange={(e) => setFormId(e.target.value)}>
            <option value="">Elige un formulario…</option>
            {(forms.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.questions.length} preguntas)
              </option>
            ))}
          </Select>
        )}
        {!form && forms.data?.length === 0 && <p className="text-sm text-ink-2">Aún no tienes formularios. Créalos en Seguimiento.</p>}
        {!clientId && (
          <fieldset>
            <legend className="mb-2 text-[13.5px] font-medium">Clientes</legend>
            {(clients.data ?? []).length === 0 ? (
              <p className="text-sm text-ink-2">Solo se puede pedir a clientes con cuenta activa.</p>
            ) : (
              <div className="flex max-h-60 flex-col gap-2 overflow-y-auto rounded-[var(--radius-control)] border border-rule p-3">
                {clients.data!.map((c) => (
                  <Checkbox key={c.id} label={c.name} checked={selected.includes(c.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
                ))}
              </div>
            )}
          </fieldset>
        )}
        <Select label="Cada cuánto" value={String(every)} onChange={(e) => setEvery(Number(e.target.value))}>
          {CHECKIN_EVERY.map((d) => (
            <option key={d} value={d}>
              {everyLabel(d).replace(/^./, (c) => c.toUpperCase())}
            </option>
          ))}
        </Select>
        <TextField label="El primero" type="date" min={today()} value={start} onChange={(e) => setStart(e.target.value)} hint={start ? `${dayLong(start)}; después, ${everyLabel(every)}.` : undefined} className="max-w-[260px]" />
        <FormError message={m.isError ? errorMessage(m.error) : null} />
      </div>
    </SidePanel>
  );
}
