import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EQUIPMENT, EQUIPMENT_LABEL, type AiSource, type Equipment, type GeneratedMealPlan, type GeneratedProgram, type GeneratedRoutine, type Routine, type Program } from "@coach/shared";
import { SidePanel } from "../ui/dialog";
import { Button } from "../ui/button";
import { Checkbox, Select, TextArea, TextField } from "../ui/field";
import { useToast } from "../ui/toast";
import { FormError } from "../form-error";
import { aiStatusQuery, useGenerateMealPlan, useGenerateProgram, useGenerateRoutine } from "../../lib/ai";
import { setDraft } from "../../lib/drafts";
import { clientsQuery } from "../../lib/queries";
import { useCreatePlan } from "../../lib/nutrition";
import { api, errorMessage } from "../../lib/api";
import { WEEKDAYS } from "../../lib/dates";
import { cn } from "../../lib/cn";

export type GenerateKind = "routine" | "program" | "mealPlan";
const TITLE: Record<GenerateKind, string> = { routine: "Rutina con IA", program: "Programa con IA", mealPlan: "Plan de comidas con IA" };

/**
 * Generar un borrador con la IA a partir de los documentos del entrenador. Lo propuesto se revisa aquí y se abre en el
 * editor de siempre; nada llega al cliente sin que el entrenador lo guarde.
 */
export function GeneratePanel({ kind: initialKind, clientId: initialClient, onClose }: { kind: GenerateKind; clientId?: string; onClose: () => void }) {
  const [kind, setKind] = useState(initialKind);
  const status = useQuery(aiStatusQuery);
  const clients = useQuery(clientsQuery());
  const pool = (clients.data ?? []).filter((c) => c.status === "active" || c.status === "no_account");
  const [clientId, setClientId] = useState(initialClient ?? "");
  const [includeHealth, setIncludeHealth] = useState(false);
  const [notes, setNotes] = useState("");
  const [focus, setFocus] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [weeks, setWeeks] = useState("4");
  const [days, setDays] = useState("3");
  const [kcal, setKcal] = useState("");
  const [meals, setMeals] = useState("4");
  const [restrictions, setRestrictions] = useState("");
  const routine = useGenerateRoutine();
  const program = useGenerateProgram();
  const meal = useGenerateMealPlan();
  const m = kind === "routine" ? routine : kind === "program" ? program : meal;
  const common = { clientId: clientId || null, includeHealth, notes };
  const generate = () => {
    if (kind === "routine") routine.mutate({ ...common, focus, minutes: Number(minutes) || 60, equipment });
    else if (kind === "program") program.mutate({ ...common, focus, minutes: Number(minutes) || 60, equipment, weeks: Number(weeks) || 4, daysPerWeek: Number(days) || 3 });
    else meal.mutate({ ...common, goal: focus, kcal: kcal.trim() ? Number(kcal) : null, mealsPerDay: Number(meals) || 4, restrictions });
  };
  const result = m.data;

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={TITLE[kind]}
      description={
        status.data && !status.data.enabled
          ? "La IA no está configurada todavía."
          : `Se basa en tus documentos${status.data ? ` (${status.data.documents})` : ""}. Lo que propone es un borrador: lo revisas y lo guardas tú.`
      }
      footer={
        result ? (
          <>
            <Button variant="quiet" onClick={() => m.reset()}>
              Cambiar la petición
            </Button>
            <UseResult kind={kind} result={result} clientId={clientId || null} onDone={onClose} />
          </>
        ) : (
          <>
            <Button variant="quiet" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={generate} loading={m.isPending} disabled={focus.trim().length < 3 || status.data?.enabled === false}>
              {m.isPending ? "Pensando…" : "Generar borrador"}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <Preview kind={kind} result={result} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-control)] border border-rule-strong" role="radiogroup" aria-label="Qué quieres generar">
            {(["routine", "program", "mealPlan"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("h-10 text-sm font-medium not-first:border-l not-first:border-rule-strong", kind === k ? "bg-ink text-paper" : "text-ink-2 hover:bg-tray")}>
                {k === "routine" ? "Rutina" : k === "program" ? "Programa" : "Dieta"}
              </button>
            ))}
          </div>
          <TextArea
            label={kind === "mealPlan" ? "Objetivo" : "Qué quieres"}
            rows={2}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder={kind === "mealPlan" ? "Perder grasa manteniendo la fuerza, entrena 4 días" : kind === "program" ? "Readaptación de LCA, fase 2: fuerza de cuádriceps y control unilateral" : "Pierna, fuerza, rodilla operada hace 6 meses"}
          />
          {kind !== "mealPlan" ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                <TextField label="Minutos" type="number" min={15} max={180} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                {kind === "program" && <TextField label="Semanas" type="number" min={1} max={16} value={weeks} onChange={(e) => setWeeks(e.target.value)} />}
                {kind === "program" && <TextField label="Días/semana" type="number" min={1} max={6} value={days} onChange={(e) => setDays(e.target.value)} />}
              </div>
              <fieldset>
                <legend className="mb-2 text-[13.5px] font-medium">Material disponible <span className="font-normal text-ink-3">(si no marcas nada: estudio completo)</span></legend>
                <div className="flex flex-wrap gap-1.5">
                  {EQUIPMENT.map((e) => (
                    <button key={e} type="button" aria-pressed={equipment.includes(e)} onClick={() => setEquipment((s) => (s.includes(e) ? s.filter((x) => x !== e) : [...s, e]))} className={cn("h-9 rounded-[var(--radius-control)] px-3 text-[13px] font-medium", equipment.includes(e) ? "bg-primary text-primary-ink" : "bg-tray text-ink-2 hover:bg-tray-2")}>
                      {EQUIPMENT_LABEL[e]}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Kcal al día" aside="opcional" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="2100" />
              <TextField label="Comidas al día" type="number" min={2} max={7} value={meals} onChange={(e) => setMeals(e.target.value)} />
              <div className="col-span-2">
                <TextField label="Restricciones y gustos" aside="opcional" value={restrictions} onChange={(e) => setRestrictions(e.target.value)} placeholder="Sin lactosa, no le gusta el pescado" />
              </div>
            </div>
          )}
          <Select label="Para" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Plan general (sin cliente)</option>
            {pool.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {clientId && <Checkbox label="Tener en cuenta sus lesiones y limitaciones" description="Se envían sin su nombre." checked={includeHealth} onChange={(e) => setIncludeHealth(e.target.checked)} />}
          <TextArea label="Indicaciones" aside="opcional" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nada de impacto todavía; RIR 2–3" />
          <p className="border-l-[3px] border-rule-strong pl-3 text-[13px] text-ink-2">
            Se envía a Gemini (Google) en su plan gratuito, que puede usar lo que recibe para mejorar sus servicios. Por eso nunca se mandan nombres, contactos ni notas privadas: solo edad aproximada, objetivo, material y, si lo marcas, las lesiones.
          </p>
          <FormError message={m.isError ? errorMessage(m.error) : null} />
        </div>
      )}
    </SidePanel>
  );
}

