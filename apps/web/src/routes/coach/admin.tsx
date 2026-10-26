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
import { adminErrorsQuery, adminStudiosQuery, adminSummaryQuery } from "../../lib/platform";
import { TabPanel, Tabs } from "../../components/ui/tabs";

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
  const [tab, setTab] = useState("estudios");
  const errors = useQuery(adminErrorsQuery);
  return (
    <>
      <PageTitle title="Plataforma" lead="Estudios, planes y pruebas; y los errores de la app." />
      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "estudios", label: "Estudios" },
          { value: "errores", label: errors.data?.length ? `Errores (${errors.data.length})` : "Errores" },
        ]}
      >
        <TabPanel value="estudios">
          <Studios />
        </TabPanel>
        <TabPanel value="errores">
          <Errors />
        </TabPanel>
      </Tabs>
    </>
  );
}

/**
 * Registro propio de errores (Q1): lo que ha fallado en los navegadores y en el servidor, agrupado. Con el request id se
 * busca el detalle en los logs del VPS: `docker logs coach 2>&1 | grep <id>`.
 */
function Errors() {
  const q = useQuery(adminErrorsQuery);
  const qc = useQueryClient();
  const toast = useToast();
  const resolve = useMutation({
    mutationFn: (id: string) => api(`/admin/errors/${id}/resolve`, { body: {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "errors"] }),
    onError: (e) => toast(errorMessage(e), "error"),
  });
  return (
    <QueryState q={q}>
      {(rows) =>
        rows.length === 0 ? (
          <p className="text-ink-2">Ningún error sin resolver.</p>
        ) : (
          <RowList>
            {rows.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words text-ink">{e.message}</p>
                    <p className="text-[13.5px] text-ink-2">
                      {e.source === "web" ? "Navegador" : "Servidor"}, {e.path || "sin ruta"}, versión {e.version || "?"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <PlateMark tone={e.count > 5 ? "red" : "yellow"}>
                      {e.count} {e.count === 1 ? "vez" : "veces"}, última {relativeTime(e.lastSeen)}
                    </PlateMark>
                    <Button size="sm" variant="secondary" loading={resolve.isPending && resolve.variables === e.id} onClick={() => resolve.mutate(e.id)}>
                      Marcar resuelto
                    </Button>
                  </div>
                </div>
                {(e.stack || e.lastRequestId) && (
                  <details className="text-[13px] text-ink-2">
                    <summary className="cursor-pointer">Detalle</summary>
                    {e.lastRequestId && <p className="mt-2">Request id: <code className="font-narrow">{e.lastRequestId}</code></p>}
                    {e.userAgent && <p className="mt-1">{e.userAgent}</p>}
                    {e.stack && <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--radius-control)] bg-tray p-3 text-[12px] whitespace-pre-wrap">{e.stack}</pre>}
                  </details>
                )}
              </li>
            ))}
          </RowList>
        )
      }
    </QueryState>
  );
}

function Studios() {
  const studios = useQuery(adminStudiosQuery);
  const sum = useQuery(adminSummaryQuery).data;
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const current = studios.data?.find((s) => s.id === open) ?? null;
  return (
    <>
      {sum && (
        <p className="mb-5 max-w-[70ch] text-ink-2">
          {`${sum.studios} estudios: ${sum.paying} pagando (${formatEuros(sum.mrr)} al mes), ${sum.trial} en prueba y ${sum.locked} en pausa. ${sum.activeClients} clientes en total.`}
        </p>
      )}
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
