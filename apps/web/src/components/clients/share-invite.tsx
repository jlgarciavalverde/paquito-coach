import { ShareNetwork, WhatsappLogo } from "@phosphor-icons/react";
import type { InviteLink } from "@coach/shared";
import { CopyField } from "../ui/copy-field";
import { Button } from "../ui/button";
import { firstName } from "../../lib/format";

/** Enlace de invitación listo para mandar por WhatsApp, compartir o copiar. */
export function ShareInvite({ invite, clientName, coachName }: { invite: InviteLink; clientName: string; coachName: string }) {
  const text = `Hola ${firstName(clientName)}, soy ${firstName(coachName)}. Aquí tienes tu acceso a la app donde verás tus entrenos, tu plan de comidas y podrás escribirme: ${invite.url}`;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const expires = new Date(invite.expiresAt).toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  return (
    <div className="flex flex-col gap-3">
      <CopyField value={invite.url} label="Enlace de invitación" />
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#1f7a4d] px-4 text-sm font-medium text-white hover:brightness-110"
        >
          <WhatsappLogo size={18} weight="fill" /> Enviar por WhatsApp
        </a>
        {canShare && (
          <Button variant="secondary" icon={<ShareNetwork size={17} />} onClick={() => navigator.share({ text }).catch(() => {})}>
            Compartir
          </Button>
        )}
      </div>
      <p className="text-[13px] text-ink-3">Es personal y de un solo uso. Caduca el {expires}.</p>
    </div>
  );
}
