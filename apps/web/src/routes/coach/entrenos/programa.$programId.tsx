import { useRef, useState } from "react";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CaretLeft } from "@phosphor-icons/react";
import { MAX_PROGRAM_WEEKS, type Program, type ProgramBody, type ProgramSlot, type Progression } from "@coach/shared";
import { Button } from "../../../components/ui/button";
import { Select, TextArea, TextField, controlClass } from "../../../components/ui/field";
import { Skeleton } from "../../../components/ui/spinner";
import { useToast, useUndoToast } from "../../../components/ui/toast";
import { useConfirm } from "../../../components/ui/confirm";
import { FormError } from "../../../components/form-error";
import { ProgramAssignPanel } from "../../../components/training/program-assign-panel";
import { programQuery, useDeleteProgram, useSaveProgram } from "../../../lib/programs";
import { routinesQuery } from "../../../lib/training";
import { WEEKDAYS } from "../../../lib/dates";
import { errorMessage } from "../../../lib/api";
import { useDocumentTitle } from "../../../lib/title";
import { cn } from "../../../lib/cn";

export const Route = createFileRoute("/coach/entrenos/programa/$programId")({
  component: ProgramPage,
});

const EMPTY: ProgramBody = { name: "", description: "", weeks: 4, slots: [], progression: null };

function ProgramPage() {
  const { programId } = Route.useParams();
  const isNew = programId === "nuevo";
  const q = useQuery({ ...programQuery(programId), enabled: !isNew });
  if (!isNew && q.isPending) return <Skeleton className="h-96" />;
  if (!isNew && q.isError) return <p className="text-plate-red">{errorMessage(q.error)}</p>;
  const p = q.data;
  return <Editor key={programId} program={p} initial={p ? { name: p.name, description: p.description, weeks: p.weeks, slots: p.slots, progression: p.progression } : EMPTY} />;
}

