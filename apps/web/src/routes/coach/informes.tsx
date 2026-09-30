import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BlockTitle, Monogram, PageTitle, PlateMark } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { LineChart } from "../../components/progress/line-chart";
import { reportQuery } from "../../lib/library";
import { useDocumentTitle } from "../../lib/title";
import { QueryError } from "../../components/ui/query-state";

export const Route = createFileRoute("/coach/informes")({
  component: Reports,
});

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const euros = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Cómo va el estudio: clientes, cumplimiento, sesiones del mes y bonos. Cifras dentro de frases, no en tarjetas. */
function Reports() {
  useDocumentTitle("Informes");
  const q = useQuery(reportQuery);
  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <QueryError q={q} />;
  const r = q.data!;
  const month = new Date().toLocaleDateString("es-ES", { month: "long" });
  const lines = [
    `Tienes ${r.activeClients} ${r.activeClients === 1 ? "cliente activo" : "clientes activos"}${r.newClients30d ? ` (${r.newClients30d} ${r.newClients30d === 1 ? "ficha nueva" : "fichas nuevas"} en los últimos 30 días)` : ""}.`,
    r.planned4w ? `En las últimas cuatro semanas han hecho ${r.done4w} de ${r.planned4w} entrenos asignados: un ${pct(r.done4w, r.planned4w)} %.` : "En las últimas cuatro semanas no había entrenos asignados.",
    `En ${month} llevas ${r.sessionsMonth} ${r.sessionsMonth === 1 ? "sesión hecha" : "sesiones hechas"}${r.noShowsMonth ? ` y ${r.noShowsMonth} ${r.noShowsMonth === 1 ? "falta sin avisar" : "faltas sin avisar"}` : ""}.`,
    r.paidMonth || r.pendingPayments ? `Bonos cobrados este mes: ${euros(r.paidMonth)}.${r.pendingPayments ? ` Pendiente de cobro: ${euros(r.pendingPayments)}.` : ""}` : "",
    r.packsToRenew ? `${r.packsToRenew} ${r.packsToRenew === 1 ? "cliente tiene el bono" : "clientes tienen el bono"} a punto de acabarse.` : "",
  ].filter(Boolean);
  const points = r.weekly.map((w) => ({ x: w.monday, y: w.planned ? pct(w.done, w.planned) : null }));

  return (
    <>
      <PageTitle title="Informes" lead="Cómo va el estudio, con los datos de la app." />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
        <div className="flex flex-col gap-10">
          <section aria-labelledby="sum-title">
            <BlockTitle id="sum-title">Resumen</BlockTitle>
            <div className="flex max-w-[62ch] flex-col gap-2 text-[16px] leading-relaxed">
              {lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
            <a href="/api/v1/payments.csv" download className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
              Descargar los cobros de la app (CSV para tu gestor)
            </a>
          </section>
          <section aria-labelledby="adh-title">
            <BlockTitle id="adh-title">Cumplimiento semanal</BlockTitle>
            {points.filter((p) => p.y != null).length >= 2 ? (
              <LineChart title="Porcentaje de entrenos hechos por semana" unit="%" series={[{ key: "adh", label: "Hechos", color: "var(--chart-1)", marker: "circle", points }]} />
            ) : (
              <p className="text-sm text-ink-2">Con dos semanas de entrenos asignados verás aquí la tendencia.</p>
            )}
          </section>
        </div>
        <section aria-labelledby="cl-title">
          <BlockTitle id="cl-title">Por cliente, 4 semanas</BlockTitle>
          {r.byClient.length === 0 ? (
            <p className="text-sm text-ink-2">Nadie tenía entrenos asignados.</p>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule">
              {r.byClient.map((c) => {
                const p = pct(c.done, c.planned);
                return (
                  <li key={c.clientId}>
                    <Link to="/coach/clientes/$clientId" params={{ clientId: c.clientId }} className="flex items-center gap-3 py-2.5 hover:text-primary">
                      <Monogram name={c.name} size={30} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                      <PlateMark tone={p >= 80 ? "green" : p >= 50 ? "yellow" : "red"} className="font-narrow tabular">
                        {c.done}/{c.planned}
                      </PlateMark>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
