import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CaretLeft, MagnifyingGlass } from "@phosphor-icons/react";
import { z } from "zod";
import { Monogram } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { Thread } from "../../components/chat/thread";
import { conversationsQuery } from "../../lib/chat";
import { hhmm, localDate } from "../../lib/agenda";
import { dayShort, today } from "../../lib/dates";
import { cn } from "../../lib/cn";

export const Route = createFileRoute("/coach/chat")({
  validateSearch: z.object({ cliente: z.string().uuid().optional() }),
  component: Inbox,
});

/** Bandeja: conversaciones a la izquierda (no leídas arriba con su número), la elegida a la derecha. */
function Inbox() {
  const { cliente } = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = useQuery(conversationsQuery);
  const [filter, setFilter] = useState("");
  const list = useMemo(() => (q.data ?? []).filter((c) => c.clientName.toLowerCase().includes(filter.trim().toLowerCase())), [q.data, filter]);
  const current = q.data?.find((c) => c.clientId === cliente);

  return (
    <div className="grid h-[calc(100dvh-10rem)] min-h-[480px] grid-cols-1 gap-8 md:h-[calc(100dvh-8rem)] lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className={cn("flex min-h-0 flex-col", cliente && "hidden lg:flex")}>
        <h1 className="font-wide text-[30px] leading-none">Mensajes</h1>
        <label className="relative mt-4">
          <span className="sr-only">Buscar conversación</span>
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar" className="h-9 w-full rounded-[var(--radius-control)] border border-rule-strong bg-paper pr-3 pl-9 text-sm outline-none focus:border-primary" />
        </label>
        {q.isPending ? (
          <Skeleton className="mt-4 h-40" />
        ) : list.length === 0 ? (
          <p className="mt-4 text-sm text-ink-2">Cuando tengas clientes activos, aquí podrás hablar con cada uno.</p>
        ) : (
          <ul className="-mx-2 mt-3 min-h-0 flex-1 overflow-y-auto" aria-label="Conversaciones">
            {list.map((c) => {
              const on = c.clientId === cliente;
              const d = c.lastMessage ? localDate(c.lastMessage.createdAt) : null;
              return (
                <li key={c.clientId}>
                  <button
                    type="button"
                    onClick={() => navigate({ search: { cliente: c.clientId }, replace: true })}
                    aria-current={on ? "true" : undefined}
                    className={cn("relative flex w-full items-center gap-3 rounded-[var(--radius-control)] px-2 py-2.5 text-left", on ? "bg-primary-soft" : "hover:bg-tray")}
                  >
                    {on && <span className="absolute top-2 bottom-2 -left-0.5 w-[3px] rounded-[1px] bg-primary" aria-hidden="true" />}
                    <Monogram name={c.clientName} size={36} className={on ? "bg-paper" : undefined} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-[14.5px]", c.unread ? "font-semibold text-ink" : "font-medium text-ink")}>{c.clientName}</span>
                        {d && <span className="font-narrow shrink-0 text-[12.5px] text-ink-3">{d === today() ? hhmm(c.lastMessage!.createdAt) : dayShort(d)}</span>}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-[13px]", c.unread ? "text-ink" : "text-ink-2")}>
                          {c.lastMessage ? `${c.lastMessage.fromCoach ? "Tú: " : ""}${c.lastMessage.body || "Foto"}` : c.hasAccount ? "Sin mensajes" : "Sin cuenta en la app"}
                        </span>
                        {c.unread > 0 && (
                          <span className="font-narrow shrink-0 rounded-[3px] bg-primary px-1.5 text-[12px] leading-[18px] text-primary-ink" aria-label={`${c.unread} sin leer`}>
                            {c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <section className={cn("flex min-h-0 flex-col", !cliente && "hidden lg:flex")}>
        {current ? (
          <>
            <header className="flex items-center gap-3 border-b border-rule pb-3">
              <Link to="/coach/chat" search={{}} className="rounded-[var(--radius-control)] p-1.5 text-ink-2 hover:bg-tray lg:hidden" aria-label="Volver a las conversaciones">
                <CaretLeft size={18} />
              </Link>
              <Monogram name={current.clientName} size={36} />
              <div className="min-w-0 flex-1">
                <h2 className="font-wide truncate text-[19px]">{current.clientName}</h2>
              </div>
              <Link to="/coach/clientes/$clientId" params={{ clientId: current.clientId }} className="text-sm font-medium text-primary hover:underline">
                Ver ficha
              </Link>
            </header>
            <Thread
              key={current.clientId}
              threadKey={current.clientId}
              mine={(m) => m.fromCoach}
              otherName={current.clientName}
              disabledReason={current.hasAccount ? undefined : `${current.clientName} aún no tiene cuenta en la app. Invítale desde su ficha para poder escribirle.`}
              className="flex-1"
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col justify-center rounded-[var(--radius-zone)] bg-tray px-10">
            <p className="font-wide text-[22px]">Elige una conversación</p>
            <p className="mt-2 max-w-[48ch] text-ink-2">Cada cliente tiene una conversación privada contigo. No hace falta dar tu número de teléfono.</p>
          </div>
        )}
      </section>
    </div>
  );
}
