import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArrowCounterClockwise, ArrowLeft, EnvelopeSimple, Key, LinkSimple, Phone } from "@phosphor-icons/react";
import type { Client, InviteLink } from "@coach/shared";
import { Avatar } from "../../../components/ui/avatar";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/surface";
import { Dialog } from "../../../components/ui/dialog";
import { TextArea, TextField } from "../../../components/ui/field";
import { Skeleton } from "../../../components/ui/spinner";
import { TabPanel, Tabs } from "../../../components/ui/tabs";
import { useToast } from "../../../components/ui/toast";
import { FormError } from "../../../components/form-error";
import { ComingSoon } from "../../../components/coming-soon";
import { StatusBadge } from "../../../components/clients/status-badge";
import { ShareInvite } from "../../../components/clients/share-invite";
import { clientQuery, useClientAction, useInvite, useResetLink, useUpdateClient } from "../../../lib/queries";
import { CopyField } from "../../../components/ui/copy-field";
import { useMe } from "../../../lib/auth";
import { age, fmtDate } from "../../../lib/format";
import { errorMessage } from "../../../lib/api";

export const Route = createFileRoute("/coach/clientes/$clientId")({
  component: ClientPage,
});

function ClientPage() {
  const { clientId } = Route.useParams();
  const q = useQuery(clientQuery(clientId));
  const [tab, setTab] = useState("ficha");

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (q.isError) return <p className="text-danger">{errorMessage(q.error)}</p>;
  const c = q.data;

  return (
    <>
      <Link to="/coach/clientes" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={16} /> Clientes
      </Link>
      <ClientHeader client={c} />
      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "ficha", label: "Ficha" },
          { value: "entreno", label: "Entreno" },
          { value: "nutricion", label: "Nutrición" },
          { value: "calendario", label: "Calendario" },
          { value: "chat", label: "Chat" },
        ]}
      >
        <TabPanel value="ficha">
          <ClientForm client={c} />
        </TabPanel>
        <TabPanel value="entreno">
          <ComingSoon title="Su plan de entrenamiento" phase="Fase 2">
            Aquí asignarás rutinas de tu biblioteca a días concretos y verás lo que ha registrado en cada sesión.
            <ul>
              <li>Series, repeticiones, carga, %RM, RIR/RPE, tempo y descanso.</li>
              <li>Vídeo de cada ejercicio.</li>
              <li>Histórico de cargas para ver la progresión.</li>
            </ul>
          </ComingSoon>
        </TabPanel>
        <TabPanel value="nutricion">
          <ComingSoon title="Su plan de comidas" phase="Fase 3">
            Plan semanal por días y comidas, con alternativas y objetivos de kcal/macros opcionales. El cliente marca lo que va cumpliendo.
          </ComingSoon>
        </TabPanel>
        <TabPanel value="calendario">
          <ComingSoon title="Su calendario" phase="Fase 4">
            Citas presenciales, entrenos asignados y comidas en una misma vista semanal o mensual. Arrastra para reprogramar.
          </ComingSoon>
        </TabPanel>
        <TabPanel value="chat">
          <ComingSoon title="Conversación privada" phase="Fase 5">
            Chat en tiempo real con fotos, sin compartir tu número de teléfono.
          </ComingSoon>
        </TabPanel>
      </Tabs>
    </>
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
  const years = age(c.birthDate);

  const genInvite = () =>
    invite.mutate(undefined, {
      onSuccess: setLink,
      onError: (e) => toast(errorMessage(e), "error"),
    });

  return (
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <Avatar name={c.name} size={64} className="text-[22px]" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[38px] leading-[1.05] sm:text-[44px]">{c.name}</h1>
            <StatusBadge status={c.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
            {c.email && (
              <span className="inline-flex items-center gap-1.5">
                <EnvelopeSimple size={15} /> {c.email}
              </span>
            )}
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                <Phone size={15} /> {c.phone}
              </a>
            )}
            {years !== null && <span>{years} años</span>}
            <span className="text-ink-3">Alta: {fmtDate(c.createdAt)}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(c.status === "invited" || c.status === "no_account") && (
          <Button variant={c.status === "invited" ? "secondary" : "primary"} icon={<LinkSimple size={17} />} loading={invite.isPending} onClick={genInvite}>
            {c.status === "invited" ? "Nuevo enlace" : "Invitar a la app"}
          </Button>
        )}
        {c.status === "active" && (
          <Button
            variant="ghost"
            icon={<Key size={17} />}
            loading={reset.isPending}
            onClick={() => reset.mutate(undefined, { onSuccess: setResetLink, onError: (e) => toast(errorMessage(e), "error") })}
          >
            Recuperar acceso
          </Button>
        )}
        {c.status === "archived" ? (
          <Button variant="secondary" icon={<ArrowCounterClockwise size={17} />} loading={act.isPending} onClick={() => act.mutate("unarchive", { onSuccess: () => toast("Cliente recuperado") })}>
            Recuperar
          </Button>
        ) : (
          c.status !== "pending" && (
            <Button
              variant="ghost"
              icon={<Archive size={17} />}
              loading={act.isPending}
              onClick={() => {
                if (confirm(`¿Archivar a ${c.name}? ${c.userId ? "Perderá el acceso a la app hasta que lo recuperes." : ""}`))
                  act.mutate("archive", { onSuccess: () => toast("Cliente archivado") });
              }}
            >
              Archivar
            </Button>
          )
        )}
      </div>
      <Dialog open={Boolean(link)} onOpenChange={(o) => !o && setLink(null)} title="Enlace de invitación" description={`Mándaselo a ${c.name}. El enlace anterior deja de funcionar.`}>
        {link && <ShareInvite invite={link} clientName={c.name} coachName={me.name} />}
      </Dialog>
      <Dialog
        open={Boolean(resetLink)}
        onOpenChange={(o) => !o && setResetLink(null)}
        title="Recuperar acceso"
        description={`Si ${c.name} ha olvidado su contraseña, mándale este enlace. Vale 24 horas y un solo uso.`}
      >
        {resetLink && <CopyField value={resetLink.url} label="Enlace para nueva contraseña" />}
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

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="font-display text-[24px]">Datos personales</h2>
        <TextField label="Nombre y apellidos" value={f.name} onChange={set("name")} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Correo" type="email" value={f.email} onChange={set("email")} disabled={Boolean(client.userId)} hint={client.userId ? "Es el correo de su cuenta." : undefined} />
          <TextField label="Teléfono" type="tel" value={f.phone} onChange={set("phone")} />
        </div>
        <TextField label="Fecha de nacimiento" type="date" value={f.birthDate} onChange={set("birthDate")} />
        <TextArea label="Objetivo" rows={2} value={f.goal} onChange={set("goal")} />
        <TextField label="Etiquetas" hint="Separadas por comas: «presencial, rodilla, mañanas»" value={f.tags} onChange={set("tags")} />
      </Card>
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h2 className="font-display text-[24px]">Salud y lesiones</h2>
            <p className="text-[13px] text-ink-3">Dato sensible. Solo lo ves tú; queda registro de cada consulta.</p>
          </div>
          <TextArea label="Lesiones, patologías, limitaciones" rows={5} value={f.healthNotes} onChange={set("healthNotes")} placeholder="Ej.: Tendinopatía rotuliana derecha (2025). Evitar impacto." />
        </Card>
        <Card className="flex flex-col gap-4 bg-warning-soft/40 p-5 sm:p-6">
          <div>
            <h2 className="font-display text-[24px]">Notas privadas</h2>
            <p className="text-[13px] text-ink-3">El cliente nunca las ve.</p>
          </div>
          <TextArea label="Notas" className="[&_label]:sr-only" rows={4} value={f.privateNotes} onChange={set("privateNotes")} />
        </Card>
      </div>
      <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 lg:col-span-2 lg:bottom-6">
        <FormError message={update.isError ? errorMessage(update.error) : null} />
        {dirty && (
          <div className="flex gap-2 rounded-[16px] border border-line bg-surface/95 p-2 shadow-[var(--shadow-lift)] backdrop-blur">
            <Button variant="ghost" onClick={() => setF(toForm(client))}>
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
