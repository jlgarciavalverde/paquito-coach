import { useDeferredValue, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass, Plus, Sparkle } from "@phosphor-icons/react";
import { useCoachActions } from "../../../components/coach-actions";
import { z } from "zod";
import { MUSCLE_LABEL, MUSCLES, type Exercise, type Muscle, type Program, type Routine } from "@coach/shared";
import { Button, buttonClass } from "../../../components/ui/button";
import { controlClass } from "../../../components/ui/field";
import { EmptyNote, PageTitle } from "../../../components/ui/layout";
import { Skeleton } from "../../../components/ui/spinner";
import { TabPanel, Tabs } from "../../../components/ui/tabs";
import { useToast } from "../../../components/ui/toast";
import { AssignPanel } from "../../../components/training/assign-panel";
import { ProgramAssignPanel } from "../../../components/training/program-assign-panel";
import { programsQuery } from "../../../lib/programs";
import { ExercisePanel } from "../../../components/training/exercise-panel";
import { exercisesQuery, routinesQuery, useRoutineAction } from "../../../lib/training";
import { relativeTime } from "../../../lib/format";
import { cn } from "../../../lib/cn";
import { QueryError } from "../../../components/ui/query-state";
import { errorMessage } from "../../../lib/api";

export const Route = createFileRoute("/coach/entrenos/")({
  validateSearch: z.object({ vista: z.enum(["rutinas", "programas", "ejercicios"]).optional() }),
  component: Library,
});

function Library() {
  const { vista = "rutinas" } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <>
      <PageTitle title="Entrenos" lead="Tu biblioteca de rutinas, programas de varias semanas y ejercicios." />
      <Tabs
        value={vista}
        onValueChange={(v) => navigate({ to: "/coach/entrenos", search: { vista: v as "rutinas" | "programas" | "ejercicios" }, replace: true })}
        items={[
          { value: "rutinas", label: "Rutinas" },
          { value: "programas", label: "Programas" },
          { value: "ejercicios", label: "Ejercicios" },
        ]}
      >
        <TabPanel value="rutinas">
          <Routines />
        </TabPanel>
        <TabPanel value="programas">
          <Programs />
        </TabPanel>
        <TabPanel value="ejercicios">
          <Exercises />
        </TabPanel>
      </Tabs>
    </>
  );
}

function Routines() {
  const q = useQuery(routinesQuery);
  const act = useRoutineAction();
  const toast = useToast();
  const [assign, setAssign] = useState<Routine | null>(null);
  const newBtn = (
    <Link to="/coach/entrenos/$routineId" params={{ routineId: "nueva" }} className={buttonClass()}>
      <Plus size={16} weight="bold" /> Nueva rutina
    </Link>
  );
  if (q.isPending) return <Skeleton className="h-48" />;
  if (q.isError) return <QueryError q={q} />;
  if ((q.data ?? []).length === 0)
    return (
      <EmptyNote action={newBtn}>
        Aún no tienes rutinas. Crea la primera (por ejemplo «Pierna A» o «Readaptación rodilla, fase 1») y luego asígnala a tus clientes.
      </EmptyNote>
    );
  return (
    <>
      <div className="mb-3 flex justify-end gap-2">
        <AiButton kind="routine" />
        {newBtn}
      </div>
      <ul className="divide-y divide-rule border-y border-rule">
        {q.data!.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
            <Link to="/coach/entrenos/$routineId" params={{ routineId: r.id }} className="min-w-0 flex-1 basis-[280px] hover:text-primary">
              <span className="block font-medium text-ink">{r.name}</span>
              <span className="block text-[13px] text-ink-2">
                {r.exerciseCount} ejercicios en {r.blocks.length} {r.blocks.length === 1 ? "bloque" : "bloques"}.{" "}
                {r.assignedCount > 0 ? `Asignada a ${r.assignedCount} ${r.assignedCount === 1 ? "cliente" : "clientes"}.` : "Sin asignar."} Editada {relativeTime(r.updatedAt)}.
              </span>
            </Link>
            <div className="flex gap-1">
              <Button size="sm" variant="quiet" onClick={() => act.mutate({ id: r.id, action: "duplicate" }, { onError: (e) => toast(errorMessage(e), "error"), onSuccess: () => toast("Rutina duplicada") })}>
                Duplicar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAssign(r)} disabled={r.exerciseCount === 0}>
                Asignar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {assign && <AssignPanel key={assign.id} open onOpenChange={(o) => !o && setAssign(null)} routine={assign} />}
    </>
  );
}

