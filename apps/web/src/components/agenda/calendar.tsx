import { useEffect, useState, type ReactNode } from "react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { appointmentLabel, type Appointment, type Workout } from "@coach/shared";
import { dayShort, fromIso, plusDays, today } from "../../lib/dates";
import { atLocal, hhmm, localDate, minutesOf } from "../../lib/agenda";
import { cn } from "../../lib/cn";

export const DAY_START = 7 * 60;
export const DAY_END = 22 * 60;
const PX_PER_MIN = 0.8; // 48 px por hora
const SNAP = 15;

export type Layers = { appointments: boolean; workouts: boolean; meals: boolean };
export type CalendarData = {
  appointments: Appointment[];
  workouts: Workout[];
  /** Comidas por fecha (solo si hay un cliente elegido y la capa está activa). */
  mealsByDate?: Map<string, number>;
};
export type CalendarActions = {
  onOpenAppointment: (a: Appointment) => void;
  onOpenWorkout: (w: Workout) => void;
  onCreateAt: (date: string, minutes: number) => void;
  onMoveAppointment: (a: Appointment, date: string, minutes: number) => void;
  onMoveWorkout: (w: Workout, date: string) => void;
};

const workoutTone = (w: Workout, t: string) =>
  w.status === "done" ? "bg-plate-green" : w.status === "skipped" || w.date < t ? "bg-plate-red" : w.date === t ? "bg-plate-yellow" : "bg-primary";

function useDnd(data: CalendarData, actions: CalendarActions) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const over = e.over?.id ? String(e.over.id) : null;
    const [kind, id] = String(e.active.id).split(":");
    if (!over) return;
    const date = over.split(":")[1]!;
    if (kind === "a") {
      const a = data.appointments.find((x) => x.id === id);
      if (!a) return;
      const start = minutesOf(a.startsAt);
      // En la rejilla horaria, el desplazamiento vertical cambia la hora; en el mes o la franja de todo el día, solo el día.
      const minutes = over.startsWith("col:") ? Math.max(0, Math.min(24 * 60 - SNAP, start + Math.round(e.delta.y / PX_PER_MIN / SNAP) * SNAP)) : start;
      if (date !== localDate(a.startsAt) || minutes !== start) actions.onMoveAppointment(a, date, minutes);
    } else if (kind === "w") {
      const w = data.workouts.find((x) => x.id === id);
      if (w && w.date !== date) actions.onMoveWorkout(w, date);
    }
  };
  return { sensors, onDragEnd };
}

/** Botón que además se puede arrastrar (un solo control: nada de botones anidados). */
function DragButton({ id, children, className, style, onClick, label }: { id: string; children: ReactNode; className?: string; style?: React.CSSProperties; onClick: () => void; label: string }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onClick}
      aria-roledescription="elemento arrastrable"
      aria-label={label}
      style={{ ...style, ...(transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 30 } : {}) }}
      className={cn("touch-none", className, isDragging && "opacity-80 shadow-[var(--shadow-float)]")}
    >
      {children}
    </button>
  );
}

function Droppable({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "bg-primary-soft/60")}>
      {children}
    </div>
  );
}

function WorkoutChip({ w, t, onOpen }: { w: Workout; t: string; onOpen: () => void }) {
  return (
    <DragButton
      id={`w:${w.id}`}
      label={`Entreno ${w.title} de ${w.clientName}, ${dayShort(w.date)}`}
      onClick={onOpen}
      className="flex w-full items-center gap-1.5 rounded-[4px] bg-paper px-1.5 py-1 text-left text-[12px] leading-tight hover:bg-tray-2"
    >
      <span className={cn("h-3 w-[4px] shrink-0 rounded-[1px]", workoutTone(w, t))} aria-hidden="true" />
      <span className="min-w-0 truncate">
        <span className="font-medium text-ink">{w.clientName.split(" ")[0]}</span> <span className="text-ink-2">{w.title}</span>
      </span>
    </DragButton>
  );
}

