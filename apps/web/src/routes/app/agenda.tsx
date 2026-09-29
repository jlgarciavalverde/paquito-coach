import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { appointmentLabel } from "@coach/shared";
import { PageTitle } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { WorkoutStatusMark } from "../../components/training/workout-status";
import { hhmm, localDate, myAppointmentsQuery } from "../../lib/agenda";
import { myWorkoutsQuery } from "../../lib/training";
import { dayShort, plusDays, today } from "../../lib/dates";
import { cn } from "../../lib/cn";
import { z } from "zod";
import { Simulated } from "../../components/payments/simulated";
import { buttonClass } from "../../components/ui/button";
import { useToast } from "../../components/ui/toast";
import { useConfirm } from "../../components/ui/confirm";
import { myBookingQuery, useCancelMine } from "../../lib/booking";
import { errorMessage } from "../../lib/api";
import { myPacksQuery } from "../../lib/packs";
import { packUsable } from "@coach/shared";

export const Route = createFileRoute("/app/agenda")({
  validateSearch: z.object({ pago: z.string().optional(), simulado: z.string().optional() }),
  component: MyAgenda,
});

/** Agenda del cliente: sus sesiones con el entrenador y sus entrenos, en lista por días (dos semanas). */
function MyAgenda() {
  const t = today();
  const to = plusDays(t, 13);
  const appts = useQuery(myAppointmentsQuery(t, plusDays(to, 1)));
  const workouts = useQuery(myWorkoutsQuery(t, to));
  const days = Array.from({ length: 14 }, (_, i) => plusDays(t, i));
  const { pago, simulado } = Route.useSearch();
  const booking = useQuery(myBookingQuery(t, 1));
  const cancel = useCancelMine();
  const toast = useToast();
  const ask = useConfirm();
  if (appts.isPending || workouts.isPending) return <Skeleton className="h-64" />;
  const rows = days
    .map((d) => ({ d, a: (appts.data ?? []).filter((x) => localDate(x.startsAt) === d), w: (workouts.data ?? []).filter((x) => x.date === d) }))
    .filter((r) => r.a.length || r.w.length || r.d === t);
  return (
    <>
      <PageTitle
        title="Agenda"
        lead="Tus sesiones y entrenos de las próximas dos semanas."
        actions={booking.data?.enabled ? <Link to="/app/reservar" className={buttonClass("primary")}>Reservar sesión</Link> : undefined}
      />
      {simulado && <Simulated checkoutId={simulado} />}
      {pago === "ok" && !simulado && <p className="mb-6 border-l-[5px] border-plate-green bg-tray px-4 py-3 text-sm">Pago hecho: tu sesión queda reservada.</p>}
      <MyPacks />
      <div className="border-t border-rule">
        {rows.map(({ d, a, w }) => (
          <section key={d} className="grid grid-cols-[64px_1fr] gap-3 border-b border-rule py-3">
            <h2 className={cn("pt-0.5 text-[13.5px] capitalize", d === t ? "font-medium text-primary" : "text-ink-2")}>{d === t ? "hoy" : dayShort(d)}</h2>
            <ul className="flex flex-col gap-2">
              {a.length + w.length === 0 && <li className="text-sm text-ink-3">Nada previsto</li>}
              {a.map((x) => (
                <li key={x.id} className="flex items-baseline gap-3">
                  <span className="font-narrow w-24 shrink-0 text-[15px]">
                    {hhmm(x.startsAt)}–{hhmm(x.endsAt)}
                  </span>
                  <span className={cn("min-w-0 flex-1 text-sm", x.status === "cancelled" && "text-ink-3 line-through")}>
                    <span className="block font-medium">{x.title || appointmentLabel({ ...x, clientName: null })}</span>
                    {x.location && <span className="block text-ink-2">{x.location}</span>}
                  </span>
                  {x.status === "scheduled" && new Date(x.startsAt) > new Date() && booking.data && (
                    <button
                      type="button"
                      className="shrink-0 text-[13px] text-ink-2 underline underline-offset-2 hover:text-plate-red"
                      onClick={async () =>
                        new Date(x.startsAt).getTime() - Date.now() < booking.data!.cancelHours * 3600_000
                          ? toast(`Faltan menos de ${booking.data!.cancelHours} h: escribe a tu entrenador para cambiarla.`, "error")
                          : (await ask({ title: "Cancelar la sesión", body: `${dayShort(localDate(x.startsAt))} a las ${hhmm(x.startsAt)}. Tu entrenador recibirá un aviso.`, confirm: "Cancelar sesión", danger: true })) &&
                            cancel.mutate(x.id, { onSuccess: () => toast("Sesión cancelada"), onError: (e) => toast(errorMessage(e), "error") })
                      }
                    >
                      Cancelar
                    </button>
                  )}
                </li>
              ))}
              {w.map((x) => (
                <li key={x.id}>
                  <Link to="/app/entreno/$workoutId" params={{ workoutId: x.id }} className="flex items-center justify-between gap-3 text-sm hover:text-primary">
                    <span>Entreno: {x.title}</span>
                    <WorkoutStatusMark w={x} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** Su bono en uso: cuántas sesiones le quedan y hasta cuándo. */
function MyPacks() {
  const q = useQuery(myPacksQuery);
  const t = today();
  const p = (q.data ?? []).find((x) => packUsable(x, t)) ?? (q.data ?? []).at(-1);
  if (!p) return null;
  return (
    <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-zone)] bg-tray px-4 py-3 text-sm">
      <span className="font-medium">{p.name}</span>
      <span className="text-ink-2">
        {p.remaining === 0 ? "Agotado: puedes renovarlo en Pagos o hablarlo con tu entrenador." : `Te ${p.remaining === 1 ? "queda 1 sesión" : `quedan ${p.remaining} sesiones`} de ${p.total}`}
        {p.remaining > 0 && p.expires ? `, hasta el ${dayShort(p.expires)}` : ""}.
      </span>
    </p>
  );
}
