import { useRef, useState } from "react";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { takeDraft } from "../../../lib/drafts";
import { ArrowDown, ArrowUp, CaretLeft, LinkSimple, LinkSimpleBreak, Plus, Trash } from "@phosphor-icons/react";
import type { Exercise, RoutineBlock, RoutineBody, RoutineItem } from "@coach/shared";
import { Button, IconButton } from "../../../components/ui/button";
import { controlClass } from "../../../components/ui/field";
import { Skeleton } from "../../../components/ui/spinner";
import { useToast, useUndoToast } from "../../../components/ui/toast";
import { useConfirm } from "../../../components/ui/confirm";
import { FormError } from "../../../components/form-error";
import { ExercisePicker } from "../../../components/training/exercise-picker";
import { AssignPanel } from "../../../components/training/assign-panel";
import { itemLabels, newId, routineQuery, useRoutineAction, useSaveRoutine } from "../../../lib/training";
import { errorMessage } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { useDocumentTitle } from "../../../lib/title";

export const Route = createFileRoute("/coach/entrenos/$routineId")({
  component: RoutinePage,
});

const EMPTY: RoutineBody = { name: "", description: "", blocks: [{ id: "b-" + newId(), name: "Bloque principal", items: [] }] };

function RoutinePage() {
  const { routineId } = Route.useParams();
  const isNew = routineId === "nueva";
  // Borrador que viene de la IA (se lee una sola vez).
  const [draft] = useState(() => (isNew ? takeDraft("routine") : undefined));
  const q = useQuery({ ...routineQuery(routineId), enabled: !isNew });
  if (!isNew && q.isPending) return <Skeleton className="h-96" />;
  if (!isNew && q.isError) return <p className="text-plate-red">{errorMessage(q.error)}</p>;
  return <Editor key={routineId} id={isNew ? undefined : routineId} initial={isNew ? (draft ?? EMPTY) : { name: q.data!.name, description: q.data!.description, blocks: q.data!.blocks }} fromDraft={Boolean(isNew && draft)} />;
}

