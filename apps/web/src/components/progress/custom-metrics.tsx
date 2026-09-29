import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { MetricDef, MetricValue } from "@coach/shared";
import { Button } from "../ui/button";
import { SidePanel } from "../ui/dialog";
import { Select, TextArea, TextField } from "../ui/field";
import { BlockTitle, PlateMark } from "../ui/layout";
import { Skeleton } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { FormError } from "../form-error";
import { LineChart } from "./line-chart";
import { customMetricsQuery, useCustomValue } from "../../lib/followup";
import { dayMonth, today } from "../../lib/dates";
import { errorMessage } from "../../lib/api";
import type { Who } from "../../lib/progress";

const num = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const withUnit = (n: number, unit: string) => (unit.startsWith("/") || unit === "°" || unit === "%" ? `${num(n)}${unit}` : `${num(n)}${unit ? ` ${unit}` : ""}`);

/** Medidas propias del estudio (dolor, grados de flexión, salto…): una gráfica por medida y su tendencia. */
export function CustomMetricsBlock({ who, name }: { who: Who; name?: string }) {
  const q = useQuery(customMetricsQuery(who));
  const [open, setOpen] = useState<string | null>(null);
  if (q.isPending) return <Skeleton className="h-32" />;
  const { defs, values } = q.data ?? { defs: [], values: [] };
  const loggable = defs.filter((d) => !d.archived && (who !== "me" || d.clientCanLog));
  if (defs.length === 0) {
    if (who === "me") return null;
    return (
      <section aria-labelledby="cm-title">
        <BlockTitle id="cm-title">Otras medidas</BlockTitle>
        <p className="max-w-[60ch] text-sm text-ink-2">
          Crea tus propias medidas (dolor de 0 a 10, grados de flexión, salto, pasos…) en{" "}
          <Link to="/coach/seguimiento" className="font-medium text-primary hover:underline">
            Seguimiento
          </Link>{" "}
          y anótalas aquí para ver cómo evolucionan.
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="cm-title">
      <BlockTitle id="cm-title" action={loggable.length > 1 && <Button size="sm" variant="secondary" onClick={() => setOpen(loggable[0]!.id)}>Anotar</Button>}>
        Otras medidas
      </BlockTitle>
      <div className="flex flex-col gap-8">
        {defs.map((d) => (
          <MetricRow key={d.id} def={d} values={values.filter((v) => v.metricId === d.id)} who={who} name={name} onLog={loggable.some((x) => x.id === d.id) ? () => setOpen(d.id) : undefined} />
        ))}
      </div>
      <ValuePanel who={who} defs={loggable} initial={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function MetricRow({ def: d, values, who, name, onLog }: { def: MetricDef; values: MetricValue[]; who: Who; name?: string; onLog?: () => void }) {
  const first = values[0];
  const last = values.at(-1);
  const diff = first && last && first !== last ? last.value - first.value : null;
  const better = diff == null || diff === 0 ? null : d.higherIsBetter ? diff > 0 : diff < 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-medium text-ink">
          {d.name}
          {d.archived && <span className="ml-2 text-[13px] font-normal text-ink-3">(ya no se usa)</span>}
        </h3>
        {onLog && (
          <button type="button" onClick={onLog} className="text-[13px] font-medium text-primary hover:underline">
            Anotar {d.name.toLowerCase()}
          </button>
        )}
      </div>
      {!last ? (
        <p className="mt-1 text-sm text-ink-2">{who === "me" ? "Sin datos todavía." : `Sin datos de ${name?.split(" ")[0] ?? "este cliente"}.`}</p>
      ) : (
        <>
          <p className="mt-1 text-ink-2">
            <span className="font-narrow text-[24px] text-ink">{withUnit(last.value, d.unit)}</span> el {dayMonth(last.date)}
            {diff != null && diff !== 0 && (
              <PlateMark tone={better ? "green" : "yellow"} className="ml-3 align-middle">
                {diff > 0 ? "+" : "−"}
                {withUnit(Math.abs(diff), d.unit)} desde el {dayMonth(first!.date)}
              </PlateMark>
            )}
          </p>
          {values.length >= 2 && (
            <div className="mt-2">
              <LineChart title={`Evolución: ${d.name}`} unit={d.unit} height={160} series={[{ key: d.id, label: d.name, color: "var(--chart-1)", marker: "circle", points: values.map((v) => ({ x: v.date, y: v.value })) }]} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ValuePanel({ who, defs, initial, onClose }: { who: Who; defs: MetricDef[]; initial: string | null; onClose: () => void }) {
  const m = useCustomValue(who);
  const toast = useToast();
  const [f, setF] = useState({ metricId: "", date: today(), value: "", note: "" });
  useEffect(() => {
    if (initial) setF({ metricId: initial, date: today(), value: "", note: "" });
  }, [initial]);
  const def = defs.find((d) => d.id === f.metricId);
  const value = Number(f.value.replace(",", "."));
  const submit = () =>
    m.mutate(
      { save: { metricId: f.metricId, date: f.date, value, note: f.note.trim() || null } },
      { onSuccess: () => (toast(`${def?.name ?? "Medida"} guardada`), onClose()) },
    );
  return (
    <SidePanel
      open={Boolean(initial)}
      onOpenChange={(o) => !o && onClose()}
      title="Anotar medida"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={m.isPending} disabled={!f.metricId || f.value.trim() === "" || !Number.isFinite(value)}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Select label="Medida" value={f.metricId} onChange={(e) => setF({ ...f, metricId: e.target.value })}>
          {defs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Día" type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <TextField label="Valor" aside={def?.unit || undefined} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} className="[&_input]:font-narrow [&_input]:text-[18px]" />
        </div>
        <TextArea label="Nota" aside="opcional" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <FormError message={m.isError ? errorMessage(m.error) : null} />
      </div>
    </SidePanel>
  );
}
