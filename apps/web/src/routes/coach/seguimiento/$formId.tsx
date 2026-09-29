import { useRef, useState } from "react";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CaretLeft, Plus, Trash } from "@phosphor-icons/react";
import { QUESTION_KIND_LABEL, QuestionKind, type CheckinFormInput, type CheckinQuestion } from "@coach/shared";
import { Button, IconButton } from "../../../components/ui/button";
import { TextArea, TextField, controlClass } from "../../../components/ui/field";
import { Skeleton } from "../../../components/ui/spinner";
import { useToast, useUndoToast } from "../../../components/ui/toast";
import { useConfirm } from "../../../components/ui/confirm";
import { FormError } from "../../../components/form-error";
import { checkinFormsQuery, useArchiveCheckinForm, useSaveCheckinForm } from "../../../lib/followup";
import { newId } from "../../../lib/training";
import { errorMessage } from "../../../lib/api";
import { useDocumentTitle } from "../../../lib/title";
import { cn } from "../../../lib/cn";

export const Route = createFileRoute("/coach/seguimiento/$formId")({
  component: FormPage,
});

const q = (kind: QuestionKind, label: string, required = true): CheckinQuestion => ({ id: "q-" + newId(), kind, label, required });
/** Punto de partida: el check-in semanal típico de fuerza y readaptación. */
const TEMPLATE: CheckinFormInput = {
  name: "Check-in semanal",
  intro: "Dos minutos para contarme qué tal la semana. Con esto ajusto tu plan.",
  questions: [
    q("scale", "¿Qué tal de energía esta semana?"),
    q("scale", "¿Cómo has dormido?"),
    q("scale", "¿Cuánto has cumplido el plan de entreno?"),
    q("scale", "¿Y el de comidas?"),
    q("yesno", "¿Has tenido dolor o molestias?"),
    q("text", "Si es que sí, ¿dónde y cuándo?", false),
    q("number", "Peso de esta mañana (kg)", false),
    q("photo", "Foto de frente", false),
    q("text", "¿Algo más que quieras contarme?", false),
  ],
};

function FormPage() {
  const { formId } = Route.useParams();
  const isNew = formId === "nuevo";
  const forms = useQuery({ ...checkinFormsQuery, enabled: !isNew });
  if (!isNew && forms.isPending) return <Skeleton className="h-96" />;
  const f = forms.data?.find((x) => x.id === formId);
  if (!isNew && !f) return <p className="text-plate-red">Este formulario no existe o se ha retirado.</p>;
  return <Editor key={formId} id={isNew ? undefined : formId} initial={f ? { name: f.name, intro: f.intro, questions: f.questions } : TEMPLATE} />;
}