/** Editor de rutina con forma de hoja de entrenamiento: bloques, y en cada uno las líneas A1, A2, B1… */
function Editor({ id, initial, fromDraft = false }: { id?: string; initial: RoutineBody; fromDraft?: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const save = useSaveRoutine(id);
  const act = useRoutineAction();
  const ask = useConfirm();
  const undoToast = useUndoToast();
  const [doc, setDoc] = useState<RoutineBody>(initial);
  // Un borrador de la IA cuenta como «sin guardar» desde el principio.
  const [saved, setSaved] = useState(JSON.stringify(fromDraft ? EMPTY : initial));
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const dirty = JSON.stringify(doc) !== saved;
  useDocumentTitle(doc.name || "Nueva rutina");
  const labels = itemLabels(doc.blocks);
  const routine = useQuery({ ...routineQuery(id ?? ""), enabled: Boolean(id) }).data;

  // Tras guardar o borrar se navega en el mismo tick en que `dirty` aún es true: el ref evita el aviso falso.
  const leaving = useRef(false);
  useBlocker({
    shouldBlockFn: async () => !leaving.current && dirty && !(await ask({ title: "Hay cambios sin guardar", body: "Si sales ahora, se pierden.", confirm: "Salir sin guardar", danger: true })),
    enableBeforeUnload: () => !leaving.current && dirty,
  });

  const setBlocks = (fn: (b: RoutineBlock[]) => RoutineBlock[]) => setDoc((d) => ({ ...d, blocks: fn(d.blocks) }));
  const setItem = (bid: string, iid: string, patch: Partial<RoutineItem>) =>
    setBlocks((bs) => bs.map((b) => (b.id !== bid ? b : { ...b, items: b.items.map((it) => (it.id === iid ? { ...it, ...patch } : it)) })));
  const addExercise = (bid: string, e: Exercise) =>
    setBlocks((bs) =>
      bs.map((b) =>
        b.id !== bid
          ? b
          : { ...b, items: [...b.items, { id: "i-" + newId(), exerciseId: e.id, exerciseName: e.name, sets: 3, reps: "8-10", load: "", effort: "", tempo: "", restSec: 90, notes: "", group: null }] },
      ),
    );
  const move = (bid: string, idx: number, dir: -1 | 1) =>
    setBlocks((bs) =>
      bs.map((b) => {
        if (b.id !== bid) return b;
        const items = [...b.items];
        const j = idx + dir;
        if (j < 0 || j >= items.length) return b;
        [items[idx], items[j]] = [items[j]!, items[idx]!];
        return { ...b, items };
      }),
    );
  /** Une la línea con la anterior (superserie) o la separa. */
  const toggleLink = (bid: string, idx: number) =>
    setBlocks((bs) =>
      bs.map((b) => {
        if (b.id !== bid || idx === 0) return b;
        const items = b.items.map((x) => ({ ...x }));
        const cur = items[idx]!;
        const prev = items[idx - 1]!;
        if (cur.group && cur.group === prev.group) {
          cur.group = null;
          if (!items[idx - 2] || items[idx - 2]!.group !== prev.group) prev.group = null;
        } else {
          const g = prev.group ?? newId().slice(0, 4);
          prev.group = g;
          cur.group = g;
        }
        return { ...b, items };
      }),
    );

  const submit = () =>
    save.mutate(doc, {
      onSuccess: (r) => {
        setSaved(JSON.stringify(doc));
        toast(id ? "Rutina guardada" : "Rutina creada");
        if (!id) {
          leaving.current = true;
          void navigate({ to: "/coach/entrenos/$routineId", params: { routineId: r.id }, replace: true });
        }
      },
    });

  const total = doc.blocks.reduce((n, b) => n + b.items.length, 0);
  const cell = cn(controlClass, "h-9 px-2 text-sm");

  return (
    <div className="pb-24">
      <Link to="/coach/entrenos" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <CaretLeft size={15} /> Entrenos
      </Link>
      <div className="flex flex-col gap-2">
        <label htmlFor="r-name" className="sr-only">
          Nombre de la rutina
        </label>
        <input
          id="r-name"
          value={doc.name}
          onChange={(e) => setDoc({ ...doc, name: e.target.value })}
          placeholder="Nombre de la rutina"
          className="font-wide w-full border-b border-transparent bg-transparent py-1 text-[30px] leading-tight outline-none placeholder:text-ink-3 hover:border-rule focus:border-primary sm:text-[34px]"
        />
        <label htmlFor="r-desc" className="sr-only">
          Descripción
        </label>
        <textarea
          id="r-desc"
          value={doc.description}
          onChange={(e) => setDoc({ ...doc, description: e.target.value })}
          placeholder="Para qué es y cómo progresar (opcional)"
          rows={1}
          className="w-full max-w-[70ch] resize-none bg-transparent text-ink-2 outline-none placeholder:text-ink-3 focus:text-ink"
        />
      </div>

      <div className="mt-8 flex flex-col gap-10">
        {doc.blocks.map((b, bi) => (
          <section key={b.id} aria-label={b.name || `Bloque ${bi + 1}`}>
            <div className="mb-2 flex items-center gap-2">
              <input
                value={b.name}
                onChange={(e) => setBlocks((bs) => bs.map((x) => (x.id === b.id ? { ...x, name: e.target.value } : x)))}
                aria-label="Nombre del bloque"
                placeholder="Nombre del bloque"
                className="font-wide min-w-0 flex-1 bg-transparent text-[19px] outline-none placeholder:text-ink-3 focus:underline"
              />
              {doc.blocks.length > 1 && (
                <IconButton label="Quitar bloque" onClick={() => {
                    const before = doc.blocks;
                    setBlocks((bs) => bs.filter((x) => x.id !== b.id));
                    if (b.items.length) undoToast(`Bloque «${b.name || bi + 1}» quitado`, () => setBlocks(() => before));
                  }}>
                  <Trash size={17} />
                </IconButton>
              )}
            </div>

            {b.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-rule text-[12.5px] text-ink-3">
                      <th className="w-10 py-2 font-normal" />
                      <th className="py-2 font-normal">Ejercicio</th>
                      <th className="w-16 py-2 font-normal">Series</th>
                      <th className="w-24 py-2 font-normal">Reps</th>
                      <th className="w-28 py-2 font-normal">Carga</th>
                      <th className="w-24 py-2 font-normal">RIR / RPE</th>
                      <th className="w-20 py-2 font-normal">Tempo</th>
                      <th className="w-20 py-2 font-normal">Desc. (s)</th>
                      <th className="w-32 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {b.items.map((it, idx) => {
                      const ex = bi === 0 && idx === 0; // ejemplos de formato solo en la primera línea
                      const linked = idx > 0 && it.group && it.group === b.items[idx - 1]!.group;
                      return (
                        <tr key={it.id} className={cn("align-top", !linked && "border-t border-rule first:border-t-0")}>
                          <td className="font-narrow py-2.5 pr-2 text-[16px] text-primary">{labels.get(it.id)}</td>
                          <td className="py-2 pr-3">
                            <p className="pt-1.5 text-[14.5px] font-medium text-ink">{it.exerciseName}</p>
                            <input
                              value={it.notes}
                              onChange={(e) => setItem(b.id, it.id, { notes: e.target.value })}
                              placeholder={ex ? "Nota para el cliente" : "Nota"}
                              aria-label={`Nota de ${it.exerciseName}`}
                              className="mt-0.5 w-full bg-transparent text-[13px] text-ink-2 outline-none placeholder:text-ink-3 focus:text-ink"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <input aria-label="Series" type="number" min={1} max={20} className={cell} value={it.sets} onChange={(e) => setItem(b.id, it.id, { sets: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
                          </td>
                          <td className="py-2 pr-2">
                            <input aria-label="Repeticiones" className={cell} value={it.reps} onChange={(e) => setItem(b.id, it.id, { reps: e.target.value })} placeholder={ex ? "8-10" : undefined} />
                          </td>
                          <td className="py-2 pr-2">
                            <input aria-label="Carga" className={cell} value={it.load} onChange={(e) => setItem(b.id, it.id, { load: e.target.value })} placeholder={ex ? "70 % 1RM" : undefined} />
                          </td>
                          <td className="py-2 pr-2">
                            <input aria-label="RIR o RPE" className={cell} value={it.effort} onChange={(e) => setItem(b.id, it.id, { effort: e.target.value })} placeholder={ex ? "RIR 2" : undefined} />
                          </td>
                          <td className="py-2 pr-2">
                            <input aria-label="Tempo" className={cell} value={it.tempo} onChange={(e) => setItem(b.id, it.id, { tempo: e.target.value })} placeholder={ex ? "31X1" : undefined} />
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              aria-label="Descanso en segundos"
                              type="number"
                              min={0}
                              max={900}
                              step={15}
                              className={cell}
                              value={it.restSec ?? ""}
                              onChange={(e) => setItem(b.id, it.id, { restSec: e.target.value === "" ? null : Math.max(0, Math.min(900, Number(e.target.value))) })}
                            />
                          </td>
                          <td className="py-2">
                            <div className="flex justify-end">
                              {idx > 0 && (
                                <IconButton label={linked ? "Separar de la anterior" : "Superserie con la anterior"} onClick={() => toggleLink(b.id, idx)} className={linked ? "text-primary" : undefined}>
                                  {linked ? <LinkSimpleBreak size={17} /> : <LinkSimple size={17} />}
                                </IconButton>
                              )}
                              <IconButton label="Subir" onClick={() => move(b.id, idx, -1)} disabled={idx === 0} className="disabled:opacity-30">
                                <ArrowUp size={16} />
                              </IconButton>
                              <IconButton label="Bajar" onClick={() => move(b.id, idx, 1)} disabled={idx === b.items.length - 1} className="disabled:opacity-30">
                                <ArrowDown size={16} />
                              </IconButton>
                              <IconButton label={`Quitar ${it.exerciseName}`} onClick={() => setBlocks((bs) => bs.map((x) => (x.id === b.id ? { ...x, items: x.items.filter((y) => y.id !== it.id) } : x)))}>
                                <Trash size={16} />
                              </IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              onClick={() => setPickerFor(b.id)}
              className="mt-2 flex w-full items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-rule-strong px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary-soft"
            >
              <Plus size={15} weight="bold" /> Añadir ejercicio{b.name ? ` a «${b.name}»` : ""}
            </button>
          </section>
        ))}
        <Button variant="secondary" className="self-start" icon={<Plus size={15} />} onClick={() => setBlocks((bs) => [...bs, { id: "b-" + newId(), name: `Bloque ${bs.length + 1}`, items: [] }])}>
          Añadir bloque
        </Button>
      </div>

      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-rule bg-paper/95 backdrop-blur-sm md:bottom-0">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <p className="text-sm text-ink-2">
            {total} {total === 1 ? "ejercicio" : "ejercicios"}
            {dirty ? ", cambios sin guardar" : id ? ", guardada" : ""}
          </p>
          <FormError message={save.isError ? errorMessage(save.error) : null} />
          <div className="ml-auto flex gap-2">
            {id && (
              <Button
                variant="quiet"
                onClick={async () => (await ask({ title: "Borrar la rutina", body: "Sale de tu biblioteca. Lo ya asignado a clientes se mantiene.", confirm: "Borrar rutina", danger: true })) && act.mutate({ id, action: "delete" }, { onSuccess: () => ((leaving.current = true), navigate({ to: "/coach/entrenos" })) })}
              >
                Borrar
              </Button>
            )}
            {id && (
              <Button variant="secondary" onClick={() => setAssignOpen(true)} disabled={dirty || total === 0} title={dirty ? "Guarda antes de asignar" : undefined}>
                Asignar
              </Button>
            )}
            <Button onClick={submit} loading={save.isPending} disabled={!doc.name.trim() || (!dirty && Boolean(id))}>
              {id ? "Guardar" : "Crear rutina"}
            </Button>
          </div>
        </div>
      </div>

      <ExercisePicker open={pickerFor !== null} onOpenChange={(o) => !o && setPickerFor(null)} onPick={(e) => pickerFor && addExercise(pickerFor, e)} />
      {routine && <AssignPanel open={assignOpen} onOpenChange={setAssignOpen} routine={routine} />}
    </div>
  );
}

