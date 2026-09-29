import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { APPOINTMENT_KIND_LABEL, type Appointment, type AppointmentKind } from "@coach/shared";
import { SidePanel } from "../ui/dialog";
import { Button } from "../ui/button";
import { Select, TextArea, TextField } from "../ui/field";
import { useToast } from "../ui/toast";
import { useConfirm } from "../ui/confirm";
import { AttendanceControl } from "./attendance";
import { FormError } from "../form-error";
import { clientsQuery } from "../../lib/queries";
import { atLocal, localDate, minutesOf, useAppointmentMutation } from "../../lib/agenda";
import { errorMessage } from "../../lib/api";

export type AppointmentDraft = { date: string; minutes: number; clientId?: string | null };

const DURATIONS = [30, 45, 60, 75, 90, 120];
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Crear o editar una cita (también es la alternativa accesible a arrastrar en el calendario). */
export function AppointmentPanel({ appointment, draft, onClose }: { appointment?: Appointment | null; draft?: AppointmentDraft | null; onClose: () => void }) {
  const open = Boolean(appointment || draft);
  const toast = useToast();
  const m = useAppointmentMutation();
  const ask = useConfirm();
  const active = useQuery({ ...clientsQuery("active"), enabled: open }).data ?? [];
  const noAccount = useQuery({ ...clientsQuery("no_account"), enabled: open }).data ?? [];
  const [f, setF] = useState({ clientId: "", kind: "session" as AppointmentKind, title: "", date: "", time: "09:00", duration: 60, location: "", notes: "" });

  useEffect(() => {
    if (appointment)
      setF({
        clientId: appointment.clientId ?? "",
        kind: appointment.kind,
        title: appointment.title,
        date: localDate(appointment.startsAt),
        time: toTime(minutesOf(appointment.startsAt)),
        duration: Math.round((new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60000),
        location: appointment.location,
        notes: appointment.notes,
      });
    else if (draft) setF({ clientId: draft.clientId ?? "", kind: "session", title: "", date: draft.date, time: toTime(draft.minutes), duration: 60, location: "", notes: "" });
  }, [appointment, draft]);

  const save = () => {
    const start = fromTime(f.time);
    const body = {
      clientId: f.clientId || null,
      kind: f.kind,
      title: f.title,
      startsAt: atLocal(f.date, start),
      endsAt: atLocal(f.date, start + f.duration),
      location: f.location,
      notes: f.notes,
    };
    m.mutate({ id: appointment?.id, body }, { onSuccess: () => (toast(appointment ? "Cita guardada" : "Cita creada"), onClose()) });
  };
  const durations = DURATIONS.includes(f.duration) ? DURATIONS : [...DURATIONS, f.duration].sort((a, b) => a - b);

  return (
    <SidePanel
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={appointment ? "Editar cita" : "Nueva cita"}
      footer={
        <>
          {appointment && (
            <Button variant="danger" className="sm:mr-auto" onClick={async () => (await ask({ title: "Borrar esta cita", body: "Desaparece de tu agenda y de la del cliente.", confirm: "Borrar cita", danger: true })) && m.mutate({ id: appointment.id, remove: true }, { onSuccess: () => (toast("Cita borrada"), onClose()) })}>
              Borrar cita
            </Button>
          )}
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={m.isPending} disabled={!f.date || !f.time}>
            {appointment ? "Guardar cita" : "Crear cita"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {appointment?.clientId && <AttendanceControl appointment={appointment} />}
        <Select label="Cliente" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
          <option value="">Sin cliente</option>
          {[...active, ...noAccount].map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Tipo" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as AppointmentKind })}>
            {(Object.keys(APPOINTMENT_KIND_LABEL) as AppointmentKind[]).map((k) => (
              <option key={k} value={k}>
                {APPOINTMENT_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
          <TextField label="Título" aside="opcional" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={f.clientId ? "" : "Formación, reunión…"} />
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-3">
          <TextField label="Día" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <TextField label="Hora" type="time" step={300} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className="w-32" />
          <Select label="Duración" value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })} className="w-28">
            {durations.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </Select>
        </div>
        <TextField label="Lugar" aside="opcional" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Estudio, a domicilio, online…" />
        <TextArea label="Notas internas" aside="el cliente no las ve" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <FormError message={m.isError ? errorMessage(m.error) : null} />
      </div>
    </SidePanel>
  );
}
