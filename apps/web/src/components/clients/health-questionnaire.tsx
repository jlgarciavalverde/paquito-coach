import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ANAMNESIS_LABEL, PARQ_QUESTIONS, type Anamnesis, type Client, type Questionnaire } from "@coach/shared";
import { Button } from "../ui/button";
import { SidePanel } from "../ui/dialog";
import { HealthAlert, PlateMark, RecordRow, RecordSheet } from "../ui/layout";
import { useToast } from "../ui/toast";
import { clientQuestionnaireQuery, useQuestionnaireAction } from "../../lib/questionnaire";
import { fmtDate } from "../../lib/format";
import { errorMessage } from "../../lib/api";

const alertText = (q: Questionnaire) =>
  q.alerts.map((i) => (i === -1 ? `dolor actual ${q.anamnesis.painNow}/10${q.anamnesis.painArea ? ` (${q.anamnesis.painArea})` : ""}` : `pregunta ${i + 1}`)).join(", ");

/** Alerta del cuestionario de salud encima de las pestañas de la ficha (mientras no se revise). */
export function QuestionnaireAlert({ client }: { client: Client }) {
  const toast = useToast();
  const q = useQuery({ ...clientQuestionnaireQuery(client.id), enabled: Boolean(client.userId) });
  const act = useQuestionnaireAction(client.id);
  const [open, setOpen] = useState(false);
  const last = q.data?.last;
  if (!last || last.alerts.length === 0 || last.reviewedAt) return null;
  return (
    <div className="mb-6">
      <HealthAlert title={`Cuestionario de salud: ${last.alerts.length === 1 ? "1 respuesta de riesgo" : `${last.alerts.length} respuestas de riesgo`}`}>
        {client.name.split(" ")[0]} ha marcado {alertText(last)}. Revísalo antes de programarle.
      </HealthAlert>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Ver respuestas
        </Button>
        <Button size="sm" variant="quiet" loading={act.isPending} onClick={() => act.mutate("review", { onError: (e) => toast(errorMessage(e), "error") })}>
          Marcar como revisado
        </Button>
      </div>
      <AnswersPanel q={last} name={client.name} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** Estado del cuestionario en la pestaña «Ficha». */
export function QuestionnaireSummary({ client }: { client: Client }) {
  const q = useQuery({ ...clientQuestionnaireQuery(client.id), enabled: Boolean(client.userId) });
  const act = useQuestionnaireAction(client.id);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  if (!client.userId) return null;
  const last = q.data?.last;
  return (
    <RecordSheet className="mb-8 max-w-[820px]">
      <RecordRow label="Cuestionario de salud" hint="PAR-Q+ y anamnesis">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
          {!q.data ? (
            <span className="text-sm text-ink-3">Cargando…</span>
          ) : q.data.pending ? (
            <PlateMark tone="blue">Pendiente de que lo rellene</PlateMark>
          ) : last && last.alerts.length > 0 ? (
            <PlateMark tone={last.reviewedAt ? "yellow" : "red"}>
              {last.alerts.length} alerta{last.alerts.length > 1 ? "s" : ""}, {last.reviewedAt ? `revisado el ${fmtDate(last.reviewedAt)}` : "sin revisar"}
            </PlateMark>
          ) : (
            <PlateMark tone="green">Sin alertas</PlateMark>
          )}
          {last && <span className="text-[13px] text-ink-3">Enviado el {fmtDate(last.submittedAt)}</span>}
          {last && (
            <Button size="sm" variant="quiet" onClick={() => setOpen(true)}>
              Ver respuestas
            </Button>
          )}
          {!q.data?.pending && (
            <Button size="sm" variant="quiet" loading={act.isPending} onClick={() => act.mutate("request", { onError: (e) => toast(errorMessage(e), "error"), onSuccess: () => toast("Se lo pediremos al abrir la app") })}>
              Pedir que lo repita
            </Button>
          )}
        </div>
      </RecordRow>
      {last && <AnswersPanel q={last} name={client.name} open={open} onClose={() => setOpen(false)} />}
    </RecordSheet>
  );
}

function AnswersPanel({ q, name, open, onClose }: { q: Questionnaire; name: string; open: boolean; onClose: () => void }) {
  return (
    <SidePanel open={open} onOpenChange={(o) => !o && onClose()} width="lg" title={`Cuestionario de ${name}`} description={`Enviado el ${fmtDate(q.submittedAt)}.`}>
      <h3 className="font-wide text-[17px]">PAR-Q+</h3>
      <ol className="mt-2 divide-y divide-rule border-y border-rule">
        {PARQ_QUESTIONS.map((text, i) => (
          <li key={i} className="grid grid-cols-[1fr_auto] gap-4 py-3 text-sm">
            <span className="text-ink-2">
              <span className="font-narrow mr-1.5 text-ink-3">{i + 1}.</span>
              {text}
            </span>
            <PlateMark tone={q.parq[i] ? "red" : "grey"}>{q.parq[i] ? "Sí" : "No"}</PlateMark>
          </li>
        ))}
      </ol>
      <h3 className="font-wide mt-8 text-[17px]">Anamnesis</h3>
      <RecordSheet className="mt-2">
        {(Object.keys(ANAMNESIS_LABEL) as (keyof Anamnesis)[]).map((k) => (
          <RecordRow key={k} label={ANAMNESIS_LABEL[k]}>
            <p className="pt-2 text-sm whitespace-pre-line text-ink">{k === "painNow" ? `${q.anamnesis.painNow} de 10` : q.anamnesis[k] || <span className="text-ink-3">—</span>}</p>
          </RecordRow>
        ))}
      </RecordSheet>
    </SidePanel>
  );
}
