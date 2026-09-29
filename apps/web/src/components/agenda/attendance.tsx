import { useEffect, useState } from "react";
import { ATTENDANCE_LABEL, AttendanceStatus, type Appointment } from "@coach/shared";
import { useToast } from "../ui/toast";
import { useAttendance } from "../../lib/packs";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";

/** Asistencia de una cita con cliente: programada, hecha, no vino o cancelada (las dos del medio descuentan del bono). */
export function AttendanceControl({ appointment: a }: { appointment: Appointment }) {
  const m = useAttendance();
  const toast = useToast();
  const [status, setStatus] = useState(a.status);
  useEffect(() => setStatus(a.status), [a.status]);
  const set = (s: AttendanceStatus) => {
    const before = status;
    setStatus(s);
    m.mutate(
      { id: a.id, status: s },
      {
        onSuccess: (r) => toast(r.packId && (s === "done" || s === "no_show") ? `${ATTENDANCE_LABEL[s]}: descontada del bono` : ATTENDANCE_LABEL[s]),
        onError: (e) => (setStatus(before), toast(errorMessage(e), "error")),
      },
    );
  };
  return (
    <div>
      <p id={`att-${a.id}`} className="mb-1.5 text-[13.5px] font-medium">
        Asistencia
      </p>
      <div className="grid grid-cols-4 overflow-hidden rounded-[var(--radius-control)] border border-rule-strong" role="radiogroup" aria-labelledby={`att-${a.id}`}>
        {AttendanceStatus.options.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={status === s}
            onClick={() => set(s)}
            className={cn(
              "h-10 border-rule-strong text-[13px] font-medium not-first:border-l",
              status === s ? (s === "done" ? "bg-plate-green text-paper" : s === "scheduled" ? "bg-ink text-paper" : "bg-plate-red text-paper") : "text-ink-2 hover:bg-tray",
            )}
          >
            {ATTENDANCE_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Botón rápido para «Hoy»: marcar la cita como hecha (y deshacer). */
export function QuickDone({ appointment: a }: { appointment: Appointment }) {
  const m = useAttendance();
  if (!a.clientId || a.status === "cancelled") return null;
  if (a.status !== "scheduled")
    return (
      <button type="button" onClick={() => m.mutate({ id: a.id, status: "scheduled" })} className="text-[13px] text-ink-2 hover:text-ink" aria-label={`${ATTENDANCE_LABEL[a.status]}. Deshacer`}>
        <span className={cn("mr-1.5 inline-block h-3.5 w-[5px] rounded-[1.5px] align-[-2px]", a.status === "done" ? "bg-plate-green" : "bg-plate-red")} aria-hidden="true" />
        {ATTENDANCE_LABEL[a.status]}
      </button>
    );
  return (
    <button type="button" disabled={m.isPending} onClick={() => m.mutate({ id: a.id, status: "done" })} className="rounded-[var(--radius-control)] border border-rule-strong px-2.5 py-1 text-[13px] font-medium text-ink hover:bg-tray">
      Marcar hecha
    </button>
  );
}
