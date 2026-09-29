import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Barbell, CalendarBlank, ChatCircle, UserPlus } from "@phosphor-icons/react";
import { Card, PageHeader, SectionTitle, Stat } from "../../components/ui/surface";
import { buttonClass } from "../../components/ui/button";
import { Avatar } from "../../components/ui/avatar";
import { PendingRequests } from "../../components/clients/pending-requests";
import { StatusBadge } from "../../components/clients/status-badge";
import { useMe } from "../../lib/auth";
import { clientsQuery } from "../../lib/queries";
import { firstName, fmtToday, greeting, relativeTime } from "../../lib/format";

export const Route = createFileRoute("/coach/")({
  component: CoachHome,
});

function CoachHome() {
  const me = useMe()!;
  const clients = useQuery(clientsQuery()).data ?? [];
  const active = clients.filter((c) => c.status === "active").length;
  const invited = clients.filter((c) => c.status === "invited").length;
  const recent = [...clients].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <>
      <PageHeader
        overline={fmtToday()}
        title={
          <>
            {greeting()}, <em className="text-accent">{firstName(me.name)}</em>
          </>
        }
        actions={
          <Link to="/coach/clientes" search={{ nuevo: true }} className={buttonClass()}>
            <UserPlus size={17} /> Nuevo cliente
          </Link>
        }
      />

      <PendingRequests />

      <Card className="mb-10 grid grid-cols-2 gap-6 p-6 sm:grid-cols-3 sm:p-8">
        <Stat label="Clientes activos" value={active} hint="Con cuenta en la app" />
        <Stat label="Invitaciones" value={invited} hint="Pendientes de activar" />
        <Stat label="Fichas" value={clients.length} hint="En total (sin archivados)" />
      </Card>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <SectionTitle
            action={
              <Link to="/coach/clientes" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                Ver todos <ArrowRight size={14} />
              </Link>
            }
          >
            Últimas altas
          </SectionTitle>
          {recent.length === 0 ? (
            <Card className="p-6 text-sm text-ink-2">Aún no tienes clientes. Da de alta el primero y mándale su invitación.</Card>
          ) : (
            <Card className="divide-y divide-line">
              {recent.map((c) => (
                <Link key={c.id} to="/coach/clientes/$clientId" params={{ clientId: c.id }} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2/70">
                  <Avatar name={c.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-[13px] text-ink-3">{relativeTime(c.createdAt)}</span>
                  </span>
                  <StatusBadge status={c.status} />
                </Link>
              ))}
            </Card>
          )}
        </section>

        <section>
          <SectionTitle>Muy pronto aquí</SectionTitle>
          <Card className="flex flex-col gap-4 p-6">
            {[
              { icon: CalendarBlank, t: "Agenda de hoy", d: "Tus citas y los entrenos que toca hoy a cada cliente." },
              { icon: Barbell, t: "Entrenos completados", d: "Lo que han registrado tus clientes, con cargas y RPE." },
              { icon: ChatCircle, t: "Mensajes sin leer", d: "El chat con cada cliente, sin usar tu WhatsApp." },
            ].map(({ icon: I, t, d }) => (
              <div key={t} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent-soft-ink">
                  <I size={18} />
                </span>
                <span>
                  <span className="block text-sm font-medium">{t}</span>
                  <span className="block text-[13px] text-ink-2">{d}</span>
                </span>
              </div>
            ))}
          </Card>
        </section>
      </div>
    </>
  );
}