/** Rejilla semanas × días: en cada casilla, la rutina de ese día (o descanso). */
function Editor({ program, initial }: { program?: Program; initial: ProgramBody }) {
  const id = program?.id;
  const navigate = useNavigate();
  const toast = useToast();
  const undoToast = useUndoToast();
  const ask = useConfirm();
  const save = useSaveProgram(id);
  const del = useDeleteProgram();
  const routines = useQuery(routinesQuery);
  const [doc, setDoc] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [assign, setAssign] = useState(false);
  const dirty = JSON.stringify(doc) !== saved;
  useDocumentTitle(doc.name || "Nuevo programa");
  const leaving = useRef(false);
  useBlocker({
    shouldBlockFn: async () => !leaving.current && dirty && !(await ask({ title: "Hay cambios sin guardar", body: "Si sales ahora, se pierden.", confirm: "Salir sin guardar", danger: true })),
    enableBeforeUnload: () => !leaving.current && dirty,
  });

  const at = (week: number, weekday: number) => doc.slots.find((s) => s.week === week && s.weekday === weekday)?.routineId ?? "";
  const setAt = (week: number, weekday: number, routineId: string) =>
    setDoc((d) => ({
      ...d,
      slots: [...d.slots.filter((s) => !(s.week === week && s.weekday === weekday)), ...(routineId ? [{ week, weekday, routineId }] : [])].sort((a, b) => a.week - b.week || a.weekday - b.weekday),
    }));
  const copyFirstWeek = () => {
    const before = doc.slots;
    const first = doc.slots.filter((s) => s.week === 1);
    const all: ProgramSlot[] = [];
    for (let w = 1; w <= doc.weeks; w++) all.push(...first.map((s) => ({ ...s, week: w })));
    setDoc((d) => ({ ...d, slots: all }));
    undoToast("Semana 1 copiada al resto", () => setDoc((d) => ({ ...d, slots: before })));
  };
  const setWeeks = (n: number) => {
    const weeks = Math.max(1, Math.min(MAX_PROGRAM_WEEKS, n));
    const before = doc;
    setDoc((d) => ({ ...d, weeks, slots: d.slots.filter((s) => s.week <= weeks) }));
    if (doc.slots.some((s) => s.week > weeks)) undoToast(`Quitadas las semanas desde la ${weeks + 1}`, () => setDoc(before));
  };
  const setProg = (kind: "none" | Progression["kind"], step = doc.progression?.step ?? 2.5) => setDoc((d) => ({ ...d, progression: kind === "none" ? null : { kind, step } }));

  const submit = () =>
    save.mutate(doc, {
      onSuccess: (p) => {
        setSaved(JSON.stringify(doc));
        toast(id ? "Programa guardado" : "Programa creado");
        if (!id) {
          leaving.current = true;
          void navigate({ to: "/coach/entrenos/programa/$programId", params: { programId: p.id }, replace: true });
        }
      },
    });

  const perWeek = (w: number) => doc.slots.filter((s) => s.week === w).length;

  return (
    <div className="pb-24">
      <Link to="/coach/entrenos" search={{ vista: "programas" }} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <CaretLeft size={15} /> Programas
      </Link>
      <div className="flex flex-col gap-5">
        <input
          value={doc.name}
          onChange={(e) => setDoc({ ...doc, name: e.target.value })}
          aria-label="Nombre del programa"
          placeholder="Nombre del programa (p. ej. «Readaptación LCA, fase 2»)"
          className="font-wide bg-transparent text-[30px] leading-tight outline-none placeholder:text-ink-3 focus:underline"
        />
        <TextArea label="Descripción" aside="opcional" rows={2} value={doc.description} onChange={(e) => setDoc({ ...doc, description: e.target.value })} className="max-w-[760px]" />
        <div className="flex flex-wrap items-end gap-4">
          <TextField label="Semanas" type="number" min={1} max={MAX_PROGRAM_WEEKS} value={doc.weeks} onChange={(e) => setWeeks(Number(e.target.value) || 1)} className="w-[120px]" />
          <Select label="Carga" value={doc.progression?.kind ?? "none"} onChange={(e) => setProg(e.target.value as "none" | "kg" | "pct")} className="min-w-[250px]">
            <option value="none">La misma todas las semanas</option>
            <option value="kg">Subir kilos cada semana</option>
            <option value="pct">Subir un porcentaje cada semana</option>
          </Select>
          {doc.progression && (
            <TextField
              label="Cuánto"
              inputMode="decimal"
              aside={doc.progression.kind === "kg" ? "kg/sem." : "%/sem."}
              defaultValue={String(doc.progression.step).replace(".", ",")}
              onChange={(e) => {
                const n = Number(e.target.value.replace(",", "."));
                if (n >= 0.5 && n <= 20) setProg(doc.progression!.kind, n);
              }}
              className="w-[150px]"
            />
          )}
          <Button variant="secondary" onClick={copyFirstWeek} disabled={perWeek(1) === 0 || doc.weeks === 1}>
            Copiar la semana 1 a todas
          </Button>
        </div>

        {routines.data?.length === 0 ? (
          <p className="text-sm text-ink-2">Necesitas rutinas en tu biblioteca para montar un programa.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-zone)] border border-rule" tabIndex={0} role="region" aria-label="Semanas del programa">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="bg-tray text-left text-[13px] text-ink-2">
                  <th scope="col" className="w-[92px] px-3 py-2 font-medium">Semana</th>
                  {WEEKDAYS.map((d) => (
                    <th key={d.n} scope="col" className="px-1.5 py-2 font-medium">
                      {d.long}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: doc.weeks }, (_, i) => i + 1).map((w) => (
                  <tr key={w} className="border-t border-rule">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <span className="font-narrow text-[17px] text-ink">{w}</span>
                      <span className="block text-[12px] text-ink-3">{perWeek(w)} {perWeek(w) === 1 ? "día" : "días"}</span>
                    </th>
                    {WEEKDAYS.map((d) => {
                      const v = at(w, d.n);
                      return (
                        <td key={d.n} className="px-1 py-1.5">
                          <select
                            value={v}
                            onChange={(e) => setAt(w, d.n, e.target.value)}
                            aria-label={`Semana ${w}, ${d.long}`}
                            className={cn(controlClass, "h-9 px-1.5 text-[13px]", v ? "border-primary bg-primary-soft text-ink" : "text-ink-3")}
                          >
                            <option value="">Descanso</option>
                            {(routines.data ?? []).map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-rule bg-paper/95 backdrop-blur-sm md:bottom-0">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <p className="text-sm text-ink-2">
            {doc.slots.length} entrenos en {doc.weeks} {doc.weeks === 1 ? "semana" : "semanas"}
            {dirty ? ", cambios sin guardar" : id ? ", guardado" : ""}
          </p>
          <FormError message={save.isError ? errorMessage(save.error) : null} />
          <div className="ml-auto flex gap-2">
            {id && (
              <Button
                variant="quiet"
                onClick={async () =>
                  (await ask({ title: "Borrar el programa", body: "Sale de tu biblioteca. Lo ya aplicado a clientes se mantiene.", confirm: "Borrar programa", danger: true })) &&
                  del.mutate(id, { onError: (e) => toast(errorMessage(e), "error"), onSuccess: () => ((leaving.current = true), navigate({ to: "/coach/entrenos", search: { vista: "programas" } })) })
                }
              >
                Borrar
              </Button>
            )}
            {id && !dirty && (
              <Button variant="secondary" onClick={() => setAssign(true)} disabled={doc.slots.length === 0}>
                Aplicar a clientes
              </Button>
            )}
            <Button onClick={submit} loading={save.isPending} disabled={(Boolean(id) && !dirty) || !doc.name.trim()}>
              {id ? "Guardar cambios" : "Crear programa"}
            </Button>
          </div>
        </div>
      </div>
      {assign && program && <ProgramAssignPanel program={{ ...program, ...doc }} onClose={() => setAssign(false)} />}
    </div>
  );
}
