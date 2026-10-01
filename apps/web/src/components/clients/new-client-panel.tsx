import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Client, InviteLink } from "@coach/shared";
import { SidePanel } from "../ui/dialog";
import { Button } from "../ui/button";
import { TextArea, TextField } from "../ui/field";
import { FormError } from "../form-error";
import { ShareInvite } from "./share-invite";
import { useCoachActions } from "../coach-actions";
import { useCreateClient } from "../../lib/queries";
import { errorMessage } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { cn } from "../../lib/cn";

/** `initial`: datos de partida (p. ej. una solicitud de la página pública); `onCreated` se llama al crear la ficha. */
export function NewClientPanel({ open, onOpenChange, initial, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: { name: string; email: string; phone: string; goal: string }; onCreated?: () => void }) {
  const me = useMe()!;
  const navigate = useNavigate();
  const create = useCreateClient();
  const blank = { name: initial?.name ?? "", email: initial?.email ?? "", phone: initial?.phone ?? "", goal: initial?.goal ?? "", healthNotes: "" };
  const [f, setF] = useState(blank);
  const [invite, setInvite] = useState(true);
  const [done, setDone] = useState<{ client: Client; invite: InviteLink | null } | null>(null);
  const actions = useCoachActions();

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o)
      setTimeout(() => {
        setF(blank);
        setInvite(true);
        setDone(null);
        create.reset();
      }, 250);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: f.name, email: f.email || null, phone: f.phone || null, goal: f.goal || null, healthNotes: f.healthNotes || null, invite },
      {
        onSuccess: (r) => {
          onCreated?.();
          // La ficha se abre detrás; la hoja se queda con la invitación y los siguientes pasos.
          void navigate({ to: "/coach/clientes/$clientId", params: { clientId: r.client.id } });
          setDone({ client: r.client, invite: r.invite ?? null });
        },
      },
    );
  };

  if (done) {
    const first = done.client.name.split(" ")[0];
    const then = (fn: () => void) => () => (close(false), setTimeout(fn, 60));
    const steps = [
      { label: "Asignar su primera rutina", hint: "Elige rutina y días; puedes repetirla varias semanas.", run: then(() => actions.assign({ clientId: done.client.id })) },
      { label: "Programar la primera cita", hint: "Valoración inicial o primera sesión.", run: then(() => actions.newAppointment(done.client.id)) },
      { label: "Preparar su plan de comidas", hint: "Desde cero o a partir de una plantilla.", run: then(() => void navigate({ to: "/coach/clientes/$clientId", params: { clientId: done.client.id }, search: { pestana: "nutricion" } })) },
      { label: "Anotar peso y medidas de partida", hint: "Para ver su evolución desde el primer día.", run: then(() => actions.measure(done.client.id)) },
    ];
    return (
      <SidePanel
        open={open}
        onOpenChange={close}
        title={`Ficha de ${done.client.name} creada`}
        description={done.invite ? "Mándale este enlace para que cree su cuenta. Mientras no lo use, aparecerá como invitado." : "Cliente sin cuenta: lo planificas y registras tú. Puedes invitarle cuando quieras."}
        footer={
          <Button variant="quiet" onClick={() => close(false)}>
            Cerrar
          </Button>
        }
      >
        <div className="flex flex-col gap-8">
          {done.invite && <ShareInvite invite={done.invite} clientName={done.client.name} coachName={me.name} />}
          <section aria-labelledby="next-steps">
            <h3 id="next-steps" className="font-wide text-[17px]">
              Siguientes pasos con {first}
            </h3>
            <ol className="mt-3 flex flex-col divide-y divide-rule border-y border-rule">
              {steps.map((st, i) => (
                <li key={st.label}>
                  <button type="button" onClick={st.run} className="flex w-full items-start gap-3 py-3 text-left hover:bg-tray">
                    <span className="font-narrow w-5 shrink-0 text-right text-[17px] leading-6 text-ink-3" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-primary">{st.label}</span>
                      <span className="block text-[13px] text-ink-2">{st.hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>
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
