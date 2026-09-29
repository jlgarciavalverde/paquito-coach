import { useEffect, useId, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CaretLeft } from "@phosphor-icons/react";
import type { Client, InviteLink } from "@coach/shared";
import { Button, buttonClass } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { TextField, controlClass } from "../../../components/ui/field";
import { HealthAlert, Monogram, RecordRow, RecordSheet } from "../../../components/ui/layout";
import { Skeleton } from "../../../components/ui/spinner";
import { TabPanel, Tabs } from "../../../components/ui/tabs";
import { useToast } from "../../../components/ui/toast";
import { CopyField } from "../../../components/ui/copy-field";
import { FormError } from "../../../components/form-error";
import { Thread } from "../../../components/chat/thread";
import { StatusMark } from "../../../components/clients/status-mark";
import { ShareInvite } from "../../../components/clients/share-invite";
import { ClientTraining } from "../../../components/training/client-training";
import { ClientNutrition } from "../../../components/nutrition/client-nutrition";
import { ClientAgenda } from "../../../components/agenda/client-agenda";
import { clientQuery, useClientAction, useInvite, useResetLink, useUpdateClient } from "../../../lib/queries";
import { useMe } from "../../../lib/auth";
import { age, fmtDate } from "../../../lib/format";
import { api, errorMessage } from "../../../lib/api";
import { useSubmit } from "../../../lib/use-form";
import { cn } from "../../../lib/cn";
import { useDocumentTitle } from "../../../lib/title";

export const Route = createFileRoute("/coach/clientes/$clientId")({
  component: ClientPage,
});

function ClientPage() {
  const { clientId } = Route.useParams();
  const q = useQuery(clientQuery(clientId));
  const [tab, setTab] = useState("entreno");
  useDocumentTitle(q.data?.name ?? "Cliente");

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-20" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (q.isError) return <p className="text-plate-red">{errorMessage(q.error)}</p>;
  const c = q.data;

  return (
    <article>
      <Link to="/coach/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink lg:hidden">
        <CaretLeft size={15} /> Clientes
      </Link>
      <ClientHeader client={c} />
      {c.healthNotes && (
        <div className="mb-6">
          <HealthAlert>{c.healthNotes}</HealthAlert>
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "entreno", label: "Entreno" },
          { value: "ficha", label: "Ficha" },
          { value: "nutricion", label: "Nutrición" },
          { value: "agenda", label: "Agenda" },
          { value: "chat", label: "Chat" },
        ]}
      >
        <TabPanel value="entreno">
          <ClientTraining client={c} />
        </TabPanel>
        <TabPanel value="ficha">
          <ClientForm client={c} />
        </TabPanel>
        <TabPanel value="nutricion">
          <ClientNutrition client={c} />
        </TabPanel>
        <TabPanel value="agenda">
          <ClientAgenda client={c} />
        </TabPanel>
        <TabPanel value="chat">
          <div className="flex h-[70dvh] min-h-[420px] flex-col">
            <Thread
              threadKey={c.id}
              mine={(m) => m.fromCoach}
              otherName={c.name}
              disabledReason={c.userId ? undefined : `${c.name} aún no tiene cuenta en la app. Invítale para poder escribirle.`}
              className="flex-1"
            />
          </div>
        </TabPanel>
      </Tabs>
    </article>
  );
}

