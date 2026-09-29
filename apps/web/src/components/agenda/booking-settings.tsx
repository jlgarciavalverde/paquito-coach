import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash } from "@phosphor-icons/react";
import type { BookingSettings, BookingWindow } from "@coach/shared";
import { Button, IconButton } from "../ui/button";
import { Checkbox, Select, TextField, controlClass } from "../ui/field";
import { BlockTitle } from "../ui/layout";
import { Skeleton } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { FormError } from "../form-error";
import { bookingSettingsQuery, useSaveBookingSettings } from "../../lib/booking";
import { WEEKDAYS } from "../../lib/dates";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";

/** Ajustes → Reservas: cuándo pueden reservar los clientes, cuánto dura cada hueco, plazas y antelación. */
export function BookingSettingsBlock() {
  const q = useQuery(bookingSettingsQuery);
  if (q.isPending) return <Skeleton className="h-40" />;
  return <Form key={JSON.stringify(q.data)} initial={q.data!} />;
}

function Form({ initial }: { initial: BookingSettings }) {
  const save = useSaveBookingSettings();
  const toast = useToast();
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const setW = (i: number, patch: Partial<BookingWindow>) => setF((s) => ({ ...s, windows: s.windows.map((w, j) => (j === i ? { ...w, ...patch } : w)) }));
  const addW = () => {
    const last = f.windows.at(-1);
    setF((s) => ({ ...s, windows: [...s.windows, last ? { ...last, weekday: (last.weekday % 7) + 1 } : { weekday: 1, start: "09:00", end: "13:00" }] }));
  };
  const invalid = f.windows.some((w) => w.end <= w.start);
  return (
    <section aria-labelledby="bk-title">
      <BlockTitle id="bk-title">Reservas</BlockTitle>
      <p className="mb-4 max-w-[56ch] text-sm text-ink-2">Tus clientes reservan y cancelan sus sesiones desde la app, en los huecos que dejes libres. Te llega un aviso con cada una.</p>
      <div className="flex flex-col gap-5">
        <Checkbox label="Permitir que los clientes reserven" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
        <fieldset disabled={!f.enabled} className="flex flex-col gap-5 disabled:opacity-60">
          <div>
            <p className="mb-2 text-[13.5px] font-medium">Horario en el que se puede reservar</p>
            <ul className="flex flex-col gap-2">
              {f.windows.map((w, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 sm:w-fit sm:grid-cols-[150px_140px_auto_140px_auto]">
                  <select value={w.weekday} onChange={(e) => setW(i, { weekday: Number(e.target.value) })} aria-label={`Día de la franja ${i + 1}`} className={cn(controlClass, "h-10")}>
                    {WEEKDAYS.map((d) => (
                      <option key={d.n} value={d.n}>
                        {d.long}
                      </option>
                    ))}
                  </select>
                  <input type="time" step={900} value={w.start} onChange={(e) => setW(i, { start: e.target.value })} aria-label={`Desde, franja ${i + 1}`} className={cn(controlClass, "h-10")} />
                  <span className="text-sm text-ink-2">a</span>
                  <input type="time" step={900} value={w.end} onChange={(e) => setW(i, { end: e.target.value })} aria-label={`Hasta, franja ${i + 1}`} className={cn(controlClass, "h-10", w.end <= w.start && "border-plate-red")} />
                  <IconButton label={`Quitar franja ${i + 1}`} onClick={() => setF((s) => ({ ...s, windows: s.windows.filter((_, j) => j !== i) }))}>
                    <Trash size={16} />
                  </IconButton>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="quiet" className="mt-2" icon={<Plus size={14} weight="bold" />} onClick={addW}>
              Añadir franja
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Select label="Cada sesión" value={String(f.slotMinutes)} onChange={(e) => setF({ ...f, slotMinutes: Number(e.target.value) })}>
              {[30, 45, 60, 75, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
            <TextField label="Plazas" type="number" min={1} max={20} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
            <TextField label="Reservar con" aside="h antes" type="number" min={0} max={72} value={f.noticeHours} onChange={(e) => setF({ ...f, noticeHours: Math.max(0, Math.min(72, Number(e.target.value) || 0)) })} />
            <TextField label="Cancelar hasta" aside="h antes" type="number" min={0} max={72} value={f.cancelHours} onChange={(e) => setF({ ...f, cancelHours: Math.max(0, Math.min(72, Number(e.target.value) || 0)) })} />
          </div>
          <TextField label="Lugar" aside="opcional" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Estudio, calle Mayor 3" />
        </fieldset>
        <FormError message={save.isError ? errorMessage(save.error) : invalid ? "Alguna franja termina antes de empezar." : null} />
        <Button className="self-start" disabled={!dirty || invalid} loading={save.isPending} onClick={() => save.mutate(f, { onSuccess: () => toast("Reservas guardadas") })}>
          Guardar reservas
        </Button>
      </div>
    </section>
  );
}
