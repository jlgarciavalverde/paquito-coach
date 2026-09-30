import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Barbell, CalendarDots, FileText, ForkKnife, Trash } from "@phosphor-icons/react";
import { Button, IconButton } from "../../components/ui/button";
import { TextArea } from "../../components/ui/field";
import { BlockTitle, EmptyNote, PageTitle, PlateMark } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { useToast } from "../../components/ui/toast";
import { useConfirm } from "../../components/ui/confirm";
import { FormError } from "../../components/form-error";
import { useCoachActions } from "../../components/coach-actions";
import { aiDocumentsQuery, aiStatusQuery, useAiDocument, useAsk } from "../../lib/ai";
import { relativeTime } from "../../lib/format";
import { errorMessage } from "../../lib/api";
import { useDocumentTitle } from "../../lib/title";
import { QueryError } from "../../components/ui/query-state";

export const Route = createFileRoute("/coach/ia")({
  component: AiPage,
});

/** IA: tus documentos (metodología, pautas, tablas) y lo que la IA genera a partir de ellos. */
function AiPage() {
  useDocumentTitle("IA");
  const status = useQuery(aiStatusQuery);
  const act = useCoachActions();
  const s = status.data;
  return (
    <>
      <PageTitle
        title="IA"
        lead={
          s
            ? s.enabled
              ? `Genera rutinas, programas y dietas a partir de tus documentos. Hoy llevas ${s.usedToday} de ${s.dailyLimit} peticiones.`
              : "La IA aún no está configurada: falta poner la clave de Gemini en el servidor (ver docs/OPERACIONES.md)."
            : " "
        }
      />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_400px] [&>*]:min-w-0">
        <div className="flex flex-col gap-12">
          <section aria-labelledby="gen-title">
            <BlockTitle id="gen-title">Generar un borrador</BlockTitle>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { k: "routine" as const, t: "Rutina", d: "Una sesión, por bloques", I: Barbell },
                { k: "program" as const, t: "Programa", d: "Varias semanas con progresión", I: CalendarDots },
                { k: "mealPlan" as const, t: "Plan de comidas", d: "Día tipo con cantidades", I: ForkKnife },
              ].map(({ k, t, d, I }) => (
                <button key={k} type="button" disabled={s?.enabled === false} onClick={() => act.generate(k)} className="flex items-start gap-3 rounded-[var(--radius-zone)] border border-rule-strong px-4 py-3 text-left hover:border-primary hover:bg-tray disabled:opacity-50">
                  <I size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <span className="block font-medium">{t}</span>
                    <span className="block text-[13px] text-ink-2">{d}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <Ask disabled={s?.enabled === false || s?.documents === 0} />
        </div>
        <Documents disabled={s?.enabled === false} />
      </div>
    </>
  );
}

function Documents({ disabled }: { disabled: boolean }) {
  const q = useQuery(aiDocumentsQuery);
  const m = useAiDocument();
  const toast = useToast();
  const ask = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  return (
    <section aria-labelledby="docs-title">
      <BlockTitle
        id="docs-title"
        action={
          <>
            <input
              ref={input}
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="sr-only"
              aria-label="Subir documento"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f)
                  m.mutate(
                    { upload: f },
                    {
                      onSuccess: (d) => {
                        const bad = (d as { status?: string } | undefined)?.status === "error";
                        toast(bad ? "No se ha podido leer el documento" : "Documento listo", bad ? "error" : "ok");
                      },
                      onError: (err) => toast(errorMessage(err), "error"),
                    },
                  );
              }}
            />
            <Button size="sm" variant="secondary" loading={m.isPending} disabled={disabled} onClick={() => input.current?.click()}>
              Subir documento
            </Button>
          </>
        }
      >
        Mis documentos
      </BlockTitle>
      <p className="mb-3 text-[13px] text-ink-2">Tu material: metodología, pautas de readaptación, tablas de nutrición… PDF, Word o texto. No subas documentos con datos de clientes.</p>
      {q.isPending ? (
        <Skeleton className="h-24" />
      ) : q.isError ? (
        <QueryError q={q} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyNote>Sin documentos todavía. La IA funciona igual, pero con criterios generales en lugar de los tuyos.</EmptyNote>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {q.data!.map((d) => (
            <li key={d.id} className="flex items-start gap-3 py-2.5">
              <FileText size={20} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{d.title}</span>
                {d.status === "ready" ? (
                  <span className="block text-[12.5px] text-ink-3">
                    {Math.round(d.chars / 1000)} mil caracteres, subido {relativeTime(d.createdAt)}
                  </span>
                ) : (
                  <PlateMark tone="red" className="text-[12.5px]">
                    {d.error ?? "No se ha podido leer"}
                  </PlateMark>
                )}
              </span>
              <IconButton label={`Quitar ${d.title}`} onClick={async () => (await ask({ title: `Quitar «${d.title}»`, body: "La IA dejará de usarlo.", confirm: "Quitar", danger: true })) && m.mutate({ remove: d.id })}>
                <Trash size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Ask({ disabled }: { disabled: boolean }) {
  const m = useAsk();
  const [q, setQ] = useState("");
  return (
    <section aria-labelledby="ask-title">
      <BlockTitle id="ask-title">Pregunta a tus documentos</BlockTitle>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 3) m.mutate(q.trim());
        }}
      >
        <TextArea label="Pregunta" hideLabel rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="¿Cuándo empiezo el trote tras una plastia de LCA según mi protocolo?" />
        <Button type="submit" variant="secondary" className="self-start" loading={m.isPending} disabled={disabled || q.trim().length < 3}>
          Preguntar
        </Button>
      </form>
      <FormError message={m.isError ? errorMessage(m.error) : null} />
      {m.data && (
        <div className="mt-4 rounded-[var(--radius-zone)] bg-tray px-4 py-3">
          <p className="whitespace-pre-line text-[15px]">{m.data.answer}</p>
          {m.data.sources.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-rule pt-3 text-[13px] text-ink-2">
              {m.data.sources.map((s, i) => (
                <li key={i}>
                  <span className="font-medium text-ink">{s.title}</span>: {s.excerpt}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