function ClientHeader({ client: c }: { client: Client }) {
  const me = useMe()!;
  const toast = useToast();
  const act = useClientAction(c.id);
  const invite = useInvite(c.id);
  const reset = useResetLink(c.id);
  const [link, setLink] = useState<InviteLink | null>(null);
  const [resetLink, setResetLink] = useState<InviteLink | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const years = age(c.birthDate);

  const facts: [string, React.ReactNode][] = [
    ["Objetivo", c.goal ?? <span className="text-ink-3">Sin anotar</span>],
    ["Edad", years !== null ? `${years} años` : <span className="text-ink-3">—</span>],
    ["Contacto", c.phone ? <a href={`tel:${c.phone}`} className="hover:text-primary">{c.phone}</a> : (c.email ?? <span className="text-ink-3">—</span>)],
    ["Cliente desde", fmtDate(c.createdAt)],
  ];

  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Monogram name={c.name} size={56} />
          <div>
            <h1 className="font-wide text-[28px] leading-[1.1] sm:text-[32px]">{c.name}</h1>
            <div className="mt-1">
              <StatusMark status={c.status} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {(c.status === "invited" || c.status === "no_account") && (
            <Button variant={c.status === "no_account" ? "primary" : "secondary"} loading={invite.isPending} onClick={() => invite.mutate(undefined, { onSuccess: setLink, onError: (e) => toast(errorMessage(e), "error") })}>
              {c.status === "invited" ? "Enlace nuevo" : "Invitar a la app"}
            </Button>
          )}
          {c.status === "active" && (
            <Button variant="quiet" loading={reset.isPending} onClick={() => reset.mutate(undefined, { onSuccess: setResetLink, onError: (e) => toast(errorMessage(e), "error") })}>
              Recuperar acceso
            </Button>
          )}
          <a href={`/api/v1/clients/${c.id}/export`} download className={buttonClass("quiet")}>
            Descargar datos
          </a>
          {c.status === "archived" ? (
            <>
              <Button variant="secondary" loading={act.isPending} onClick={() => act.mutate("unarchive", { onSuccess: () => toast("Cliente recuperado") })}>
                Recuperar cliente
              </Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Borrar definitivamente
              </Button>
            </>
          ) : (
            c.status !== "pending" && (
              <Button variant="quiet" onClick={() => setConfirmArchive(true)}>
                Archivar
              </Button>
            )
          )}
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-rule py-3.5 sm:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[13px] text-ink-3">{k}</dt>
            <dd className="truncate text-sm text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <Dialog open={Boolean(link)} onOpenChange={(o) => !o && setLink(null)} title="Enlace de invitación" description={`Mándaselo a ${c.name}. El enlace anterior deja de funcionar.`}>
        {link && <ShareInvite invite={link} clientName={c.name} coachName={me.name} />}
      </Dialog>
      <Dialog open={Boolean(resetLink)} onOpenChange={(o) => !o && setResetLink(null)} title="Recuperar acceso" description={`Si ${c.name} ha olvidado su contraseña, mándale este enlace. Vale 24 horas y un solo uso.`}>
        {resetLink && <CopyField value={resetLink.url} label="Enlace para nueva contraseña" />}
      </Dialog>
      {confirmDelete && <DeleteClientDialog client={c} onClose={() => setConfirmDelete(false)} />}
      <Dialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archivar a ${c.name}`}
        description={c.userId ? "Dejará de poder entrar en la app hasta que lo recuperes. Su historial se conserva." : "Desaparece de la lista. Su historial se conserva."}
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirmArchive(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={act.isPending}
              onClick={() => act.mutate("archive", { onSuccess: () => (setConfirmArchive(false), toast("Cliente archivado")) })}
            >
              Archivar
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Puedes recuperarlo cuando quieras desde el filtro «Archivados».</p>
      </Dialog>
    </header>
  );
}

type FormState = { name: string; email: string; phone: string; birthDate: string; goal: string; healthNotes: string; privateNotes: string; tags: string };
const toForm = (c: Client): FormState => ({
  name: c.name,
  email: c.email ?? "",
  phone: c.phone ?? "",
  birthDate: c.birthDate ?? "",
  goal: c.goal ?? "",
  healthNotes: c.healthNotes ?? "",
  privateNotes: c.privateNotes ?? "",
  tags: c.tags.join(", "),
});

function ClientForm({ client }: { client: Client }) {
  const toast = useToast();
  const update = useUpdateClient(client.id);
  const [f, setF] = useState(() => toForm(client));
  useEffect(() => setF(toForm(client)), [client]);
  const dirty = JSON.stringify(f) !== JSON.stringify(toForm(client));
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const ids = { name: useId(), email: useId(), phone: useId(), birth: useId(), goal: useId(), health: useId(), notes: useId(), tags: useId() };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        name: f.name,
        email: f.email || null,
        phone: f.phone || null,
        birthDate: f.birthDate || null,
        goal: f.goal || null,
        healthNotes: f.healthNotes || null,
        privateNotes: f.privateNotes || null,
        tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      },
      { onSuccess: () => toast("Ficha guardada") },
    );
  };
  const input = cn(controlClass, "h-10");
  const area = cn(controlClass, "resize-y py-2 leading-relaxed");

  return (
    <form onSubmit={save} className="max-w-[820px]">
      <RecordSheet>
        <RecordRow label="Nombre y apellidos" htmlFor={ids.name}>
          <input id={ids.name} className={input} value={f.name} onChange={set("name")} required />
        </RecordRow>
        <RecordRow label="Correo" htmlFor={ids.email} hint={client.userId ? "Es el de su cuenta; no se puede cambiar aquí." : undefined}>
          <input id={ids.email} type="email" className={input} value={f.email} onChange={set("email")} disabled={Boolean(client.userId)} />
        </RecordRow>
        <RecordRow label="Teléfono" htmlFor={ids.phone}>
          <input id={ids.phone} type="tel" className={input} value={f.phone} onChange={set("phone")} />
        </RecordRow>
        <RecordRow label="Fecha de nacimiento" htmlFor={ids.birth}>
          <input id={ids.birth} type="date" className={cn(input, "max-w-[220px]")} value={f.birthDate} onChange={set("birthDate")} />
        </RecordRow>
        <RecordRow label="Objetivo" htmlFor={ids.goal}>
          <textarea id={ids.goal} rows={2} className={area} value={f.goal} onChange={set("goal")} />
        </RecordRow>
        <RecordRow label="Lesiones y limitaciones" htmlFor={ids.health} hint="Dato de salud. Solo lo ves tú y queda registro de cada consulta.">
          <textarea id={ids.health} rows={4} className={area} value={f.healthNotes} onChange={set("healthNotes")} placeholder="Tendinopatía rotuliana derecha (2025). Evitar impacto." />
        </RecordRow>
        <RecordRow label="Notas privadas" htmlFor={ids.notes} hint="El cliente no las ve en la app (sí en la copia de sus datos si la pide, por ley).">
          <textarea id={ids.notes} rows={3} className={area} value={f.privateNotes} onChange={set("privateNotes")} />
        </RecordRow>
        <RecordRow label="Etiquetas" htmlFor={ids.tags} hint="Separadas por comas.">
          <input id={ids.tags} className={input} value={f.tags} onChange={set("tags")} placeholder="presencial, mañanas" />
        </RecordRow>
      </RecordSheet>
      <div className="sticky bottom-16 z-10 mt-4 flex flex-wrap items-center justify-end gap-3 md:bottom-4">
        <FormError message={update.isError ? errorMessage(update.error) : null} />
        {dirty && (
          <div className="flex gap-1 rounded-[var(--radius-zone)] bg-ink p-1.5 shadow-[var(--shadow-float)]">
            <Button variant="quiet" className="text-paper hover:bg-[rgb(255_255_255/0.1)] hover:text-paper" onClick={() => setF(toForm(client))}>
              Descartar
            </Button>
            <Button type="submit" loading={update.isPending}>
              Guardar cambios
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}

function DeleteClientDialog({ client, onClose }: { client: Client; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const { pending, error, onSubmit } = useSubmit(
    () => api(`/clients/${client.id}/delete`, { body: { confirmName: name } }),
    () => {
      void qc.invalidateQueries({ queryKey: ["clients"] });
      toast(`${client.name} y todos sus datos se han borrado`);
      void navigate({ to: "/coach/clientes" });
    },
  );
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Borrar definitivamente"
      description={`Se borran la ficha de ${client.name}, su cuenta, entrenos, planes, citas, mensajes y fotos. No se puede deshacer. Si te lo ha pedido el cliente, descarga antes sus datos para dárselos.`}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" type="submit" form="del-client" loading={pending} disabled={name.trim().toLowerCase() !== client.name.trim().toLowerCase()}>
            Borrar todo
          </Button>
        </>
      }
    >
      <form id="del-client" onSubmit={onSubmit} className="flex flex-col gap-3">
        <TextField label={`Escribe «${client.name}» para confirmar`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <FormError message={error} />
      </form>
    </Dialog>
  );
}