function Programs() {
  const q = useQuery(programsQuery);
  const [assign, setAssign] = useState<Program | null>(null);
  const newBtn = (
    <Link to="/coach/entrenos/programa/$programId" params={{ programId: "nuevo" }} className={buttonClass()}>
      <Plus size={16} weight="bold" /> Nuevo programa
    </Link>
  );
  if (q.isPending) return <Skeleton className="h-48" />;
  if (q.isError) return <QueryError q={q} />;
  if ((q.data ?? []).length === 0)
    return (
      <EmptyNote action={newBtn}>
        Un programa encadena tus rutinas durante varias semanas (por ejemplo, «Readaptación LCA, fase 2»: 6 semanas, lunes y jueves) y sube la carga cada semana. Se aplica a un cliente de una vez.
      </EmptyNote>
    );
  return (
    <>
      <div className="mb-3 flex justify-end gap-2">
        <AiButton kind="program" />
        {newBtn}
      </div>
      <ul className="divide-y divide-rule border-y border-rule">
        {q.data!.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
            <Link to="/coach/entrenos/programa/$programId" params={{ programId: p.id }} className="min-w-0 flex-1 basis-[280px] hover:text-primary">
              <span className="block font-medium text-ink">{p.name}</span>
              <span className="block text-[13px] text-ink-2">
                {p.weeks} {p.weeks === 1 ? "semana" : "semanas"}, {p.slots.length} entrenos
                {p.progression ? `, +${String(p.progression.step).replace(".", ",")} ${p.progression.kind === "kg" ? "kg" : "%"} por semana` : ""}.{" "}
                {p.activeRuns > 0 ? `En curso con ${p.activeRuns} ${p.activeRuns === 1 ? "cliente" : "clientes"}.` : ""}
              </span>
            </Link>
            <Button size="sm" variant="secondary" onClick={() => setAssign(p)} disabled={p.slots.length === 0}>
              Aplicar
            </Button>
          </li>
        ))}
      </ul>
      {assign && <ProgramAssignPanel program={assign} onClose={() => setAssign(null)} />}
    </>
  );
}

/** «Generar con IA»: abre el panel de la IA en el tipo que toca. */
function AiButton({ kind }: { kind: "routine" | "program" }) {
  const act = useCoachActions();
  return (
    <Button variant="secondary" icon={<Sparkle size={16} />} onClick={() => act.generate(kind)}>
      Generar con IA
    </Button>
  );
}

function Exercises() {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<Muscle | "">("");
  const [own, setOwn] = useState(false);
  const [panel, setPanel] = useState<{ open: boolean; ex: Exercise | null }>({ open: false, ex: null });
  const dq = useDeferredValue(q);
  const list = useQuery(exercisesQuery({ q: dq, muscle, own, limit: 80 }));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="relative min-w-0 flex-1 basis-[220px]">
          <span className="sr-only">Buscar ejercicio</span>
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en más de 2.500 ejercicios" className={cn(controlClass, "h-10 pl-9")} />
        </label>
        <label className="sr-only" htmlFor="muscle-filter">
          Músculo
        </label>
        <select id="muscle-filter" value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle | "")} className={cn(controlClass, "h-10 w-auto")}>
          <option value="">Todos los músculos</option>
          {MUSCLES.map((m) => (
            <option key={m} value={m}>
              {MUSCLE_LABEL[m]}
            </option>
          ))}
        </select>
        <label className="flex h-10 items-center gap-2 px-2 text-sm text-ink-2">
          <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} className="accent-[var(--primary)]" /> Solo los míos
        </label>
        <Button icon={<Plus size={16} weight="bold" />} onClick={() => setPanel({ open: true, ex: null })}>
          Ejercicio propio
        </Button>
      </div>
      {list.isPending ? (
        <Skeleton className="h-64" />
      ) : list.isError ? (
        <QueryError q={list} />
      ) : (list.data ?? []).length === 0 ? (
        <p className="py-6 text-sm text-ink-2">{own ? "Todavía no has creado ejercicios propios." : "Nada con ese nombre."}</p>
      ) : (
        <ul className="grid grid-cols-1 border-t border-rule sm:grid-cols-2 sm:gap-x-8 [&>*]:min-w-0">
          {list.data!.map((e) => (
            <li key={e.id} className="border-b border-rule">
              <button type="button" onClick={() => setPanel({ open: true, ex: e })} className="flex w-full items-baseline gap-3 py-2.5 text-left hover:text-primary">
                <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{e.name}</span>
                <span className="shrink-0 text-[13px] text-ink-3">
                  {MUSCLE_LABEL[e.muscle]}
                  {e.own ? ", propio" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.data && list.data.length === 80 && <p className="mt-3 text-[13px] text-ink-3">Mostrando los 80 primeros. Afina la búsqueda para ver más.</p>}
      <p className="mt-6 text-[13px] text-ink-3">La biblioteca común sale de catálogos abiertos (free-exercise-db, wger y otros), con los nombres en español.</p>
      <ExercisePanel open={panel.open} onOpenChange={(o) => setPanel((p) => ({ ...p, open: o }))} exercise={panel.ex} />
    </>
  );
}
