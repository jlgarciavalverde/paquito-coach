import { ShareNetwork, WhatsappLogo } from "@phosphor-icons/react";
import type { InviteLink } from "@coach/shared";
import { CopyField } from "../ui/copy-field";
import { Button } from "../ui/button";
import { firstName } from "../../lib/format";

/** Botón «Enviar por WhatsApp» con un texto ya escrito (el verde de WhatsApp es la única excepción de color). */
export function WhatsAppLink({ text }: { text: string }) {
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-[#1b7348] px-3.5 text-sm font-medium text-white hover:bg-[#155f3b]"
    >
      <WhatsappLogo size={18} weight="fill" /> Enviar por WhatsApp
    </a>
  );
}

/** Enlace de invitación listo para mandar por WhatsApp, compartir o copiar. */
export function ShareInvite({ invite, clientName, coachName }: { invite: InviteLink; clientName: string; coachName: string }) {
  const text = `Hola ${firstName(clientName)}, soy ${firstName(coachName)}. Con este enlace entras en la app donde verás tus entrenos y tu plan de comidas, y podrás escribirme: ${invite.url}`;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const expires = new Date(invite.expiresAt).toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  return (
    <div className="flex flex-col gap-3">
      {invite.emailedTo && (
        <p role="status" className="border-l-[5px] border-plate-green bg-plate-green-soft px-3 py-2 text-sm">
          Le hemos enviado la invitación por correo a <strong>{invite.emailedTo}</strong>. Si prefieres, mándasela también por WhatsApp.
        </p>
      )}
      <CopyField value={invite.url} label="Enlace de invitación" />
      <div className="flex flex-wrap gap-2">
        <WhatsAppLink text={text} />
        {canShare && (
          <Button variant="secondary" icon={<ShareNetwork size={17} />} onClick={() => navigator.share({ text }).catch(() => {})}>
            Compartir
          </Button>
        )}
      </div>
      <p className="text-[13px] text-ink-3">Sirve una sola vez y caduca el {expires}.</p>
    </div>
  );
}
