import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ANAMNESIS_LABEL, PARQ_QUESTIONS, type Anamnesis } from "@coach/shared";
import { Button, buttonClass } from "../../components/ui/button";
import { TextArea, TextField } from "../../components/ui/field";
import { useToast } from "../../components/ui/toast";
import { FormError } from "../../components/form-error";
import { useSubmitQuestionnaire } from "../../lib/questionnaire";
import { useMe } from "../../lib/auth";
import { useDocumentTitle } from "../../lib/title";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { RadioGroup } from "../../components/ui/radio-group";

export const Route = createFileRoute("/app/salud")({
  component: HealthForm,
});

const EMPTY: Anamnesis = { pastInjuries: "", surgeries: "", medication: "", painNow: 0, painArea: "", currentActivity: "", goal: "", other: "" };

/** Cuestionario de salud: PAR-Q+ (7 sí/no) y anamnesis. Lo lee solo el entrenador. */
function HealthForm() {
  useDocumentTitle("Cuestionario de salud");
  const me = useMe()!;
  const navigate = useNavigate();
  const toast = useToast();
  const submit = useSubmitQuestionnaire();
  const [parq, setParq] = useState<(boolean | null)[]>(() => PARQ_QUESTIONS.map(() => null));
  const [a, setA] = useState<Anamnesis>(EMPTY);
  const answered = parq.every((v) => v !== null);
  const coach = me.studio.coachName.split(" ")[0] || "tu entrenador";
  const text = (k: Exclude<keyof Anamnesis, "painNow">, rows = 2) => (
    <TextArea label={ANAMNESIS_LABEL[k]} aside="opcional" rows={rows} value={a[k]} onChange={(e) => setA({ ...a, [k]: e.target.value })} />
  );

  return (
    <form
      className="pb-10"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate({ parq: parq as boolean[], anamnesis: a }, { onSuccess: () => (toast(`Enviado. ${coach} lo revisará antes de programarte.`), navigate({ to: "/app" })) });
      }}
    >
      <h1 className="font-wide text-[28px] leading-tight">Antes de empezar</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        Unas preguntas sobre tu salud para que {coach} ajuste el entrenamiento a ti. Son unos 3 minutos y solo las ve tu entrenador.
      </p>

      <fieldset className="mt-8">
        <legend className="font-wide text-[19px]">Siete preguntas rápidas</legend>
        <ol className="mt-3 divide-y divide-rule border-y border-rule">
          {PARQ_QUESTIONS.map((q, i) => (
            <li key={i} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <p id={`q${i}`} className="text-[15px] text-ink">
                <span className="font-narrow mr-2 text-ink-3">{i + 1}.</span>
                {q}
              </p>
              <RadioGroup className="inline-flex w-fit self-start justify-self-start rounded-[var(--radius-control)] border border-rule-strong p-0.5" aria-labelledby={`q${i}`}>
                {[
                  [true, "Sí"],
                  [false, "No"],
                ].map(([v, l]) => (
                  <button
                    key={String(v)}
                    type="button"
                    role="radio"
                    aria-checked={parq[i] === v}
                    onClick={() => setParq((p) => p.map((x, j) => (j === i ? (v as boolean) : x)))}
                    className={cn("h-10 w-16 rounded-[4px] text-sm font-medium", parq[i] === v ? (v ? "bg-plate-red text-paper" : "bg-ink text-paper") : "text-ink-2 hover:text-ink")}
                  >
                    {l as string}
                  </button>
                ))}
              </RadioGroup>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[13px] text-ink-3">Si respondes «sí» a alguna, no pasa nada: {coach} lo tendrá en cuenta y quizá te pida una valoración médica antes de subir la intensidad.</p>
      </fieldset>

      <fieldset className="mt-10 flex flex-col gap-5">
        <legend className="font-wide mb-3 text-[19px]">Tu historia</legend>
        {text("pastInjuries")}
        {text("surgeries")}
        {text("medication")}
        <div>
          <p id="pain" className="text-[13.5px] font-medium text-ink">
            {ANAMNESIS_LABEL.painNow}
          </p>
          <RadioGroup className="mt-2 grid grid-cols-11 gap-1" aria-labelledby="pain">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={a.painNow === n}
                aria-label={`${n}${n === 0 ? ", sin dolor" : n === 10 ? ", el peor dolor imaginable" : ""}`}
                onClick={() => setA({ ...a, painNow: n })}
                className={cn("font-narrow h-10 rounded-[var(--radius-control)] border text-[16px]", a.painNow === n ? "border-ink bg-ink text-paper" : "border-rule-strong hover:bg-tray")}
              >
                {n}
              </button>
            ))}
          </RadioGroup>
          <p className="mt-1 flex justify-between text-[12.5px] text-ink-3">
            <span>Sin dolor</span>
            <span>El peor imaginable</span>
          </p>
        </div>
        {a.painNow > 0 && <TextField label={ANAMNESIS_LABEL.painArea} value={a.painArea} onChange={(e) => setA({ ...a, painArea: e.target.value })} />}
        {text("currentActivity")}
        {text("goal")}
        {text("other", 3)}
      </fieldset>

      <FormError message={submit.isError ? errorMessage(submit.error) : null} />
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={submit.isPending} disabled={!answered}>
          Enviar a {coach}
        </Button>
        <Link to="/app" className={buttonClass("quiet")}>
          Lo haré más tarde
        </Link>
        {!answered && <span className="text-[13px] text-ink-3">Responde las siete preguntas para poder enviarlo.</span>}
      </div>
    </form>
  );
}
