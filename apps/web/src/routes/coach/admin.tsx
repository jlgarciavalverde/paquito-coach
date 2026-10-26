import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEuros, PLANS, type AdminStudio, type PlanId } from "@coach/shared";
import { Button } from "../../components/ui/button";
import { Select, TextField } from "../../components/ui/field";
import { SidePanel } from "../../components/ui/dialog";
import { BlockTitle, PageTitle, PlateMark, RecordRow, RecordSheet, RowList } from "../../components/ui/layout";
import { QueryState } from "../../components/ui/query-state";
import { useToast } from "../../components/ui/toast";
import { useConfirm } from "../../components/ui/confirm";
import { api, errorMessage } from "../../lib/api";
import { meQuery } from "../../lib/auth";
import { fmtDate, relativeTime } from "../../lib/format";
import { adminStudiosQuery, adminSummaryQuery } from "../../lib/platform";

/** Administración de la plataforma: estudios, planes, pruebas y suspensiones. Solo para `PLATFORM_ADMIN_EMAILS`. */
export const Route = createFileRoute("/coach/admin")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me?.platformAdmin) throw redirect({ to: "/coach" });
  },
  component: Admin,
});

const STATUS: Record<AdminStudio["status"], string> = { trial: "Prueba", active: "Al día", past_due: "Cobro pendiente", canceled: "Baja", comp: "Sin cobro" };

function Admin() {
  const studios = useQuery(adminStudiosQuery);
  const sum = useQuery(adminSummaryQuery).data;
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const current = studios.data?.find((s) => s.id === open) ?? null;
  return (
    <>
      <PageTitle
        title="Plataforma"
        lead={
          sum
            ? `${sum.studios} estudios: ${sum.paying} pagando (${formatEuros(sum.mrr)} al mes), ${sum.trial} en prueba y ${sum.locked} en pausa. ${sum.activeClients} clientes en total.`
            : "Estudios, planes y pruebas."
        }
      />
      <div className="mb-5 max-w-[360px]">
        <TextField label="Buscar estudio" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Nombre, dirección o correo" />
      </div>
      <QueryState q={studios}>
        {(rows) => {
          const f = filter.trim().toLowerCase();
          const shown = f ? rows.filter((s) => [s.name, s.slug ?? "", s.coachEmail, s.coachName].some((x) => x.toLowerCase().includes(f))) : rows;
          return (
            <RowList>
              {shown.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setOpen(s.id)} className="grid w-full grid-cols-1 gap-1 px-3 py-3 text-left hover:bg-tray sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_140px] sm:items-center sm:gap-4">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{s.name}</span>
                      <span className="block truncate text-[13.5px] text-ink-2">
                        {s.coachName}, {s.coachEmail}
                      </span>
                    </span>
                    <span className="truncate text-[13.5px] text-ink-2">{s.slug ? `/e/${s.slug}` : "sin dirección"}</span>
                    <span className="font-narrow tabular text-ink">
                      {s.activeClients} {s.activeClients === 1 ? "cliente" : "clientes"}
                    </span>
                    <PlateMark tone={s.access === "locked" ? "red" : s.status === "trial" ? "yellow" : s.status === "past_due" ? "red" : "green"}>
                      {PLANS[s.plan].label}, {s.access === "locked" ? "en pausa" : STATUS[s.status].toLowerCase()}
                    </PlateMark>
                  </button>
                </li>
              ))}
            </RowList>
          );
        }}
      </QueryState>
      <SidePanel open={Boolean(current)} onOpenChange={(o) => !o && setOpen(null)} title={current?.name ?? ""} description={current ? `${current.coachName}, ${current.coachEmail}` : undefined}>
        {current && <StudioPanel s={current} />}
      </SidePanel>
    </>
  );
}

function StudioPanel({ s }: { s: AdminStudio }) {
  const qc = useQueryClient();
  const toast = useToast();
  const ask = useConfirm();
  const [plan, setPlan] = useState<PlanId>(s.plan);
  const [trial, setTrial] = useState(s.trialEndsAt?.slice(0, 10) ?? "");
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<AdminStudio>(`/admin/studios/${s.id}`, { method: "PATCH", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      toast("Guardado.");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  return (
    <div className="flex flex-col gap-8">
      <RecordSheet>
        <RecordRow label="Dirección">{s.slug ? `/e/${s.slug}` : "Sin dirección"}</RecordRow>
        <RecordRow label="Alta">{fmtDate(s.createdAt)}</RecordRow>
        <RecordRow label="Última actividad">{s.lastActivityAt ? relativeTime(s.lastActivityAt) : "Ninguna registrada"}</RecordRow>
        <RecordRow label="Clientes">{s.activeClients}</RecordRow>
        <RecordRow label="Estado">{s.access === "locked" ? "En pausa" : STATUS[s.status]}</RecordRow>
        {s.status === "trial" && s.trialEndsAt && <RecordRow label="Fin de la prueba">{fmtDate(s.trialEndsAt)}</RecordRow>}
      </RecordSheet>

      <section>
        <BlockTitle>Plan a mano</BlockTitle>
        <p className="mb-4 text-sm text-ink-2">Para cortesías y fundadores. Si el estudio paga con Stripe, el plan se cambia desde su portal.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
            {(Object.keys(PLANS) as PlanId[]).map((id) => (
              <option key={id} value={id}>
                {PLANS[id].label}
              </option>
            ))}
          </Select>
          <Button variant="secondary" loading={save.isPending && "plan" in (save.variables ?? {})} disabled={plan === s.plan} onClick={() => save.mutate({ plan })}>
            Cambiar plan
          </Button>
        </div>
      </section>

      <section>
        <BlockTitle>Alargar la prueba</BlockTitle>
        <div className="flex flex-wrap items-end gap-3">
          <TextField label="Hasta el día" type="date" value={trial} onChange={(e) => setTrial(e.target.value)} />
          <Button variant="secondary" disabled={!trial} loading={save.isPending && "trialEndsOn" in (save.variables ?? {})} onClick={() => save.mutate({ trialEndsOn: trial })}>
            Guardar fecha
          </Button>
        </div>
      </section>

      <section>
        <BlockTitle>Suspender</BlockTitle>
        <p className="mb-4 text-sm text-ink-2">El estudio y sus clientes pueden consultar y exportar, pero no cambiar nada.</p>
        {s.suspended ? (
          <Button variant="secondary" onClick={() => save.mutate({ suspended: false })}>
            Quitar la suspensión
          </Button>
        ) : (
          <Button
            variant="danger"
            onClick={async () => (await ask({ title: `Suspender ${s.name}`, body: "Dejará de poder crear y cambiar cosas hasta que quites la suspensión.", confirm: "Suspender" })) && save.mutate({ suspended: true })}
          >
            Suspender el estudio
          </Button>
        )}
      </section>
    </div>
  );
}
