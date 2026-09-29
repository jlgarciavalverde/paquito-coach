import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { everyLabel, type CheckinAnswers, type CheckinQuestion, type CheckinResponse, type Client } from "@coach/shared";
import { Button } from "../ui/button";
import { BlockTitle, EmptyNote, PlateMark } from "../ui/layout";
import { Skeleton } from "../ui/spinner";
import { useConfirm } from "../ui/confirm";
import { AssignCheckinPanel } from "./assign-checkin-panel";
import { clientCheckinsQuery, useCheckinAdmin } from "../../lib/followup";
import { mediaUrl } from "../../lib/chat";
import { dayLong, dayMonth, today } from "../../lib/dates";

/** Pestaña «Seguimiento» de la ficha: qué check-ins tiene programados y lo que ha contestado. */
export function ClientCheckins({ client }: { client: Client }) {
  const q = useQuery(clientCheckinsQuery(client.id));
  const admin = useCheckinAdmin(client.id);
  const ask = useConfirm();
  const [assign, setAssign] = useState(false);
  const first = client.name.split(" ")[0];
  const unseen = (q.data?.responses ?? []).some((r) => !r.seen);
  // Abrir la pestaña es revisarlos.
  useEffect(() => {
    if (unseen) admin.mutate({ seen: true });
  }, [unseen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isPending) return <Skeleton className="h-48" />;
  const { assignments, responses } = q.data!;
  const canAsk = client.status === "active";

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="ca-title">
        <BlockTitle id="ca-title" action={canAsk && assignments.length > 0 && <Button size="sm" variant="secondary" onClick={() => setAssign(true)}>Pedir otro</Button>}>
          Check-ins programados
        </BlockTitle>
        {assignments.length === 0 ? (
          <EmptyNote action={canAsk ? <Button onClick={() => setAssign(true)}>Pedir un check-in</Button> : undefined}>
            {canAsk
              ? `${first} no tiene check-ins. Pídele uno semanal para saber cómo va entre sesión y sesión (energía, sueño, dolor, una foto…).`
              : `Los check-ins los rellena el cliente desde la app: ${first} necesita una cuenta activa.`}
          </EmptyNote>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="block font-medium">{a.formName}</span>
                  <span className="block text-[13px] text-ink-2">
                    {everyLabel(a.everyDays).replace(/^./, (c) => c.toUpperCase())}.{" "}
                    {a.nextDue < today() ? <span className="text-plate-red">Pendiente desde el {dayMonth(a.nextDue)}.</span> : a.nextDue === today() ? "Le toca hoy." : `El próximo, el ${dayLong(a.nextDue)}.`}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={async () =>
                    (await ask({ title: `Dejar de pedir «${a.formName}»`, body: `${first} no volverá a verlo. Sus respuestas se conservan.`, confirm: "Dejar de pedirlo" })) && admin.mutate({ unassign: a.id })
                  }
                >
                  Dejar de pedirlo
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cr-title">
        <BlockTitle id="cr-title" action={<Link to="/coach/seguimiento" className="text-[13px] font-medium text-primary hover:underline">Formularios</Link>}>
          Respuestas
        </BlockTitle>
        {responses.length === 0 ? (
          <p className="text-sm text-ink-2">Aún no ha contestado ninguno.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {responses.map((r, i) => (
              <ResponseCard key={r.id} r={r} prev={responses.slice(i + 1).find((p) => p.formName === r.formName)} open={i === 0} />
            ))}
          </div>
        )}
      </section>
      {assign && <AssignCheckinPanel clientId={client.id} onClose={() => setAssign(false)} />}
    </div>
  );
}

function ResponseCard({ r, prev, open }: { r: CheckinResponse; prev?: CheckinResponse; open: boolean }) {
  const pain = r.questions.some((q) => q.kind === "yesno" && /dolor|molest/i.test(q.label) && r.answers[q.id] === true);
  return (
    <details open={open} className="group rounded-[var(--radius-zone)] bg-tray">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span className="font-medium">{r.formName}</span>
        <span className="font-narrow text-[14px] text-ink-2">{dayMonth(r.submittedAt.slice(0, 10))}</span>
        {!r.seen && <PlateMark tone="blue">Nuevo</PlateMark>}
        {pain && <PlateMark tone="red">Ha tenido dolor</PlateMark>}
        <span className="ml-auto text-[13px] text-primary group-open:hidden">Ver respuestas</span>
      </summary>
      <dl className="border-t border-rule px-4 pb-3">
        {r.questions.map((q) => (
          <div key={q.id} className="grid grid-cols-1 gap-x-6 gap-y-0.5 border-b border-rule py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <dt className="text-[13.5px] text-ink-2">{q.label}</dt>
            <dd className="text-sm text-ink">
              <Answer q={q} a={r.answers} prev={prev?.answers} />
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Answer({ q, a, prev }: { q: CheckinQuestion; a: CheckinAnswers; prev?: CheckinAnswers }) {
  const v = a[q.id];
  if (v === undefined || v === null || v === "") return <span className="text-ink-3">Sin contestar</span>;
  if (q.kind === "yesno") return <>{v ? "Sí" : "No"}</>;
  if (q.kind === "photo") return <a href={mediaUrl(String(v))} target="_blank" rel="noreferrer"><img src={mediaUrl(String(v))} alt={q.label} className="h-28 w-[84px] rounded-[4px] bg-paper object-cover" loading="lazy" /></a>;
  if (q.kind === "scale" || q.kind === "number") {
    const p = prev?.[q.id];
    const d = typeof p === "number" && typeof v === "number" ? Math.round((v - p) * 10) / 10 : null;
    return (
      <span className="font-narrow text-[16px]">
        {q.kind === "scale" ? `${v}/10` : String(v).replace(".", ",")}
        {d ? <span className="ml-2 text-[13px] text-ink-2">({d > 0 ? "+" : "−"}{String(Math.abs(d)).replace(".", ",")} que la vez anterior)</span> : null}
      </span>
    );
  }
  return <span className="whitespace-pre-line">{String(v)}</span>;
}
