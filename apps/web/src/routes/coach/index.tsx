import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "../../lib/auth";
import { useDocumentTitle } from "../../lib/title";
import { clientsQuery } from "../../lib/queries";
import { activityQuery, attentionQuery, todayWorkoutsQuery, useMarkAllSeen } from "../../lib/training";
import { dayLong, dayShort, today } from "../../lib/dates";
import { firstName, relativeTime } from "../../lib/format";
import { BlockTitle, Monogram, PlateMark } from "../../components/ui/layout";
import { Button, buttonClass } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/spinner";
import { PendingRequests } from "../../components/clients/pending-requests";
import { QuickDone } from "../../components/agenda/attendance";
import { WorkoutPanel } from "../../components/training/workout-panel";
import { WorkoutStatusMark } from "../../components/training/workout-status";
import { WeekMatrix } from "../../components/training/week-matrix";
import { FirstSteps } from "../../components/first-steps";

import { appointmentsQuery, hhmm } from "../../lib/agenda";
import { appointmentLabel } from "@coach/shared";
import { plusDays } from "../../lib/dates";
import { cn } from "../../lib/cn";

export const Route = createFileRoute("/coach/")({
  component: CoachToday,
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** La hoja del día: quién entrena hoy, qué han hecho tus clientes y qué requiere tu atención. */
function CoachToday() {
  const me = useMe()!;
  const t = today();
  useDocumentTitle("Hoy");
  const todays = useQuery(todayWorkoutsQuery(t));
  const activity = useQuery(activityQuery);
  const clients = useQuery(clientsQuery());
  const pending = useQuery(clientsQuery("pending")).data ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyUnseen, setOnlyUnseen] = useState(false);
  const markAll = useMarkAllSeen();
  const appts = useQuery(appointmentsQuery(t, plusDays(t, 1)));
  const apptList = (appts.data ?? []).filter((a) => a.status !== "cancelled");

  const list = todays.data ?? [];
  const doneToday = list.filter((w) => w.status === "done").length;
  const invited = (clients.data ?? []).filter((c) => c.status === "invited");
  const unseen = (activity.data ?? []).filter((a) => a.unseen).length;

  const sentences: string[] = [];
  if (apptList.length) sentences.push(`${apptList.length === 1 ? "Tienes 1 cita" : `Tienes ${apptList.length} citas`}, la primera a las ${hhmm(apptList[0]!.startsAt)}.`);
  if (todays.data) sentences.push(list.length === 0 ? "Hoy no entrena nadie con plan asignado." : `Hoy entrenan ${list.length} ${list.length === 1 ? "cliente" : "clientes"}${doneToday ? ` y ${doneToday} ya ${doneToday === 1 ? "ha terminado" : "han terminado"}` : ""}.`);
  if (unseen) sentences.push(`${unseen} ${unseen === 1 ? "entreno terminado que no has revisado" : "entrenos terminados que no has revisado"}.`);
  if (pending.length) sentences.push(`${pending.length === 1 ? "Una persona espera" : `${pending.length} personas esperan`} a que la aceptes.`);

  return (
    <>
      <header className="pb-8">
        <p className="text-ink-2">Hola, {firstName(me.name)}.</p>
        <h1 className="font-wide mt-1 text-[30px] leading-[1.1] sm:text-[38px]">{cap(dayLong(t))}</h1>
        <p className="mt-2 max-w-[70ch] text-ink-2">
          {sentences.join(" ") || " "}{" "}
          <Link to="/coach/informes" className="font-medium whitespace-nowrap text-primary hover:underline">
            Ver informes
          </Link>
        </p>
      </header>

      <FirstSteps />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <section aria-labelledby="today-title">
          {apptList.length > 0 && (
            <div className="mb-10">
              <BlockTitle action={<Link to="/coach/calendario" className="text-sm font-medium text-primary hover:underline">Abrir agenda</Link>}>Citas de hoy</BlockTitle>
              <ol className="divide-y divide-rule border-y border-rule">
                {apptList.map((a) => (
                  <li key={a.id} className="grid grid-cols-[96px_1fr_auto] items-baseline gap-3 py-3">
                    <span className={cn("font-narrow text-[16px]", new Date(a.endsAt) < new Date() ? "text-ink-3" : "text-ink")}>
                      {hhmm(a.startsAt)}–{hhmm(a.endsAt)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{appointmentLabel(a)}</span>
                      {a.location && <span className="block truncate text-[13px] text-ink-2">{a.location}</span>}
                    </span>
                    {new Date(a.startsAt) <= new Date() ? <QuickDone appointment={a} /> : <span />}
                  </li>
                ))}
              </ol>
            </div>
          )}
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
          <NeedsAttention />

          <section aria-labelledby="activity-title">
            <BlockTitle
              id="activity-title"
              action={
                unseen > 0 && (
                  <Button size="sm" variant="quiet" loading={markAll.isPending} onClick={() => markAll.mutate()}>
                    Marcar todo como revisado
                  </Button>
                )
              }
            >
              Lo último que han hecho
            </BlockTitle>
            {(unseen > 0 || onlyUnseen) && (
              <label className="mb-2 flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={onlyUnseen} onChange={(e) => setOnlyUnseen(e.target.checked)} className="accent-[var(--primary)]" /> Solo sin revisar ({unseen})
              </label>
            )}
            {activity.isPending ? (
              <Skeleton className="h-32" />
            ) : (activity.data ?? []).length === 0 ? (
              <p className="text-sm text-ink-2">Cuando tus clientes terminen un entreno lo verás aquí, con su esfuerzo y sus comentarios.</p>
            ) : (
              <ol className="flex flex-col">
                {onlyUnseen && unseen === 0 && <li className="py-3 text-sm text-ink-2">Todo revisado.</li>}
                {activity.data!.filter((a) => !onlyUnseen || a.unseen).map((a) => (
                  <li key={a.workoutId}>
                    <button type="button" onClick={() => setOpenId(a.workoutId)} className="relative flex w-full gap-3 border-b border-rule py-3 pl-3 text-left hover:bg-tray">
                      <span className={cn("absolute top-3.5 bottom-3.5 left-0 w-[3px] rounded-[1px]", a.unseen ? "bg-primary" : "bg-transparent")} aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="text-ink">
                          <strong className="font-medium">{a.clientName}</strong> {a.status === "skipped" ? "no hizo" : "terminó"} {a.title}
                          {a.sessionRpe ? `, esfuerzo ${a.sessionRpe}/10` : ""}
                        </span>
                        {a.records.length > 0 && (
                          <span className="mt-1 flex items-center gap-2 text-[13px] text-ink">
                            <span className="h-3.5 w-[5px] rounded-[1.5px] bg-plate-yellow" aria-hidden="true" />
                            Récord en {a.records.join(", ")}
                          </span>
                        )}
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

/** Clientes que piden acción (entrenos sin hacer, inactividad, PAR-Q con alerta, mensajes sin contestar). */
function NeedsAttention() {
  const q = useQuery(attentionQuery);
  if (!q.data?.length) return null;
  const tone = { health: "red", missed: "red", unanswered: "blue", checkin: "blue", pack: "yellow", payment: "red", inactive: "yellow" } as const;
  return (
    <section aria-labelledby="att-title">
      <BlockTitle id="att-title">Necesitan atención</BlockTitle>
      <ul className="divide-y divide-rule border-y border-rule">
        {q.data.map((a) => (
          <li key={a.clientId} className="py-2.5">
            <Link to="/coach/clientes/$clientId" params={{ clientId: a.clientId }} search={a.reasons[0]?.kind === "checkin" ? { pestana: "seguimiento" } : a.reasons[0]?.kind === "health" ? { pestana: "ficha" } : a.reasons[0]?.kind === "pack" ? { pestana: "agenda" } : {}} className="flex items-center gap-3 hover:text-primary">
              <Monogram name={a.clientName} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{a.clientName}</span>
                <span className="mt-0.5 flex flex-col gap-0.5">
                  {a.reasons.map((r) => (
                    <PlateMark key={r.kind} tone={tone[r.kind]} className="text-[13px]">
                      {r.text}
                    </PlateMark>
                  ))}
                </span>
              </span>
            </Link>
            {a.reasons.some((r) => r.kind === "unanswered") && (
              <Link to="/coach/chat" search={{ cliente: a.clientId }} className="mt-1 ml-11 inline-block text-[13px] font-medium text-primary hover:underline">
                Contestar
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
