import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CaretLeft } from "@phosphor-icons/react";
import { Button } from "../../components/ui/button";
import { EmptyNote } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { useToast } from "../../components/ui/toast";
import { FormError } from "../../components/form-error";
import { formatEuros } from "@coach/shared";
import { myBookingQuery, useBook } from "../../lib/booking";
import { hhmm, localDate } from "../../lib/agenda";
import { dayLong, dayShort, today } from "../../lib/dates";
import { errorMessage } from "../../lib/api";
import { useDocumentTitle } from "../../lib/title";
import { cn } from "../../lib/cn";

export const Route = createFileRoute("/app/reservar")({
  component: Book,
});

/** Reservar una sesión: elegir día (solo los que tienen huecos) y hora, y confirmar. */
function Book() {
  useDocumentTitle("Reservar sesión");
  const t = today();
  const q = useQuery(myBookingQuery(t, 14));
  const book = useBook();
  const toast = useToast();
  const navigate = useNavigate();
  const slots = q.data?.slots ?? [];
  const days = [...new Set(slots.map((s) => localDate(s.startsAt)))];
  const [day, setDay] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const d = day && days.includes(day) ? day : days[0];
  const ofDay = slots.filter((s) => localDate(s.startsAt) === d);
  const chosen = slots.find((s) => s.startsAt === pick);

  if (q.isPending) return <Skeleton className="h-64" />;
  return (
    <div className="pb-8">
      <Link to="/app/agenda" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <CaretLeft size={15} /> Agenda
      </Link>
      <h1 className="font-wide text-[28px] leading-[1.1]">Reservar sesión</h1>
      {q.data?.location && <p className="mt-1 text-ink-2">{q.data.location}</p>}
      {!q.data?.enabled ? (
        <EmptyNote className="mt-6">Tu entrenador no tiene activadas las reservas desde la app. Escríbele por el chat para quedar.</EmptyNote>
      ) : days.length === 0 ? (
        <EmptyNote className="mt-6">No quedan huecos libres en las próximas dos semanas. Escribe a tu entrenador por el chat.</EmptyNote>
      ) : (
        <>
          <div className="mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Día">
            {days.map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={x === d}
                onClick={() => (setDay(x), setPick(null))}
                className={cn("shrink-0 rounded-[var(--radius-control)] border px-3 py-2 text-left", x === d ? "border-ink bg-ink text-paper" : "border-rule-strong hover:bg-tray")}
              >
                <span className="block text-[12.5px] capitalize opacity-80">{x === t ? "hoy" : dayShort(x).split(" ")[0]}</span>
                <span className="font-narrow block text-[18px] leading-tight">{Number(x.slice(8))}</span>
              </button>
            ))}
          </div>
          <h2 className="mt-6 mb-2 text-[13.5px] font-medium text-ink-2">{d && dayLong(d).replace(/^./, (c) => c.toUpperCase())}</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Hora">
            {ofDay.map((s) => (
              <button
                key={s.startsAt}
                type="button"
                role="radio"
                aria-checked={pick === s.startsAt}
                aria-label={`${hhmm(s.startsAt)}${s.free > 1 ? `, ${s.free} plazas` : ""}`}
                onClick={() => setPick(s.startsAt)}
                className={cn("font-narrow h-12 rounded-[var(--radius-control)] border text-[17px]", pick === s.startsAt ? "border-primary bg-primary text-primary-ink" : "border-rule-strong hover:bg-tray")}
              >
                {hhmm(s.startsAt)}
              </button>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-3">
            <FormError message={book.isError ? errorMessage(book.error) : null} />
            <Button
              size="lg"
              disabled={!chosen}
              loading={book.isPending}
              className="w-full sm:w-auto sm:self-start"
              onClick={() =>
                chosen &&
                book.mutate(chosen.startsAt, {
                  onSuccess: (r) =>
                    r.checkoutUrl
                      ? window.location.assign(r.checkoutUrl)
                      : (toast(`Reservada: ${dayShort(localDate(chosen.startsAt))} a las ${hhmm(chosen.startsAt)}`), navigate({ to: "/app/agenda" })),
                })
              }
            >
              {chosen ? `${q.data.payAmount ? "Pagar y reservar" : "Reservar"} ${dayShort(localDate(chosen.startsAt))} a las ${hhmm(chosen.startsAt)}` : "Elige una hora"}
            </Button>
            {q.data.payAmount != null && (
              <p className="text-[13.5px] text-ink">
                No tienes bono: la sesión se paga al reservar ({formatEuros(q.data.payAmount)}). Te guardamos el hueco 15 minutos mientras pagas.
              </p>
            )}
            <p className="text-[13px] text-ink-3">Puedes cancelarla desde tu agenda hasta {q.data.cancelHours} horas antes.</p>
          </div>
        </>
      )}
    </div>
  );
}
