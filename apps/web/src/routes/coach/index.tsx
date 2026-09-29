import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "../../lib/auth";
import { clientsQuery } from "../../lib/queries";
import { activityQuery, todayWorkoutsQuery } from "../../lib/training";
import { dayLong, dayShort, today } from "../../lib/dates";
import { firstName, relativeTime } from "../../lib/format";
import { BlockTitle, Monogram } from "../../components/ui/layout";
import { buttonClass } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/spinner";
import { PendingRequests } from "../../components/clients/pending-requests";
import { WorkoutPanel } from "../../components/training/workout-panel";
import { WorkoutStatusMark } from "../../components/training/workout-status";
import { WeekMatrix } from "../../components/training/week-matrix";
import { cn } from "../../lib/cn";

export const Route = createFileRoute("/coach/")({
  component: CoachToday,
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** La hoja del día: quién entrena hoy, qué han hecho tus clientes y qué requiere tu atención. */
function CoachToday() {
  const me = useMe()!;
  const t = today();
  const todays = useQuery(todayWorkoutsQuery(t));
  const activity = useQuery(activityQuery);
  const clients = useQuery(clientsQuery());
  const pending = useQuery(clientsQuery("pending")).data ?? [];
  const [openId, setOpenId] = useState<string | null>(null);

  const list = todays.data ?? [];
  const doneToday = list.filter((w) => w.status === "done").length;
  const invited = (clients.data ?? []).filter((c) => c.status === "invited");
  const unseen = (activity.data ?? []).filter((a) => a.unseen).length;

  const sentences: string[] = [];
  if (todays.data) sentences.push(list.length === 0 ? "Hoy no entrena nadie con plan asignado." : `Hoy entrenan ${list.length} ${list.length === 1 ? "cliente" : "clientes"}${doneToday ? ` y ${doneToday} ya ${doneToday === 1 ? "ha terminado" : "han terminado"}` : ""}.`);
  if (unseen) sentences.push(`${unseen} ${unseen === 1 ? "entreno terminado que no has revisado" : "entrenos terminados que no has revisado"}.`);
  if (pending.length) sentences.push(`${pending.length === 1 ? "Una persona espera" : `${pending.length} personas esperan`} a que la aceptes.`);

  return (
    <>
      <header className="pb-8">
        <p className="text-ink-2">Hola, {firstName(me.name)}.</p>
        <h1 className="font-wide mt-1 text-[30px] leading-[1.1] sm:text-[38px]">{cap(dayLong(t))}</h1>
        <p className="mt-2 max-w-[70ch] text-ink-2">{sentences.join(" ") || " "}</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="today-title">
          <BlockTitle id="today-title">Entrenos de hoy</BlockTitle>
          {todays.isPending ? (
            <Skeleton className="h-40" />
          ) : list.length === 0 ? (
            <div className="rounded-[var(--radius-zone)] bg-tray px-5 py-6">
              <p className="text-ink-2">Nadie tiene un entreno asignado para hoy. Los entrenos se asignan desde la ficha de cada cliente o desde una rutina.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/coach/clientes" className={buttonClass("secondary")}>
                  Ir a clientes
                </Link>
                <Link to="/coach/entrenos" className={buttonClass("quiet")}>
                  Ver rutinas
                </Link>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule">
              {list.map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => setOpenId(w.id)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-tray">
                    <Monogram name={w.clientName} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{w.clientName}</span>
                      <span className="block truncate text-[13px] text-ink-2">{w.title}</span>
                    </span>
                    <WorkoutStatusMark w={w} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <section aria-labelledby="week-title" className="mt-10">
            <BlockTitle id="week-title">Esta semana</BlockTitle>
            <WeekMatrix onOpen={setOpenId} />
          </section>
        </section>

        <aside className="flex flex-col gap-8">
          <PendingRequests />

          <section aria-labelledby="activity-title">
            <BlockTitle id="activity-title">Lo último que han hecho</BlockTitle>
            {activity.isPending ? (
              <Skeleton className="h-32" />
            ) : (activity.data ?? []).length === 0 ? (
              <p className="text-sm text-ink-2">Cuando tus clientes terminen un entreno lo verás aquí, con su esfuerzo y sus comentarios.</p>
            ) : (
              <ol className="flex flex-col">
                {activity.data!.map((a) => (
                  <li key={a.workoutId}>
                    <button type="button" onClick={() => setOpenId(a.workoutId)} className="relative flex w-full gap-3 border-b border-rule py-3 pl-3 text-left hover:bg-tray">
                      <span className={cn("absolute top-3.5 bottom-3.5 left-0 w-[3px] rounded-[1px]", a.unseen ? "bg-primary" : "bg-transparent")} aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="text-ink">
                          <strong className="font-medium">{a.clientName}</strong> {a.status === "skipped" ? "no hizo" : "terminó"} {a.title}
                          {a.sessionRpe ? `, esfuerzo ${a.sessionRpe}/10` : ""}
                        </span>
                        {a.clientComment && <span className="mt-0.5 block text-ink-2">«{a.clientComment}»</span>}
                        <span className="mt-0.5 block text-[13px] text-ink-3">
                          {relativeTime(a.completedAt)}, entreno del {dayShort(a.date)}
                          {a.unseen && <span className="sr-only"> (sin revisar)</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {invited.length > 0 && (
            <section aria-labelledby="invited-title">
              <BlockTitle id="invited-title">Invitaciones sin usar</BlockTitle>
              <ul className="flex flex-col gap-1 text-sm">
                {invited.map((c) => (
                  <li key={c.id}>
                    <Link to="/coach/clientes/$clientId" params={{ clientId: c.id }} className="flex justify-between gap-3 py-1 hover:text-primary">
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 text-ink-3">invitado {relativeTime(c.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
      <WorkoutPanel id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
