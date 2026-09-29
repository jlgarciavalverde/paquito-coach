import { useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { z } from "zod";
import type { Client, ClientStatus } from "@coach/shared";
import { Button } from "../../components/ui/button";
import { Monogram } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { StatusMark } from "../../components/clients/status-mark";
import { NewClientPanel } from "../../components/clients/new-client-panel";
import { PendingRequests } from "../../components/clients/pending-requests";
import { clientsQuery } from "../../lib/queries";
import { cn } from "../../lib/cn";
import { useDocumentTitle } from "../../lib/title";

const FILTERS: { value: "current" | ClientStatus; label: string }[] = [
  { value: "current", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "invited", label: "Invitados" },
  { value: "no_account", label: "Sin cuenta" },
  { value: "archived", label: "Archivados" },
];

export const Route = createFileRoute("/coach/clientes")({
  validateSearch: z.object({ nuevo: z.boolean().optional() }),
  component: ClientsLayout,
});

/** Lista de clientes a la izquierda y ficha a la derecha (en móvil: lista → ficha). */
function ClientsLayout() {
  const { nuevo } = Route.useSearch();
  const { clientId } = useParams({ strict: false }) as { clientId?: string };
  const [open, setOpen] = useState(Boolean(nuevo));
  useDocumentTitle(clientId ? null : "Clientes");
  return (
    <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-10">
      <aside className={cn("lg:sticky lg:top-24 lg:self-start", clientId && "hidden lg:block")}>
        <Roster selectedId={clientId} onNew={() => setOpen(true)} />
      </aside>
      <section className={cn("min-w-0", !clientId && "hidden lg:block")}>
        <Outlet />
      </section>
      <NewClientPanel open={open} onOpenChange={setOpen} />
    </div>
  );
}

function Roster({ selectedId, onNew }: { selectedId?: string; onNew: () => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("current");
  const [q, setQ] = useState("");
  const list = useQuery(clientsQuery(filter === "current" ? undefined : filter));
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = (list.data ?? []).filter((c) => filter !== "current" || c.status !== "pending");
    return term ? rows.filter((c) => c.name.toLowerCase().includes(term) || c.email?.toLowerCase().includes(term)) : rows;
  }, [list.data, q, filter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-wide text-[30px] leading-none">Clientes</h1>
        <Button icon={<Plus size={16} weight="bold" />} onClick={onNew}>
          Nuevo cliente
        </Button>
      </div>

      <PendingRequests compact />

      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Buscar cliente</span>
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar"
            className="h-9 w-full rounded-[var(--radius-control)] border border-rule-strong bg-paper pr-3 pl-9 text-sm outline-none placeholder:text-ink-3 focus:border-primary"
          />
        </label>
        <label className="sr-only" htmlFor="roster-filter">
          Filtrar
        </label>
        <select
          id="roster-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="h-9 rounded-[var(--radius-control)] border border-rule-strong bg-paper px-2 text-sm text-ink outline-none focus:border-primary"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {list.isPending ? (
        <div className="flex flex-col gap-1">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="py-4 text-sm text-ink-2">
          {q || filter !== "current" ? "Nadie coincide con esa búsqueda." : "Todavía no hay clientes. Crea la primera ficha con «Nuevo cliente»."}
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col" aria-label="Lista de clientes">
          {shown.map((c) => (
            <RosterRow key={c.id} c={c} selected={c.id === selectedId} />
          ))}
        </ul>
      )}
      {shown.length > 0 && <p className="text-[13px] text-ink-3">{shown.length === 1 ? "1 ficha" : `${shown.length} fichas`}</p>}
    </div>
  );
}

function RosterRow({ c, selected }: { c: Client; selected: boolean }) {
  return (
    <li>
      <Link
        to="/coach/clientes/$clientId"
        params={{ clientId: c.id }}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2.5 transition-colors",
          selected ? "bg-primary-soft" : "hover:bg-tray",
        )}
      >
        {selected && <span className="absolute top-2 bottom-2 -left-0.5 w-[3px] rounded-[1px] bg-primary" aria-hidden="true" />}
        <Monogram name={c.name} size={36} className={selected ? "bg-paper" : undefined} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium text-ink">{c.name}</span>
          <span className="block truncate text-[13px] text-ink-2">{c.goal ?? c.email ?? "Sin objetivo anotado"}</span>
        </span>
        <StatusMark status={c.status} />
      </Link>
    </li>
  );
}