function Sources({ sources }: { sources: AiSource[] }) {
  if (!sources.length) return <p className="text-[13px] text-ink-3">Sin documentos relacionados: se ha basado en criterios generales.</p>;
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer font-medium text-primary">Basado en {sources.length === 1 ? "1 fragmento" : `${sources.length} fragmentos`} de tus documentos</summary>
      <ul className="mt-2 flex flex-col gap-2">
        {sources.map((s, i) => (
          <li key={i} className="border-l-[3px] border-rule-strong pl-3 text-ink-2">
            <span className="font-medium text-ink">{s.title}</span>: {s.excerpt}
          </li>
        ))}
      </ul>
    </details>
  );
}

function RoutinePreview({ r }: { r: GeneratedRoutine["routine"] }) {
  return (
    <div>
      <h3 className="font-wide text-[19px]">{r.name}</h3>
      {r.description && <p className="mt-1 text-sm text-ink-2">{r.description}</p>}
      {r.blocks.map((b) => (
        <div key={b.id} className="mt-3">
          <p className="text-[13.5px] font-medium text-ink-2">{b.name}</p>
          <ul className="divide-y divide-rule border-y border-rule">
            {b.items.map((it) => (
              <li key={it.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  {it.exerciseName}
                  {it.notes && <span className="block text-[12.5px] text-ink-3">{it.notes}</span>}
                </span>
                <span className="font-narrow shrink-0 text-[15px]">
                  {it.sets} × {it.reps} {it.load && <span className="text-ink-2">{it.load}</span>} {it.effort && <span className="text-ink-3">{it.effort}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Preview({ kind, result }: { kind: GenerateKind; result: GeneratedRoutine | GeneratedProgram | GeneratedMealPlan }) {
  const unmatched = "unmatched" in result ? result.unmatched : [];
  return (
    <div className="flex flex-col gap-5">
      {unmatched.length > 0 && (
        <p className="border-l-[5px] border-plate-yellow bg-tray px-3 py-2 text-[13.5px]">
          No están en tu biblioteca y se han quitado: {unmatched.join(", ")}. Puedes crearlos y añadirlos en el editor.
        </p>
      )}
      {kind === "routine" && <RoutinePreview r={(result as GeneratedRoutine).routine} />}
      {kind === "program" &&
        (() => {
          const p = result as GeneratedProgram;
          return (
            <>
              <div>
                <h3 className="font-wide text-[19px]">{p.name}</h3>
                <p className="mt-1 text-sm text-ink-2">
                  {p.weeks} semanas{p.progression ? `, +${String(p.progression.step).replace(".", ",")} kg por semana` : ""}. {p.description}
                </p>
              </div>
              {p.routines.map((x, i) => (
                <div key={i}>
                  <p className="mb-1 text-[13px] text-ink-2">{x.weekdays.map((d) => WEEKDAYS.find((w) => w.n === d)?.long).join(" y ") || "Sin día asignado"}</p>
                  <RoutinePreview r={x.routine} />
                </div>
              ))}
            </>
          );
        })()}
      {kind === "mealPlan" &&
        (() => {
          const p = (result as GeneratedMealPlan).plan;
          return (
            <div>
              <h3 className="font-wide text-[19px]">{p.name}</h3>
              <p className="font-narrow mt-1 text-[15px] text-ink-2">
                {[p.targets.kcal && `${p.targets.kcal} kcal`, p.targets.protein && `P ${p.targets.protein} g`, p.targets.carbs && `HC ${p.targets.carbs} g`, p.targets.fat && `G ${p.targets.fat} g`].filter(Boolean).join(", ")}
              </p>
              {p.days[0]!.meals.map((ml) => (
                <div key={ml.id} className="mt-3">
                  <p className="text-[13.5px] font-medium">
                    {ml.name} {ml.time && <span className="font-narrow text-ink-3">{ml.time}</span>}
                  </p>
                  <p className="text-sm text-ink-2">{ml.items.map((i) => `${i.food}${i.qty ? ` (${i.qty})` : ""}`).join(", ")}</p>
                  {ml.alternatives && <p className="text-[13px] text-ink-3">Alternativas: {ml.alternatives}</p>}
                </div>
              ))}
            </div>
          );
        })()}
      <Sources sources={result.sources} />
    </div>
  );
}

function UseResult({ kind, result, clientId, onDone }: { kind: GenerateKind; result: GeneratedRoutine | GeneratedProgram | GeneratedMealPlan; clientId: string | null; onDone: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const createPlan = useCreatePlan();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (kind === "routine")
    return (
      <Button
        onClick={() => {
          setDraft("routine", (result as GeneratedRoutine).routine);
          onDone();
          void navigate({ to: "/coach/entrenos/$routineId", params: { routineId: "nueva" } });
        }}
      >
        Abrir en el editor
      </Button>
    );
  if (kind === "mealPlan")
    return (
      <Button
        loading={createPlan.isPending}
        onClick={() =>
          createPlan.mutate(
            { clientId, body: (result as GeneratedMealPlan).plan },
            { onSuccess: (p) => (toast(clientId ? "Plan creado para el cliente" : "Plantilla creada"), onDone(), navigate({ to: "/coach/nutricion/$planId", params: { planId: p.id } })) },
          )
        }
      >
        {clientId ? "Crear su plan y revisarlo" : "Crear plantilla y revisarla"}
      </Button>
    );
  const p = result as GeneratedProgram;
  return (
    <div className="flex flex-col items-end gap-1">
      {error && <FormError message={error} />}
      <Button
        loading={busy}
        disabled={p.routines.length === 0}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const slots = [];
            for (const x of p.routines) {
              const r = await api<Routine>("/routines", { body: x.routine });
              for (let w = 1; w <= p.weeks; w++) for (const d of x.weekdays) slots.push({ week: w, weekday: d, routineId: r.id });
            }
            const prog = await api<Program>("/programs", { body: { name: p.name, description: p.description, weeks: p.weeks, slots, progression: p.progression } });
            void qc.invalidateQueries({ queryKey: ["routines"] });
            void qc.invalidateQueries({ queryKey: ["programs"] });
            toast(`Programa creado con ${p.routines.length} rutinas`);
            onDone();
            void navigate({ to: "/coach/entrenos/programa/$programId", params: { programId: prog.id } });
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Crear rutinas y programa
      </Button>
    </div>
  );
}
