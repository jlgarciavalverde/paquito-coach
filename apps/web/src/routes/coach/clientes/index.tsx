import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CaretRight, MagnifyingGlass, Plus, UserPlus, UsersThree } from "@phosphor-icons/react";
import { z } from "zod";
import type { Client, ClientStatus } from "@coach/shared";
import { Avatar } from "../../../components/ui/avatar";
import { Button } from "../../../components/ui/button";
import { EmptyState, PageHeader } from "../../../components/ui/surface";
import { Skeleton } from "../../../components/ui/spinner";
import { StatusBadge } from "../../../components/clients/status-badge";
import { NewClientDialog } from "../../../components/clients/new-client-dialog";
import { PendingRequests } from "../../../components/clients/pending-requests";
import { clientsQuery } from "../../../lib/queries";
import { relativeTime } from "../../../lib/format";
import { cn } from "../../../lib/cn";

const FILTERS: { value: "current" | ClientStatus; label: string }[] = [
  { value: "current", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "invited", label: "Invitados" },
  { value: "no_account", label: "Sin cuenta" },
  { value: "archived", label: "Archivados" },
];

export const Route = createFileRoute("/coach/clientes/")({
  validateSearch: z.object({ nuevo: z.boolean().optional() }),
  component: ClientsPage,
});

function ClientsPage() {
  const { nuevo } = Route.useSearch();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("current");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(Boolean(nuevo));
  const list = useQuery(clientsQuery(filter === "current" ? undefined : filter));

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = (list.data ?? []).filter((c) => filter !== "current" || c.status !== "pending");
    return term ? rows.filter((c) => c.name.toLowerCase().includes(term) || c.email?.toLowerCase().includes(term)) : rows;
  }, [list.data, q, filter]);

  return (
    <>
      <PageHeader
        overline="Tu cartera"
        title="Clientes"
        description="Da de alta, invita y consulta la ficha de cada persona que entrenas."
        actions={
          <Button icon={<Plus size={17} weight="bold" />} onClick={() => setOpen(true)}>
            Nuevo cliente
          </Button>
        }
      />

      <PendingRequests />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Filtrar clientes">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                filter === f.value ? "bg-ink text-paper" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="relative sm:w-72">
          <span className="sr-only">Buscar cliente</span>
          <MagnifyingGlass size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o correo"
            className="h-10 w-full rounded-full border border-line-strong bg-surface pr-4 pl-10 text-sm outline-none placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
        </label>
      </div>

      {list.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        q || filter !== "current" ? (
          <EmptyState icon={<MagnifyingGlass size={22} />} title="Sin resultados">
            No hay clientes que coincidan con este filtro.
          </EmptyState>
        ) : (
          <EmptyState
            icon={<UsersThree size={22} />}
            title="Tu primer cliente"
            action={
              <Button icon={<UserPlus size={17} />} onClick={() => setOpen(true)}>
                Dar de alta un cliente
              </Button>
            }
          >
            Crea su ficha y mándale una invitación por WhatsApp. En cuanto la acepte, verá sus entrenos y podrá escribirte.
          </EmptyState>
        )
      ) : (
        <ClientTable clients={shown} />
      )}

      <NewClientDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function ClientTable({ clients }: { clients: Client[] }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-soft)]">
      <div className="hidden grid-cols-[minmax(0,2fr)_160px_minmax(0,2fr)_110px_24px] gap-4 border-b border-line px-5 py-3 text-[12px] font-medium tracking-[0.08em] text-ink-3 uppercase md:grid">
        <span>Cliente</span>
        <span>Estado</span>
        <span>Objetivo</span>
        <span>Alta</span>
        <span />
      </div>
      <ul>
        {clients.map((c) => (
          <li key={c.id} className="border-b border-line last:border-b-0">
            <Link
              to="/coach/clientes/$clientId"
              params={{ clientId: c.id }}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-surface-2/70 md:grid-cols-[minmax(0,2fr)_160px_minmax(0,2fr)_110px_24px] md:px-5"
            >
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={c.name} size={38} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{c.name}</span>
                  <span className="block truncate text-[13px] text-ink-3">{c.email ?? c.phone ?? "Sin contacto"}</span>
                </span>
              </span>
              <span className="justify-self-end md:justify-self-start">
                <StatusBadge status={c.status} />
              </span>
              <span className="col-span-2 truncate pl-[50px] text-[13px] text-ink-2 md:col-span-1 md:pl-0 md:text-sm">{c.goal ?? <span className="text-ink-3">—</span>}</span>
              <span className="hidden text-[13px] text-ink-3 md:block">{relativeTime(c.createdAt)}</span>
              <CaretRight size={16} className="hidden text-ink-3 md:block" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
