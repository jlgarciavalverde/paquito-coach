import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { programDates, type Program } from "@coach/shared";
import { SidePanel } from "../ui/dialog";
import { Button } from "../ui/button";
import { Checkbox, Select, TextField } from "../ui/field";
import { useToast } from "../ui/toast";
import { FormError } from "../form-error";
import { clientsQuery } from "../../lib/queries";
import { programsQuery, useAssignProgram } from "../../lib/programs";
import { dayLong, isoDate, mondayOf, plusDays, today } from "../../lib/dates";
import { errorMessage } from "../../lib/api";

/** Aplicar un programa: desde la biblioteca (eligiendo clientes) o desde la ficha (eligiendo programa). */
export function ProgramAssignPanel({ program, clientId, onClose }: { program?: Program; clientId?: string; onClose: () => void }) {
  const toast = useToast();
  const list = useQuery({ ...programsQuery, enabled: !program });
  const active = useQuery({ ...clientsQuery("active"), enabled: !clientId });
  const noAccount = useQuery({ ...clientsQuery("no_account"), enabled: !clientId });
  const [pid, setPid] = useState(program?.id ?? "");
  const p = program ?? list.data?.find((x) => x.id === pid);
  const [selected, setSelected] = useState<string[]>(clientId ? [clientId] : []);
  const t = today();
  const [start, setStart] = useState(() => (mondayOf(new Date()).getTime() === new Date(`${t}T00:00:00`).getTime() ? t : plusDays(isoDate(mondayOf(new Date())), 7)));
  const assign = useAssignProgram(p?.id ?? "");
  const dates = useMemo(() => (p ? programDates(start, p.slots) : []), [p, start]);
  const pool = [...(active.data ?? []), ...(noAccount.data ?? [])];
  const submit = () =>
    assign.mutate(
      { clientIds: selected, start },
      { onSuccess: (r) => (toast(`${r.created} entrenos programados`), onClose()) },
    );
  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={program ? `Aplicar «${program.name}»` : "Aplicar un programa"}
      description="Se crean de golpe todos sus entrenos, con la subida de carga de cada semana. Luego puedes retocar cualquiera."
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={assign.isPending} disabled={!p || selected.length === 0 || dates.length === 0}>
            {dates.length && selected.length ? `Crear ${dates.length * selected.length} entrenos` : "Aplicar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {!program && (
          <Select label="Programa" value={pid} onChange={(e) => setPid(e.target.value)}>
            <option value="">Elige un programa…</option>
            {(list.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({x.weeks} {x.weeks === 1 ? "semana" : "semanas"})
              </option>
            ))}
          </Select>
        )}
        {!program && list.data?.length === 0 && <p className="text-sm text-ink-2">Aún no tienes programas. Créalos en Entrenos, pestaña Programas.</p>}
        {!clientId && (
          <fieldset>
            <legend className="mb-2 text-[13.5px] font-medium">Clientes</legend>
            <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-[var(--radius-control)] border border-rule p-3">
              {pool.map((c) => (
                <Checkbox key={c.id} label={c.name} checked={selected.includes(c.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
              ))}
            </div>
          </fieldset>
        )}
        <TextField label="Empieza" type="date" value={start} onChange={(e) => setStart(e.target.value)} hint="La semana 1 es la de ese día; lo anterior dentro de esa semana se salta." className="max-w-[240px]" />
        {p && dates.length > 0 && (
          <p className="text-sm text-ink-2">
            {dates.length} entrenos, del {dayLong(dates[0]!.date)} al {dayLong(dates.at(-1)!.date)}.
            {p.progression && ` La carga sube ${String(p.progression.step).replace(".", ",")} ${p.progression.kind === "kg" ? "kg" : "%"} cada semana.`}
          </p>
        )}
        <FormError message={assign.isError ? errorMessage(assign.error) : null} />
      </div>
    </SidePanel>
  );
}
