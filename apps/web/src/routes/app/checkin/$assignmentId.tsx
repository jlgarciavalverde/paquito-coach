import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CaretLeft } from "@phosphor-icons/react";
import { checkinError, type CheckinAnswers, type CheckinQuestion, type PendingCheckin } from "@coach/shared";
import { Button } from "../../../components/ui/button";
import { DecimalField, TextArea } from "../../../components/ui/field";
import { EmptyNote } from "../../../components/ui/layout";
import { Skeleton } from "../../../components/ui/spinner";
import { useToast } from "../../../components/ui/toast";
import { FormError } from "../../../components/form-error";
import { myCheckinsQuery, useSubmitCheckin } from "../../../lib/followup";
import { createUploadCache } from "../../../lib/chat";
import { useMe } from "../../../lib/auth";
import { dayLong } from "../../../lib/dates";
import { errorMessage } from "../../../lib/api";
import { useDocumentTitle } from "../../../lib/title";
import { cn } from "../../../lib/cn";
import { QueryError } from "../../../components/ui/query-state";
import { FilePreview } from "../../../lib/use-object-url";
import { RadioGroup } from "../../../components/ui/radio-group";

export const Route = createFileRoute("/app/checkin/$assignmentId")({
  component: CheckinPage,
});

function CheckinPage() {
  const { assignmentId } = Route.useParams();
  const q = useQuery(myCheckinsQuery);
  const c = q.data?.find((x) => x.assignmentId === assignmentId);
  useDocumentTitle(c?.formName ?? "Check-in");
  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <QueryError q={q} />;
  if (!c)
    return (
      <EmptyNote action={<Link to="/app" className="font-medium text-primary">Volver a Hoy</Link>}>Este check-in ya está hecho o todavía no te toca.</EmptyNote>
    );
  return <CheckinForm key={c.assignmentId} c={c} />;
}

function CheckinForm({ c }: { c: PendingCheckin }) {
  const me = useMe()!;
  const navigate = useNavigate();
  const toast = useToast();
  const submit = useSubmitCheckin(c.assignmentId);
  const [answers, setAnswers] = useState<CheckinAnswers>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (id: string, v: CheckinAnswers[string]) => setAnswers((a) => ({ ...a, [id]: v }));

  const [upload] = useState(() => createUploadCache());
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Las fotos se validan como «hay algo» antes de subirlas.
    const draft: CheckinAnswers = { ...answers };
    for (const id of Object.keys(files)) draft[id] = "00000000-0000-4000-8000-000000000000";
    const err = checkinError(c.questions, draft);
    if (err) return setError(err);
    setBusy(true);
    try {
      const final = { ...answers };
      for (const [id, f] of Object.entries(files)) final[id] = await upload(f);
      await submit.mutateAsync(final);
      toast(`Enviado a ${me.studio.coachName?.split(" ")[0] ?? "tu entrenador"}`);
      void navigate({ to: "/app" });
    } catch (e2) {
      setError(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="pb-10">
      <Link to="/app" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <CaretLeft size={15} /> Hoy
      </Link>
      <h1 className="font-wide text-[28px] leading-[1.1]">{c.formName}</h1>
      <p className="mt-1 text-[13.5px] text-ink-3">Del {dayLong(c.dueDate)}</p>
      {c.intro && <p className="mt-3 max-w-[60ch] text-ink-2">{c.intro}</p>}
      <ol className="mt-6 flex flex-col divide-y divide-rule border-y border-rule">
        {c.questions.map((q, i) => (
          <li key={q.id} className="py-5">
            <Question q={q} n={i + 1} value={answers[q.id]} file={files[q.id]} onChange={(v) => set(q.id, v)} onFile={(f) => setFiles((s) => { const n = { ...s }; if (f) n[q.id] = f; else delete n[q.id]; return n; })} />
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-col gap-3">
        <FormError message={error} />
        <Button type="submit" size="lg" loading={busy} className="w-full sm:w-auto sm:self-start">
          Enviar
        </Button>
      </div>
    </form>
  );
}

function Question({ q, n, value, file, onChange, onFile }: { q: CheckinQuestion; n: number; value: CheckinAnswers[string] | undefined; file?: File; onChange: (v: CheckinAnswers[string]) => void; onFile: (f: File | null) => void }) {
  const id = `cq-${q.id}`;
  const label = (
    <p id={id} className="text-[15px] font-medium text-ink">
      <span className="font-narrow mr-2 text-ink-3">{n}.</span>
      {q.label}
      {!q.required && <span className="ml-2 text-[13px] font-normal text-ink-3">(opcional)</span>}
    </p>
  );
  if (q.kind === "scale")
    return (
      <>
        {label}
        <RadioGroup className="mt-3 grid grid-cols-10 gap-1" aria-labelledby={id}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={value === k}
              aria-label={`${k}${k === 1 ? ", muy mal" : k === 10 ? ", muy bien" : ""}`}
              onClick={() => onChange(k)}
              className={cn("font-narrow h-11 rounded-[var(--radius-control)] border text-[17px]", value === k ? "border-ink bg-ink text-paper" : "border-rule-strong hover:bg-tray")}
            >
              {k}
            </button>
          ))}
        </RadioGroup>
        <p className="mt-1 flex justify-between text-[12.5px] text-ink-3">
          <span>Muy mal</span>
          <span>Muy bien</span>
        </p>
      </>
    );
  if (q.kind === "yesno")
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        {label}
        <RadioGroup className="inline-flex rounded-[var(--radius-control)] border border-rule-strong p-0.5" aria-labelledby={id}>
          {([true, false] as const).map((v) => (
            <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cn("h-10 w-16 rounded-[4px] text-sm font-medium", value === v ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}>
              {v ? "Sí" : "No"}
            </button>
          ))}
        </RadioGroup>
      </div>
    );
  if (q.kind === "number")
    return (
      <>
        {label}
        <DecimalField label={q.label} hideLabel value={typeof value === "number" ? value : null} onValue={onChange} className="mt-2 max-w-[180px] [&_input]:font-narrow [&_input]:text-[18px]" />
      </>
    );
  if (q.kind === "photo")
    return (
      <>
        {label}
        <div className="mt-2 flex items-center gap-4">
          {file && <FilePreview file={file} className="h-24 w-[72px] rounded-[4px] object-cover" />}
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-labelledby={id} onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="text-[13px] text-ink-2 file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-tray file:px-3 file:py-2 file:text-ink" />
        </div>
      </>
    );
  return (
    <>
      {label}
      <TextArea label={q.label} hideLabel rows={3} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} className="mt-2" />
    </>
  );
}