/** Rejilla semanal de 7:00 a 22:00 con franja de «todo el día» (entrenos y comidas) arriba. */
export function WeekView({ days, data, layers, actions }: { days: string[]; data: CalendarData; layers: Layers; actions: CalendarActions }) {
  const t = today();
  const { sensors, onDragEnd } = useDnd(data, actions);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i);
  const height = (DAY_END - DAY_START) * PX_PER_MIN;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-rule">
            <div />
            {days.map((d) => (
              <div key={d} className={cn("px-2 pb-2 text-center", d === t ? "text-primary" : "text-ink-2")}>
                <span className="text-[12.5px] capitalize">{dayShort(d).split(" ")[0]}</span>
                <span className={cn("font-narrow ml-1 text-[18px]", d === t && "rounded-[4px] bg-primary px-1.5 text-primary-ink")}>{fromIso(d).getDate()}</span>
              </div>
            ))}
          </div>
          {(layers.workouts || layers.meals) && (
            <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-rule bg-tray">
              <div className="py-2 pr-1 text-right text-[11px] leading-tight text-ink-3">todo el día</div>
              {days.map((d) => (
                <Droppable key={d} id={`day:${d}`} className="flex min-h-10 flex-col gap-1 border-l border-rule p-1">
                  {layers.workouts && data.workouts.filter((w) => w.date === d).map((w) => <WorkoutChip key={w.id} w={w} t={t} onOpen={() => actions.onOpenWorkout(w)} />)}
                  {layers.meals && (data.mealsByDate?.get(d) ?? 0) > 0 && (
                    <span className="px-1.5 text-[12px] text-ink-2">{data.mealsByDate!.get(d)} comidas</span>
                  )}
                </Droppable>
              ))}
            </div>
          )}
          <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))]">
            <div className="relative" style={{ height }}>
              {hours.map((h) => (
                <span key={h} className="font-narrow absolute right-2 -translate-y-1/2 text-[12px] text-ink-3" style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }}>
                  {h}:00
                </span>
              ))}
            </div>
            {days.map((d) => (
              <Droppable key={d} id={`col:${d}`} className={cn("relative border-l border-rule", d === t && "bg-tray/60")}>
                <div
                  role="presentation"
                  style={{ height }}
                  className="relative cursor-copy"
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const y = e.nativeEvent.offsetY;
                    actions.onCreateAt(d, DAY_START + Math.floor(y / PX_PER_MIN / 30) * 30);
                  }}
                >
                  {hours.map((h) => (
                    <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-rule" style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }} />
                  ))}
                  {d === t && nowMin >= DAY_START && nowMin <= DAY_END && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 h-[2px] bg-plate-red" style={{ top: (nowMin - DAY_START) * PX_PER_MIN }} aria-hidden="true" />
                  )}
                  {layers.appointments &&
                    data.appointments
                      .filter((a) => localDate(a.startsAt) === d)
                      .map((a) => {
                        const s = Math.max(DAY_START, minutesOf(a.startsAt));
                        const dur = Math.max(20, (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000);
                        return (
                          <DragButton
                            key={a.id}
                            id={`a:${a.id}`}
                            label={`${appointmentLabel(a)}, ${dayShort(d)} de ${hhmm(a.startsAt)} a ${hhmm(a.endsAt)}`}
                            onClick={() => actions.onOpenAppointment(a)}
                            style={{ top: (s - DAY_START) * PX_PER_MIN, height: dur * PX_PER_MIN - 2 }}
                            className={cn(
                              "absolute inset-x-1 z-20 overflow-hidden rounded-[4px] border-l-[4px] px-1.5 py-1 text-left text-[12px] leading-tight",
                              a.clientId ? "border-primary bg-primary-soft text-primary-soft-ink" : "border-ink-3 bg-tray-2 text-ink",
                            )}
                          >
                            <span className="font-narrow block text-[13px]">
                              {hhmm(a.startsAt)}–{hhmm(a.endsAt)}
                            </span>
                            <span className="block truncate font-medium">{appointmentLabel(a)}</span>
                            {a.location && <span className="block truncate opacity-80">{a.location}</span>}
                          </DragButton>
                        );
                      })}
                </div>
              </Droppable>
            ))}
          </div>
        </div>
      </div>
    </DndContext>
  );
}

