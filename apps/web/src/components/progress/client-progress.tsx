import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BodyMetric } from "@coach/shared";
import { Button } from "../ui/button";
import { SidePanel } from "../ui/dialog";
import { TextArea, TextField } from "../ui/field";
import { BlockTitle, EmptyNote } from "../ui/layout";
import { Skeleton } from "../ui/spinner";
import { useToast, useUndoToast } from "../ui/toast";
import { FormError } from "../form-error";
import { LineChart } from "./line-chart";
import { metricsQuery, progressExercisesQuery, progressQuery, useDeleteMetric, useSaveMetric, type Who } from "../../lib/progress";
import { dayMonth, today } from "../../lib/dates";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";

const kg = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })} kg`);

/** Progreso de un cliente: peso y medidas + cargas por ejercicio. Lo usan la ficha (entrenador) y «Progreso» (cliente). */
export function ClientProgress({ who, name }: { who: Who; name?: string }) {
  return (
    <div className="flex flex-col gap-12">
      <Measurements who={who} name={name} />
      <Loads who={who} name={name} />
    </div>
  );
}

function Measurements({ who, name }: { who: Who; name?: string }) {
  const q = useQuery(metricsQuery(who));
  const [open, setOpen] = useState(false);
  const del = useDeleteMetric(who);
  const restore = useSaveMetric(who);
  const undoToast = useUndoToast();
  const rows = q.data ?? [];
  const weights = rows.filter((m) => m.weightKg != null);
  const last = weights.at(-1);
  const first = weights[0];
  const diff = last && first && last !== first ? Math.round((last.weightKg! - first.weightKg!) * 10) / 10 : null;
  const waist = rows.filter((m) => m.waistCm != null);

  return (
    <section aria-labelledby="m-title">
      <BlockTitle id="m-title" action={<Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Anotar medidas</Button>}>
        Peso y medidas
      </BlockTitle>
      {q.isPending ? (
        <Skeleton className="h-48" />
      ) : rows.length === 0 ? (
        <EmptyNote action={<Button onClick={() => setOpen(true)}>Anotar el peso de hoy</Button>}>
          {who === "me" ? "Aún no has anotado tu peso." : `Aún no hay medidas de ${name?.split(" ")[0] ?? "este cliente"}.`} Con un registro a la semana ya se ve la tendencia.
        </EmptyNote>
      ) : (
        <>
          {last && (
            <p className="mb-4 text-ink-2">
              <span className="font-narrow text-[28px] text-ink">{kg(last.weightKg)}</span> el {dayMonth(last.date)}
              {diff != null && (
                <span className="ml-2">
                  ({diff > 0 ? "+" : ""}
                  {diff.toLocaleString("es-ES")} kg desde el {dayMonth(first!.date)})
                </span>
              )}
            </p>
          )}
          {weights.length >= 2 && (
            <LineChart title="Evolución del peso" unit="kg" series={[{ key: "w", label: "Peso", color: "var(--chart-1)", marker: "circle", points: weights.map((m) => ({ x: m.date, y: m.weightKg })) }]} />
          )}
          {waist.length >= 2 && (
            <div className="mt-6">
              <h3 className="mb-1 text-[13.5px] font-medium text-ink-2">Cintura</h3>
              <LineChart title="Evolución de la cintura" unit="cm" height={160} series={[{ key: "c", label: "Cintura", color: "var(--chart-1)", marker: "circle", points: waist.map((m) => ({ x: m.date, y: m.waistCm })) }]} />
            </div>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-[13px] font-medium text-primary">Todas las medidas ({rows.length})</summary>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-[12.5px] text-ink-3">
                  <th className="py-1.5 font-normal">Fecha</th>
                  <th className="py-1.5 text-right font-normal">Peso</th>
                  <th className="py-1.5 text-right font-normal">Cintura</th>
                  <th className="py-1.5 text-right font-normal">Cadera</th>
                  <th className="py-1.5 text-right font-normal">% grasa</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((m) => (
                  <tr key={m.date} className="border-b border-rule">
                    <td className="py-1.5">
                      {dayMonth(m.date)}
                      {m.note && <span className="block text-[12.5px] text-ink-3">{m.note}</span>}
                    </td>
                    <td className="font-narrow py-1.5 text-right">{m.weightKg ?? "—"}</td>
                    <td className="font-narrow py-1.5 text-right">{m.waistCm ?? "—"}</td>
                    <td className="font-narrow py-1.5 text-right">{m.hipCm ?? "—"}</td>
                    <td className="font-narrow py-1.5 text-right">{m.bodyFatPct ?? "—"}</td>
                    <td className="text-right">
                      {who !== "me" && (
                        <button type="button" onClick={() => del.mutate(m.date, { onSuccess: () => undoToast(`Medidas del ${dayMonth(m.date)} borradas`, () => restore.mutate(m)) })} className="text-[12.5px] text-ink-3 hover:text-plate-red" aria-label={`Borrar medidas del ${dayMonth(m.date)}`}>
                          Borrar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
      <MetricPanel who={who} open={open} onClose={() => setOpen(false)} existing={rows} />
    </section>
  );
}

export function MetricPanel({ who, open, onClose, existing }: { who: Who; open: boolean; onClose: () => void; existing: BodyMetric[] }) {
  const save = useSaveMetric(who);
  const toast = useToast();
  const [f, setF] = useState({ date: today(), weightKg: "", waistCm: "", hipCm: "", bodyFatPct: "", note: "" });
  useEffect(() => {
    if (!open) return;
    const m = existing.find((x) => x.date === f.date);
    setF((v) => ({ ...v, weightKg: m?.weightKg?.toString() ?? "", waistCm: m?.waistCm?.toString() ?? "", hipCm: m?.hipCm?.toString() ?? "", bodyFatPct: m?.bodyFatPct?.toString() ?? "", note: m?.note ?? "" }));
  }, [open, f.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const submit = () =>
    save.mutate(
      { date: f.date, weightKg: n(f.weightKg), waistCm: n(f.waistCm), hipCm: n(f.hipCm), bodyFatPct: n(f.bodyFatPct), note: f.note.trim() || null },
      { onSuccess: () => (toast("Medidas guardadas"), onClose()) },
    );
  const field = (k: "weightKg" | "waistCm" | "hipCm" | "bodyFatPct", label: string, unit: string) => (
    <TextField label={label} aside={unit} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="[&_input]:font-narrow [&_input]:text-[18px]" />
  );
  return (
    <SidePanel
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Anotar medidas"
      description="Mejor siempre en las mismas condiciones: por la mañana, en ayunas y después de ir al baño."
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={![f.weightKg, f.waistCm, f.hipCm, f.bodyFatPct].some((v) => v.trim())}>
            Guardar medidas
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <TextField label="Día" type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="max-w-[220px]" />
        <div className="grid grid-cols-2 gap-4">
          {field("weightKg", "Peso", "kg")}
          {field("bodyFatPct", "Grasa corporal", "%")}
          {field("waistCm", "Cintura", "cm")}
          {field("hipCm", "Cadera", "cm")}
        </div>
        <TextArea label="Nota" aside="opcional" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <FormError message={save.isError ? errorMessage(save.error) : null} />
      </div>
    </SidePanel>
  );
}

function Loads({ who, name }: { who: Who; name?: string }) {
  const ex = useQuery(progressExercisesQuery(who));
  const [sel, setSel] = useState<string | null>(null);
  const current = sel ?? ex.data?.[0]?.exerciseId ?? null;
  const pts = useQuery({ ...progressQuery(who, current ?? ""), enabled: Boolean(current) });
  const chosen = ex.data?.find((e) => e.exerciseId === current);

  return (
    <section aria-labelledby="l-title">
      <BlockTitle id="l-title">Cargas por ejercicio</BlockTitle>
      {ex.isPending ? (
        <Skeleton className="h-48" />
      ) : (ex.data ?? []).length === 0 ? (
        <p className="text-ink-2">
          {who === "me" ? "Cuando termines entrenos anotando los kilos de tus series, aquí verás cómo progresas en cada ejercicio." : `Cuando ${name?.split(" ")[0] ?? "el cliente"} termine entrenos anotando kilos, aquí verás su progresión en cada ejercicio.`}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)] [&>*]:min-w-0">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Ejercicios con registro">
            {ex.data!.map((e) => (
              <li key={e.exerciseId} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={e.exerciseId === current}
                  onClick={() => setSel(e.exerciseId)}
                  className={cn("w-full rounded-[var(--radius-control)] px-3 py-2 text-left", e.exerciseId === current ? "bg-primary-soft" : "hover:bg-tray")}
                >
                  <span className="block max-w-[26ch] truncate text-sm font-medium text-ink">{e.exerciseName}</span>
                  <span className="font-narrow block text-[13px] text-ink-2">
                    {e.sessions} {e.sessions === 1 ? "sesión" : "sesiones"}
                    {e.bestE1rm != null && `, 1RM est. ${e.bestE1rm.toLocaleString("es-ES")} kg`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div>
            {chosen && (
              <p className="mb-3 text-ink-2">
                <span className="font-medium text-ink">{chosen.exerciseName}</span>: {chosen.sessions} {chosen.sessions === 1 ? "sesión registrada" : "sesiones registradas"}, la última el {dayMonth(chosen.lastDate)}.
              </p>
            )}
            {pts.data && pts.data.length > 0 ? (
              <>
                <LineChart
                  title={`Progresión en ${chosen?.exerciseName ?? "el ejercicio"}`}
                  unit="kg"
                  series={[
                    { key: "e", label: "1RM estimado", color: "var(--chart-1)", marker: "circle", points: pts.data.map((p) => ({ x: p.date, y: p.e1rm })) },
                    { key: "b", label: "Mejor serie", color: "var(--chart-2)", marker: "square", points: pts.data.map((p) => ({ x: p.date, y: p.bestLoadKg })) },
                  ]}
                />
                <p className="mt-3 text-[13px] text-ink-3">1RM estimado con la fórmula de Epley a partir de la mejor serie de cada sesión (solo series de 12 repeticiones o menos).</p>
                <table className="mt-4 w-full border-collapse text-sm">
                  <caption className="sr-only">Sesiones de {chosen?.exerciseName}</caption>
                  <thead>
                    <tr className="border-b border-rule text-left text-[12.5px] text-ink-3">
                      <th className="py-1.5 font-normal">Sesión</th>
                      <th className="py-1.5 text-right font-normal">Mejor serie</th>
                      <th className="py-1.5 text-right font-normal">Series</th>
                      <th className="py-1.5 text-right font-normal">Volumen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...pts.data].reverse().map((p) => (
                      <tr key={p.workoutId} className="border-b border-rule">
                        <td className="py-1.5">{dayMonth(p.date)}</td>
                        <td className="font-narrow py-1.5 text-right">
                          {p.reps} × {kg(p.bestLoadKg)}
                        </td>
                        <td className="font-narrow py-1.5 text-right">{p.sets}</td>
                        <td className="font-narrow py-1.5 text-right">{p.volumeKg.toLocaleString("es-ES")} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <Skeleton className="h-48" />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
