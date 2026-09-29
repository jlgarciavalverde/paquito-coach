import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "@phosphor-icons/react";
import type { CheckinForm, MetricDef } from "@coach/shared";
import { Button, buttonClass } from "../../../components/ui/button";
import { SidePanel } from "../../../components/ui/dialog";
import { Checkbox, TextField } from "../../../components/ui/field";
import { BlockTitle, EmptyNote, PageTitle } from "../../../components/ui/layout";
import { Skeleton } from "../../../components/ui/spinner";
import { useToast } from "../../../components/ui/toast";
import { FormError } from "../../../components/form-error";
import { AssignCheckinPanel } from "../../../components/followup/assign-checkin-panel";
import { checkinFormsQuery, metricDefsQuery, useMetricDef } from "../../../lib/followup";
import { relativeTime } from "../../../lib/format";
import { errorMessage } from "../../../lib/api";
import { useDocumentTitle } from "../../../lib/title";

export const Route = createFileRoute("/coach/seguimiento/")({
  component: Followup,
});

function Followup() {
  useDocumentTitle("Seguimiento");
  return (
    <>
      <PageTitle
        title="Seguimiento"
        lead="Los check-ins que tus clientes rellenan cada semana o cada mes, y las medidas propias que quieres seguir además del peso."
      />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
        <Forms />
        <Metrics />
      </div>
    </>
  );
}

function Forms() {
  const q = useQuery(checkinFormsQuery);
  const [assign, setAssign] = useState<CheckinForm | null>(null);
  const newBtn = (
    <Link to="/coach/seguimiento/$formId" params={{ formId: "nuevo" }} className={buttonClass("primary", "sm")}>
      <Plus size={15} weight="bold" /> Nuevo formulario
    </Link>
  );
  return (
    <section aria-labelledby="f-title">
      <BlockTitle id="f-title" action={(q.data ?? []).length > 0 && newBtn}>
        Formularios de check-in
      </BlockTitle>
      {q.isPending ? (
        <Skeleton className="h-40" />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyNote action={newBtn}>
          Un check-in es un formulario corto que el cliente rellena cada cierto tiempo: energía, sueño, dolor, cumplimiento, una foto… Empieza con el semanal que viene preparado y ajústalo a tu manera.
        </EmptyNote>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {q.data!.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
              <Link to="/coach/seguimiento/$formId" params={{ formId: f.id }} className="min-w-0 flex-1 basis-[260px] hover:text-primary">
                <span className="block font-medium text-ink">{f.name}</span>
                <span className="block text-[13px] text-ink-2">
                  {f.questions.length} preguntas. {f.assignedCount > 0 ? `Lo rellenan ${f.assignedCount} ${f.assignedCount === 1 ? "cliente" : "clientes"}.` : "Sin asignar."} Editado {relativeTime(f.updatedAt)}.
                </span>
              </Link>
              <Button size="sm" variant="secondary" onClick={() => setAssign(f)}>
                Pedir a clientes
              </Button>
            </li>
          ))}
        </ul>
      )}
      {assign && <AssignCheckinPanel form={assign} onClose={() => setAssign(null)} />}
    </section>
  );
}

function Metrics() {
  const q = useQuery(metricDefsQuery);
  const [edit, setEdit] = useState<MetricDef | "new" | null>(null);
  const active = (q.data ?? []).filter((d) => !d.archived);
  const archived = (q.data ?? []).filter((d) => d.archived);
  return (
    <section aria-labelledby="m-title">
      <BlockTitle id="m-title" action={<Button size="sm" variant="secondary" onClick={() => setEdit("new")}>Nueva medida</Button>}>
        Medidas propias
      </BlockTitle>
      {q.isPending ? (
        <Skeleton className="h-32" />
      ) : active.length === 0 ? (
        <p className="text-sm text-ink-2">
          Además del peso y el perímetro: dolor de 0 a 10, grados de flexión de rodilla, salto vertical, pasos al día… Aparecen en la pestaña Progreso de cada cliente, con su gráfica.
        </p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {active.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => setEdit(d)} className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left hover:text-primary">
                <span className="font-medium">
                  {d.name} {d.unit && <span className="font-normal text-ink-3">({d.unit})</span>}
                </span>
                <span className="shrink-0 text-[13px] text-ink-2">{d.clientCanLog ? "La anota el cliente o tú" : "Solo tú"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 && <p className="mt-3 text-[13px] text-ink-3">{archived.length} en desuso (sus datos se conservan en cada cliente).</p>}
      {edit && <MetricDefPanel def={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function MetricDefPanel({ def, onClose }: { def: MetricDef | null; onClose: () => void }) {
  const m = useMetricDef();
  const toast = useToast();
  const [f, setF] = useState({ name: def?.name ?? "", unit: def?.unit ?? "", higherIsBetter: def?.higherIsBetter ?? true, clientCanLog: def?.clientCanLog ?? true });
  const save = (archived = false) =>
    m.mutate({ id: def?.id, body: { ...f, archived } }, { onSuccess: () => (toast(archived ? "Medida retirada" : "Medida guardada"), onClose()) });
  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={def ? def.name : "Nueva medida"}
      footer={
        <>
          {def && (
            <Button variant="quiet" className="sm:mr-auto" onClick={() => save(true)}>
              Dejar de usarla
            </Button>
          )}
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save(false)} loading={m.isPending} disabled={!f.name.trim()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <TextField label="Nombre" required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Dolor (EVA)" />
        <TextField label="Unidad" aside="opcional" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="/10, °, cm, pasos" className="max-w-[200px]" />
        <fieldset>
          <legend className="mb-2 text-[13.5px] font-medium">Cuándo es buena señal</legend>
          <div className="flex flex-col gap-2 text-sm">
            {[
              { v: true, t: "Cuando sube (fuerza, flexión, salto)" },
              { v: false, t: "Cuando baja (dolor, perímetro)" },
            ].map((o) => (
              <label key={String(o.v)} className="flex items-center gap-2">
                <input type="radio" name="better" checked={f.higherIsBetter === o.v} onChange={() => setF({ ...f, higherIsBetter: o.v })} className="accent-[var(--primary)]" />
                {o.t}
              </label>
            ))}
          </div>
        </fieldset>
        <Checkbox label="El cliente también puede anotarla" description="Desde su pantalla de Progreso." checked={f.clientCanLog} onChange={(e) => setF({ ...f, clientCanLog: e.target.checked })} />
        <FormError message={m.isError ? errorMessage(m.error) : null} />
      </div>
    </SidePanel>
  );
}