/** Mes: rejilla de semanas; cada día lista lo que tiene. Pulsar el número abre esa semana. */
export function MonthView({ weeks, month, data, layers, actions, onPickDay }: { weeks: string[][]; month: number; data: CalendarData; layers: Layers; actions: CalendarActions; onPickDay: (d: string) => void }) {
  const t = today();
  const { sensors, onDragEnd } = useDnd(data, actions);
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b border-rule text-[12.5px] text-ink-3">
            {["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"].map((d) => (
              <div key={d} className="px-2 pb-2">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((w) => (
            <div key={w[0]} className="grid grid-cols-7 border-b border-rule">
              {w.map((d) => {
                const appts = layers.appointments ? data.appointments.filter((a) => localDate(a.startsAt) === d) : [];
                const wos = layers.workouts ? data.workouts.filter((x) => x.date === d) : [];
                const items = appts.length + wos.length;
                const out = fromIso(d).getMonth() !== month;
                return (
                  <Droppable key={d} id={`day:${d}`} className={cn("flex min-h-[112px] flex-col gap-1 border-l border-rule p-1.5 first:border-l-0", out && "bg-tray/50", d === t && "bg-primary-soft/40")}>
                    <button
                      type="button"
                      onClick={() => onPickDay(d)}
                      className={cn("font-narrow self-start rounded-[4px] px-1 text-[15px] hover:bg-tray-2", out ? "text-ink-3" : "text-ink", d === t && "bg-primary text-primary-ink hover:bg-primary")}
                      aria-label={`Ver la semana del ${dayShort(d)}`}
                    >
                      {fromIso(d).getDate()}
                    </button>
                    {appts.slice(0, 3).map((a) => (
                      <DragButton
                        key={a.id}
                        id={`a:${a.id}`}
                        label={`${appointmentLabel(a)}, ${hhmm(a.startsAt)}`}
                        onClick={() => actions.onOpenAppointment(a)}
                        className="flex w-full gap-1 truncate rounded-[4px] bg-primary-soft px-1.5 py-0.5 text-left text-[12px] text-primary-soft-ink"
                      >
                        <span className="font-narrow">{hhmm(a.startsAt)}</span>
                        <span className="truncate">{appointmentLabel(a)}</span>
                      </DragButton>
                    ))}
                    {wos.slice(0, Math.max(0, 3 - appts.length)).map((x) => (
                      <WorkoutChip key={x.id} w={x} t={t} onOpen={() => actions.onOpenWorkout(x)} />
                    ))}
                    {items > 3 && (
                      <button type="button" onClick={() => onPickDay(d)} className="self-start px-1 text-[12px] text-ink-2 hover:underline">
                        y {items - 3} más
                      </button>
                    )}
                  </Droppable>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </DndContext>
  );
}

/** Lista por días (la vista por defecto en el móvil). */
export function ListView({ days, data, layers, actions }: { days: string[]; data: CalendarData; layers: Layers; actions: CalendarActions }) {
  const t = today();
  const rows = days
    .map((d) => ({
      d,
      appts: layers.appointments ? data.appointments.filter((a) => localDate(a.startsAt) === d) : [],
      wos: layers.workouts ? data.workouts.filter((w) => w.date === d) : [],
      meals: layers.meals ? (data.mealsByDate?.get(d) ?? 0) : 0,
    }))
    .filter((r) => r.appts.length || r.wos.length || r.meals || r.d === t);
  if (rows.length === 0) return <p className="py-6 text-ink-2">Nada en estas fechas.</p>;
  return (
    <div className="flex flex-col">
      {rows.map(({ d, appts, wos, meals }) => (
        <section key={d} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-rule py-3">
          <h3 className={cn("pt-0.5 text-[13.5px] capitalize", d === t ? "font-medium text-primary" : "text-ink-2")}>{d === t ? "hoy" : dayShort(d)}</h3>
          <ul className="flex min-w-0 flex-col gap-1.5">
            {appts.length + wos.length === 0 && !meals && <li className="text-sm text-ink-3">Nada</li>}
            {appts.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => actions.onOpenAppointment(a)} className="flex w-full min-w-0 items-baseline gap-3 text-left hover:text-primary">
                  <span className="font-narrow w-24 shrink-0 text-[15px] text-ink">
                    {hhmm(a.startsAt)}–{hhmm(a.endsAt)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-sm font-medium break-words">{appointmentLabel(a)}</span>
                    {a.location && <span className="block truncate text-[13px] text-ink-2">{a.location}</span>}
                  </span>
                </button>
              </li>
            ))}
            {wos.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => actions.onOpenWorkout(w)} className="flex w-full min-w-0 items-center gap-3 text-left text-sm hover:text-primary">
                  <span className="flex w-24 shrink-0 items-center gap-2 text-[13px] text-ink-2">
                    <span className={cn("h-3.5 w-[5px] rounded-[1.5px]", workoutTone(w, t))} aria-hidden="true" /> entreno
                  </span>
                  <span className="line-clamp-2 min-w-0 flex-1 break-words">
                    {w.clientName}: {w.title}
                  </span>
                </button>
              </li>
            ))}
            {meals > 0 && <li className="text-sm text-ink-2">{meals} comidas en su plan</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}

export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => plusDays(monday, i));
