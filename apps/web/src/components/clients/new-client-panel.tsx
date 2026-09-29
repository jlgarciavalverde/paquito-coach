import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Client, InviteLink } from "@coach/shared";
import { SidePanel } from "../ui/dialog";
import { Button } from "../ui/button";
import { TextArea, TextField } from "../ui/field";
import { FormError } from "../form-error";
import { ShareInvite } from "./share-invite";
import { useCreateClient } from "../../lib/queries";
import { errorMessage } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { cn } from "../../lib/cn";

export function NewClientPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useMe()!;
  const navigate = useNavigate();
  const create = useCreateClient();
  const [f, setF] = useState({ name: "", email: "", phone: "", goal: "", healthNotes: "" });
  const [invite, setInvite] = useState(true);
  const [done, setDone] = useState<{ client: Client; invite: InviteLink } | null>(null);

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o)
      setTimeout(() => {
        setF({ name: "", email: "", phone: "", goal: "", healthNotes: "" });
        setInvite(true);
        setDone(null);
        create.reset();
      }, 250);
  };
  const openRecord = (id: string) => {
    close(false);
    void navigate({ to: "/coach/clientes/$clientId", params: { clientId: id } });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: f.name, email: f.email || null, phone: f.phone || null, goal: f.goal || null, healthNotes: f.healthNotes || null, invite },
      { onSuccess: (r) => (r.invite ? setDone({ client: r.client, invite: r.invite }) : openRecord(r.client.id)) },
    );
  };

  if (done) {
    return (
      <SidePanel
        open={open}
        onOpenChange={close}
        title={`Ficha de ${done.client.name} creada`}
        description="Mándale este enlace para que cree su cuenta. Mientras no lo use, aparecerá como invitado."
        footer={
          <>
            <Button variant="quiet" onClick={() => close(false)}>
              Cerrar
            </Button>
            <Button onClick={() => openRecord(done.client.id)}>Abrir su ficha</Button>
          </>
        }
      >
        <ShareInvite invite={done.invite} clientName={done.client.name} coachName={me.name} />
      </SidePanel>
    );
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={close}
      title="Nuevo cliente"
      description="Solo hace falta el nombre. El resto lo puedes completar después en su ficha."
      footer={
        <>
          <Button variant="quiet" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="new-client" loading={create.isPending} disabled={!f.name.trim()}>
            {invite ? "Crear e invitar" : "Crear ficha"}
          </Button>
        </>
      }
    >
      <form id="new-client" onSubmit={submit} className="flex flex-col gap-5">
        <TextField label="Nombre y apellidos" required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Correo" type="email" aside="opcional" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <TextField label="Teléfono" type="tel" aside="opcional" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <TextArea label="Objetivo" aside="opcional" placeholder="Volver a correr tras la plastia de LCA" rows={2} value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} />
        <TextArea
          label="Lesiones y limitaciones"
          aside="opcional"
          hint="Aparecerá como aviso en rojo encima de su planificación."
          rows={2}
          value={f.healthNotes}
          onChange={(e) => setF({ ...f, healthNotes: e.target.value })}
        />
        <fieldset>
          <legend className="mb-2 text-[13.5px] font-medium">¿Va a usar la app?</legend>
          <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-control)] border border-rule-strong">
            {[
              { v: true, t: "Sí, invitarle", d: "Recibe un enlace para crear su cuenta." },
              { v: false, t: "No, solo ficha", d: "Cliente presencial. Puedes invitarle luego." },
            ].map((o) => (
              <label key={String(o.v)} className={cn("flex cursor-pointer flex-col gap-0.5 p-3 transition-colors first:border-r first:border-rule-strong", invite === o.v ? "bg-primary-soft" : "hover:bg-tray")}>
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input type="radio" name="invite" checked={invite === o.v} onChange={() => setInvite(o.v)} className="accent-[var(--primary)]" />
                  {o.t}
                </span>
                <span className="text-[13px] text-ink-2">{o.d}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <FormError message={create.isError ? errorMessage(create.error) : null} />
      </form>
    </SidePanel>
  );
}
