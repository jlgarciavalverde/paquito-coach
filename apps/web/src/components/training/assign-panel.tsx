import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { applyProgression, weekIndex, type Progression, type Routine } from "@coach/shared";
import { SidePanel } from "../ui/dialog";
import { Button } from "../ui/button";
import { Checkbox, Select, TextField } from "../ui/field";
import { useToast } from "../ui/toast";
import { FormError } from "../form-error";
import { clientsQuery } from "../../lib/queries";
import { routinesQuery, useAssign } from "../../lib/training";
import { WEEKDAYS, dayShort, planDates, today } from "../../lib/dates";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";

/**
 * Asignar una rutina: a qué clientes y qué días (desde una fecha, ciertos días de la semana, N semanas).
 * Se usa desde la rutina (clientes libres) o desde la ficha de un cliente (rutina libre).
 */
export function AssignPanel({
  open,
  onOpenChange,
  routine,
  clientId,
  routineId: initialRoutineId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  routine?: Routine;
  clientId?: string;
  /** Rutina preseleccionada (sigue pudiendo cambiarse). */
  routineId?: string;
}) {
  const toast = useToast();
  const routines = useQuery({ ...routinesQuery, enabled: open && !routine });
  const clients = useQuery({ ...clientsQuery("active"), enabled: open && !clientId });
  const noAccount = useQuery({ ...clientsQuery("no_account"), enabled: open && !clientId });
  const [routineId, setRoutineId] = useState(routine?.id ?? initialRoutineId ?? "");
  const [selected, setSelected] = useState<string[]>(clientId ? [clientId] : []);
  const [start, setStart] = useState(today());
  const [days, setDays] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(1);
  const [prog, setProg] = useState<"none" | Progression["kind"]>("none");
  const [step, setStep] = useState("2,5");
  const rid = routine?.id ?? routineId;
  const assign = useAssign(rid);

  const dates = useMemo(() => (days.length ? planDates(start, days, weeks) : [start]), [start, days, weeks]);
  const pool = [...(clients.data ?? []), ...(noAccount.data ?? [])];
  const total = dates.length * selected.length;
  const stepN = Number(step.replace(",", "."));
  const progression: Progression | null = prog !== "none" && stepN >= 0.5 && stepN <= 20 ? { kind: prog, step: stepN } : null;
  const lastWeek = dates.length ? weekIndex(dates[0]!, dates.at(-1)!) : 0;
  const chosen = routine ?? routines.data?.find((r) => r.id === rid);
  const preview =
    progression && chosen && lastWeek > 0
      ? chosen.blocks
          .flatMap((b) => b.items)
          .map((it, i) => ({ name: it.exerciseName, from: it.load, to: applyProgression(chosen.blocks, lastWeek, progression).flatMap((b) => b.items)[i]!.load }))
          .filter((x) => x.from !== x.to)
      : [];

  const submit = () =>
    assign.mutate(
      { clientIds: selected, dates, progression: lastWeek > 0 ? progression : null },
      {
        onSuccess: (r) => {
          toast(r.created === 1 ? "Entreno asignado" : `${r.created} entrenos asignados`);
          onOpenChange(false);
        },
      },
    );

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={routine ? `Asignar «${routine.name}»` : "Asignar una rutina"}
      description="Cada cliente recibe una copia: si luego cambias la rutina, lo ya asignado no se toca."
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={assign.isPending} disabled={!rid || selected.length === 0 || dates.length === 0}>
            {total <= 1 ? "Asignar" : `Asignar ${total} entrenos`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {!routine && (
          <Select label="Rutina" value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
            <option value="">Elige una rutina…</option>
            {(routines.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.exerciseCount} ejercicios)
              </option>
            ))}
          </Select>
        )}
        {!routine && routines.data?.length === 0 && <p className="text-sm text-ink-2">Aún no tienes rutinas. Créalas en Entrenos.</p>}

        {!clientId && (
          <fieldset>
            <legend className="mb-2 text-[13.5px] font-medium">Clientes</legend>
            {pool.length === 0 ? (
              <p className="text-sm text-ink-2">No tienes clientes activos todavía.</p>
            ) : (
              <div className="flex max-h-60 flex-col gap-2 overflow-y-auto rounded-[var(--radius-control)] border border-rule p-3">
                {pool.map((c) => (
                  <Checkbox
                    key={c.id}
                    label={c.name}
                    description={c.status === "no_account" ? "Sin cuenta: lo verás tú, no él" : undefined}
                    checked={selected.includes(c.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                  />
                ))}
              </div>
            )}
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-[13.5px] font-medium">Cuándo</legend>
          <TextField label={days.length ? "Desde" : "Día"} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <div>
            <p className="mb-1.5 text-[13.5px] text-ink-2">Repetir los días</p>
            <div className="grid grid-cols-7 gap-1" role="group" aria-label="Días de la semana">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d.n);
                return (
                  <button
                    key={d.n}
                    type="button"
                    aria-pressed={on}
                    aria-label={d.long}
                    onClick={() => setDays((s) => (on ? s.filter((x) => x !== d.n) : [...s, d.n]))}
                    className={cn("h-10 rounded-[var(--radius-control)] text-sm font-medium", on ? "bg-primary text-primary-ink" : "bg-tray text-ink-2 hover:bg-tray-2")}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>
          {days.length > 0 && (
            <TextField label="Durante" type="number" min={1} max={16} aside="semanas" value={weeks} onChange={(e) => setWeeks(Math.max(1, Math.min(16, Number(e.target.value) || 1)))} className="max-w-[160px]" />
          )}
          {lastWeek > 0 && (
            <div className="flex flex-col gap-3 border-t border-rule pt-4">
              <Select label="Carga" value={prog} onChange={(e) => setProg(e.target.value as typeof prog)}>
                <option value="none">La misma todas las semanas</option>
                <option value="kg">Subir kilos cada semana</option>
                <option value="pct">Subir un porcentaje cada semana</option>
              </Select>
              {prog !== "none" && (
                <TextField label="Cuánto" inputMode="decimal" aside={prog === "kg" ? "kg por semana" : "% por semana"} value={step} onChange={(e) => setStep(e.target.value)} className="max-w-[200px]" />
              )}
              {prog !== "none" &&
                (preview.length > 0 ? (
                  <div className="text-[13.5px]">
                    <p className="text-ink-2">Última semana:</p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {preview.map((x) => (
                        <li key={x.name} className="flex justify-between gap-3">
                          <span className="truncate">{x.name}</span>
                          <span className="font-narrow tabular shrink-0">
                            {x.from} a {x.to}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  chosen && <p className="text-[13.5px] text-ink-2">Esta rutina no tiene cargas en kilos: se asignará igual cada semana.</p>
                ))}
            </div>
          )}
          <div>
            <p className="text-[13.5px] text-ink-2">{dates.length === 1 ? "1 día:" : `${dates.length} días:`}</p>
            <p className="font-narrow mt-1 text-[15px] leading-relaxed text-ink">{dates.map(dayShort).join(", ") || "—"}</p>
          </div>
        </fieldset>
        <FormError message={assign.isError ? errorMessage(assign.error) : null} />
      </div>
    </SidePanel>
  );
}
