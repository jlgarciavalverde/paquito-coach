import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Client, InviteLink } from "@coach/shared";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { TextArea, TextField } from "../ui/field";
import { FormError } from "../form-error";
import { ShareInvite } from "./share-invite";
import { useCreateClient } from "../../lib/queries";
import { errorMessage } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { cn } from "../../lib/cn";

export function NewClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useMe()!;
  const navigate = useNavigate();
  const create = useCreateClient();
  const [f, setF] = useState({ name: "", email: "", phone: "", goal: "" });
  const [invite, setInvite] = useState(true);
  const [done, setDone] = useState<{ client: Client; invite: InviteLink | null } | null>(null);

  const reset = () => {
    setF({ name: "", email: "", phone: "", goal: "" });
    setInvite(true);
    setDone(null);
    create.reset();
  };
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setTimeout(reset, 200);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: f.name, email: f.email || null, phone: f.phone || null, goal: f.goal || null, invite },
      {
        onSuccess: (r) => {
          if (r.invite) setDone(r);
          else {
            close(false);
            void navigate({ to: "/coach/clientes/$clientId", params: { clientId: r.client.id } });
          }
        },
      },
    );
  };

  if (done?.invite) {
    return (
      <Dialog
        open={open}
        onOpenChange={close}
        title="Invitación lista"
        description={`Manda este enlace a ${done.client.name} para que active su cuenta.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cerrar
            </Button>
            <Button
              onClick={() => {
                close(false);
                void navigate({ to: "/coach/clientes/$clientId", params: { clientId: done.client.id } });
              }}
            >
              Ir a la ficha
            </Button>
          </>
        }
      >
        <ShareInvite invite={done.invite} clientName={done.client.name} coachName={me.name} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Nuevo cliente"
      description="Solo el nombre es obligatorio. El resto lo puedes completar después."
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="new-client" loading={create.isPending} disabled={!f.name.trim()}>
            {invite ? "Crear e invitar" : "Crear ficha"}
          </Button>
        </>
      }
    >
      <form id="new-client" onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Nombre y apellidos" required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Correo" type="email" aside="Opcional" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <TextField label="Teléfono" type="tel" aside="Opcional" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <TextArea label="Objetivo" aside="Opcional" placeholder="Ej.: volver a correr tras la rotura de LCA" rows={2} value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium">¿Usará la app?</legend>
          <Choice checked={invite} onSelect={() => setInvite(true)} title="Sí, generar invitación" text="Recibirá un enlace para crear su cuenta y ver sus entrenos, comidas y el chat." />
          <Choice checked={!invite} onSelect={() => setInvite(false)} title="No, solo ficha" text="Para clientes presenciales. Podrás invitarle más adelante." />
        </fieldset>
        <FormError message={create.isError ? errorMessage(create.error) : null} />
      </form>
    </Dialog>
  );
}

function Choice({ checked, onSelect, title, text }: { checked: boolean; onSelect: () => void; title: string; text: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[14px] border p-3.5 transition-colors",
        checked ? "border-accent bg-accent-soft/60" : "border-line-strong hover:bg-surface-2",
      )}
    >
      <input type="radio" name="invite" checked={checked} onChange={onSelect} className="mt-1 accent-[var(--accent)]" />
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-[13px] text-ink-2">{text}</span>
      </span>
    </label>
  );
}
