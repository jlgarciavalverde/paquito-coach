import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CaretLeft, CaretRight, Plus } from "@phosphor-icons/react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { z } from "zod";
import { mealsFor, type Appointment, type Workout } from "@coach/shared";
import { Button, IconButton } from "../../components/ui/button";
import { useToast } from "../../components/ui/toast";
import { ListView, MonthView, WeekView, weekDays, type CalendarActions, type Layers } from "../../components/agenda/calendar";
import { AppointmentPanel, type AppointmentDraft } from "../../components/agenda/appointment-panel";
import { WorkoutPanel } from "../../components/training/workout-panel";
import { appointmentsQuery, atLocal, useAppointmentMutation } from "../../lib/agenda";
import { clientsQuery } from "../../lib/queries";
import { clientWorkoutsQuery, studioWorkoutsQuery } from "../../lib/training";
import { clientPlanQuery } from "../../lib/nutrition";
import { fromIso, isoDate, mondayOf, plusDays, today, weekLabel } from "../../lib/dates";
import { api, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useDocumentTitle } from "../../lib/title";
import { QueryError } from "../../components/ui/query-state";
import { RadioGroup } from "../../components/ui/radio-group";

const View = z.enum(["semana", "mes", "lista"]);
export const Route = createFileRoute("/coach/calendario")({
  validateSearch: z.object({ vista: View.optional(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), cliente: z.string().uuid().optional() }),
  component: Agenda,
});

const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