function Editor({ id, initial }: { id?: string; initial: CheckinFormInput }) {
  const navigate = useNavigate();
  const toast = useToast();
  const undoToast = useUndoToast();
  const ask = useConfirm();
  const save = useSaveCheckinForm();
  const archive = useArchiveCheckinForm();
  const [doc, setDoc] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const dirty = JSON.stringify(doc) !== saved;
  useDocumentTitle(doc.name || "Nuevo formulario");
  const leaving = useRef(false);
  useBlocker({
    shouldBlockFn: async () => !leaving.current && dirty && !(await ask({ title: "Hay cambios sin guardar", body: "Si sales ahora, se pierden.", confirm: "Salir sin guardar", danger: true })),
    enableBeforeUnload: () => !leaving.current && dirty,
  });

  const setQ = (qid: string, patch: Partial<CheckinQuestion>) => setDoc((d) => ({ ...d, questions: d.questions.map((x) => (x.id === qid ? { ...x, ...patch } : x)) }));
  const move = (i: number, by: number) =>
    setDoc((d) => {
      const qs = [...d.questions];
      const [x] = qs.splice(i, 1);
      qs.splice(i + by, 0, x!);
      return { ...d, questions: qs };
    });
  const remove = (x: CheckinQuestion) => {
    const before = doc.questions;
    setDoc((d) => ({ ...d, questions: d.questions.filter((y) => y.id !== x.id) }));
    undoToast("Pregunta quitada", () => setDoc((d) => ({ ...d, questions: before })));
  };
  const submit = () =>
    save.mutate(
      { id, body: { ...doc, questions: doc.questions.filter((x) => x.label.trim()) } },
      {
        onSuccess: (r) => {
          setSaved(JSON.stringify(doc));
          toast(id ? "Formulario guardado" : "Formulario creado");
          if (!id) {
            leaving.current = true;
            void navigate({ to: "/coach/seguimiento/$formId", params: { formId: r.id }, replace: true });
          }
        },
      },
    );

  return (
    <div className="pb-24">
      <Link to="/coach/seguimiento" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <CaretLeft size={15} /> Seguimiento
      </Link>
      <div className="flex max-w-[760px] flex-col gap-5">
        <input
          value={doc.name}
          onChange={(e) => setDoc({ ...doc, name: e.target.value })}
          aria-label="Nombre del formulario"
          placeholder="Nombre del formulario"
          className="font-wide bg-transparent text-[30px] leading-tight outline-none placeholder:text-ink-3 focus:underline"
        />
        <TextArea label="Texto de introducción" aside="opcional" hint="Lo lee el cliente antes de las preguntas." rows={2} value={doc.intro} onChange={(e) => setDoc({ ...doc, intro: e.target.value })} />

        <ol className="flex flex-col divide-y divide-rule border-y border-rule">
          {doc.questions.map((x, i) => (
            <li key={x.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 gap-y-2 py-3 sm:grid-cols-[28px_minmax(0,1fr)_190px_auto]">
              <span className="font-narrow pt-2 text-right text-[17px] text-ink-3" aria-hidden="true">
                {i + 1}
              </span>
              <input value={x.label} onChange={(e) => setQ(x.id, { label: e.target.value })} aria-label={`Pregunta ${i + 1}`} placeholder="Escribe la pregunta" className={cn(controlClass, "h-10")} />
              <select
                value={x.kind}
                onChange={(e) => setQ(x.id, { kind: e.target.value as QuestionKind })}
                aria-label={`Tipo de respuesta de la pregunta ${i + 1}`}
                className={cn(controlClass, "col-start-2 h-10 sm:col-start-auto")}
              >
                {QuestionKind.options.map((k) => (
                  <option key={k} value={k}>
                    {QUESTION_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <div className="col-start-2 flex items-center gap-1 sm:col-start-auto">
                <label className="mr-2 flex items-center gap-1.5 text-[13px] text-ink-2">
                  <input type="checkbox" checked={x.required} onChange={(e) => setQ(x.id, { required: e.target.checked })} className="accent-[var(--primary)]" />
                  Obligatoria
                </label>
                <IconButton label={`Subir la pregunta ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={16} />
                </IconButton>
                <IconButton label={`Bajar la pregunta ${i + 1}`} disabled={i === doc.questions.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={16} />
                </IconButton>
                <IconButton label={`Quitar la pregunta ${i + 1}`} onClick={() => remove(x)}>
                  <Trash size={16} />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
        <Button variant="secondary" className="self-start" icon={<Plus size={15} weight="bold" />} onClick={() => setDoc((d) => ({ ...d, questions: [...d.questions, q("scale", "")] }))} disabled={doc.questions.length >= 30}>
          Añadir pregunta
        </Button>
      </div>

      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-rule bg-paper/95 backdrop-blur-sm md:bottom-0">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <p className="text-sm text-ink-2">
            {doc.questions.length} preguntas{dirty ? ", cambios sin guardar" : id ? ", guardado" : ""}
          </p>
          <FormError message={save.isError ? errorMessage(save.error) : null} />
          <div className="ml-auto flex gap-2">
            {id && (
              <Button
                variant="quiet"
                onClick={async () =>
                  (await ask({ title: "Retirar el formulario", body: "Deja de pedirse a todos los clientes. Lo que ya contestaron se conserva en sus fichas.", confirm: "Retirar", danger: true })) &&
                  archive.mutate(id, { onSuccess: () => ((leaving.current = true), navigate({ to: "/coach/seguimiento" })) })
                }
              >
                Retirar
              </Button>
            )}
            <Button onClick={submit} loading={save.isPending} disabled={(Boolean(id) && !dirty) || !doc.name.trim() || !doc.questions.some((x) => x.label.trim())}>
              {id ? "Guardar cambios" : "Crear formulario"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