function Agenda() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const view = search.vista ?? (isNarrow() ? "lista" : "semana");
  const anchor = search.fecha ?? today();
  const clientId = search.cliente;
  const set = (p: Partial<{ vista: z.infer<typeof View>; fecha: string; cliente: string | undefined }>) => navigate({ search: (s) => ({ ...s, ...p }), replace: true });
  const [layers, setLayers] = useState<Layers>({ appointments: true, workouts: true, meals: true });
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const move = useAppointmentMutation();

  // Rango visible
  const monday = isoDate(mondayOf(fromIso(anchor)));
  const monthStart = startOfMonth(fromIso(anchor));
  const gridStart = isoDate(mondayOf(monthStart));
  const gridEnd = plusDays(isoDate(mondayOf(endOfMonth(monthStart))), 6);
  const [from, to] = view === "mes" ? [gridStart, gridEnd] : view === "lista" ? [anchor, plusDays(anchor, 13)] : [monday, plusDays(monday, 6)];
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = from; d <= to; d = plusDays(d, 1)) out.push(d);
    return out;
  }, [from, to]);

  const clients = useQuery(clientsQuery()).data ?? [];
  const appts = useQuery(appointmentsQuery(from, plusDays(to, 1), clientId));
  const studioWorkouts = useQuery({ ...studioWorkoutsQuery(from, to), enabled: !clientId });
  const clientWorkouts = useQuery({ ...clientWorkoutsQuery(clientId ?? "", from, to), enabled: Boolean(clientId) });
  const plan = useQuery({ ...clientPlanQuery(clientId ?? ""), enabled: Boolean(clientId) });
  const workouts = (clientId ? clientWorkouts.data : studioWorkouts.data) ?? [];
  const mealsByDate = useMemo(() => {
    if (!plan.data) return undefined;
    return new Map(days.map((d) => [d, mealsFor(plan.data!, fromIso(d).getDay()).length]));
  }, [plan.data, days]);

  const actions: CalendarActions = {
    onOpenAppointment: setAppt,
    onOpenWorkout: (w) => setWorkoutId(w.id),
    onCreateAt: (date, minutes) => setDraft({ date, minutes, clientId: clientId ?? null }),
    onMoveAppointment: (a: Appointment, date: string, minutes: number) => {
      const dur = new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime();
      const startsAt = atLocal(date, minutes);
      const endsAt = new Date(new Date(startsAt).getTime() + dur).toISOString();
      // Movimiento optimista: se ve en su sitio nuevo al soltar.
      qc.setQueriesData<Appointment[]>({ queryKey: ["appointments"] }, (old) => old?.map((x) => (x.id === a.id ? { ...x, startsAt, endsAt } : x)));
      move.mutate({ id: a.id, body: { startsAt, endsAt } }, { onSuccess: () => toast("Cita movida"), onError: (e) => toast(errorMessage(e), "error") });
    },
    onMoveWorkout: (w: Workout, date: string) => {
      qc.setQueriesData<Workout[]>({ queryKey: ["workouts"] }, (old) => (Array.isArray(old) ? old.map((x) => (x.id === w.id ? { ...x, date } : x)) : old));
      api(`/workouts/${w.id}`, { method: "PATCH", body: { date } })
        .then(() => toast("Entreno movido"))
        .catch((e) => toast(errorMessage(e), "error"))
        .finally(() => qc.invalidateQueries({ queryKey: ["workouts"] }));
    },
  };

  const step = (n: number) => set({ fecha: view === "mes" ? isoDate(new Date(monthStart.getFullYear(), monthStart.getMonth() + n, 1)) : plusDays(anchor, n * (view === "lista" ? 14 : 7)) });
  const title =
    view === "mes" ? format(monthStart, "MMMM 'de' yyyy", { locale: es }) : view === "semana" ? weekLabel(monday) : `Del ${format(fromIso(from), "d 'de' MMMM", { locale: es })} al ${format(fromIso(to), "d 'de' MMMM", { locale: es })}`;
  const weeks = useMemo(() => (view === "mes" ? Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7)) : []), [view, days]);
  const client = clients.find((c) => c.id === clientId);
  useDocumentTitle("Agenda");

  return (
    <>
      <header className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-wide text-[30px] leading-[1.1] first-letter:uppercase sm:text-[34px]">{title}</h1>
          <p className="mt-1 text-ink-2">{client ? `Agenda de ${client.name}` : "Todas tus citas y los entrenos de tus clientes"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center">
            <IconButton label="Anterior" onClick={() => step(-1)}>
              <CaretLeft size={16} />
            </IconButton>
            <Button variant="quiet" size="sm" onClick={() => set({ fecha: undefined })}>
              Hoy
            </Button>
            <IconButton label="Siguiente" onClick={() => step(1)}>
              <CaretRight size={16} />
            </IconButton>
          </div>
          <RadioGroup className="inline-flex rounded-[var(--radius-control)] border border-rule-strong p-0.5" aria-label="Vista">
            {(["semana", "mes", "lista"] as const).map((v) => (
              <button key={v} role="radio" aria-checked={view === v} onClick={() => set({ vista: v })} className={cn("h-8 rounded-[4px] px-3 text-sm font-medium capitalize", view === v ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}>
                {v}
              </button>
            ))}
          </RadioGroup>
          <Button icon={<Plus size={16} weight="bold" />} onClick={() => setDraft({ date: anchor < today() ? today() : anchor, minutes: 9 * 60, clientId: clientId ?? null })}>
            Nueva cita
          </Button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-rule py-2.5 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-ink-2">Cliente</span>
          <select value={clientId ?? ""} onChange={(e) => set({ cliente: e.target.value || undefined })} className="h-8 rounded-[var(--radius-control)] border border-rule-strong bg-paper px-2 text-sm">
            <option value="">Todos</option>
            {clients
              .filter((c) => c.status !== "pending")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="sr-only">Capas</legend>
          {(
            [
              ["appointments", "Citas", "bg-primary"],
              ["workouts", "Entrenos", "bg-plate-green"],
              ["meals", "Comidas", "bg-plate-yellow"],
            ] as const
          ).map(([k, l, c]) => (
            <label key={k} className={cn("flex items-center gap-2", k === "meals" && !clientId && "opacity-50")} title={k === "meals" && !clientId ? "Elige un cliente para ver sus comidas" : undefined}>
              <input type="checkbox" checked={layers[k]} disabled={k === "meals" && !clientId} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} className="accent-[var(--primary)]" />
              <span className={cn("h-3.5 w-[5px] rounded-[1.5px]", c)} aria-hidden="true" />
              {l}
            </label>
          ))}
        </fieldset>
        <span className="ml-auto hidden text-[13px] text-ink-3 lg:inline">Arrastra citas y entrenos para cambiarlos de día u hora. Pulsa un hueco para crear una cita.</span>
      </div>

      {(appts.isError || studioWorkouts.isError || clientWorkouts.isError) && (
        <QueryError compact className="mb-3" q={appts.isError ? appts : studioWorkouts.isError ? studioWorkouts : clientWorkouts} />
      )}
      {view === "semana" && <WeekView days={weekDays(monday)} data={{ appointments: appts.data ?? [], workouts, mealsByDate }} layers={{ ...layers, meals: layers.meals && Boolean(clientId) }} actions={actions} />}
      {view === "mes" && (
        <MonthView weeks={weeks} month={monthStart.getMonth()} data={{ appointments: appts.data ?? [], workouts }} layers={layers} actions={actions} onPickDay={(d) => set({ vista: "semana", fecha: d })} />
      )}
      {view === "lista" && <ListView days={days} data={{ appointments: appts.data ?? [], workouts, mealsByDate }} layers={{ ...layers, meals: layers.meals && Boolean(clientId) }} actions={actions} />}

      <AppointmentPanel appointment={appt} draft={draft} onClose={() => (setAppt(null), setDraft(null))} />
      <WorkoutPanel id={workoutId} onClose={() => setWorkoutId(null)} />
    </>
  );
}
