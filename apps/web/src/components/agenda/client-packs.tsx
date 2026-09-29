import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Client, SessionPack } from "@coach/shared";
import { Button } from "../ui/button";
import { SidePanel } from "../ui/dialog";
import { Checkbox, TextArea, TextField } from "../ui/field";
import { BlockTitle, PlateMark } from "../ui/layout";
import { Skeleton } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { useConfirm } from "../ui/confirm";
import { FormError } from "../form-error";
import { packsQuery, usePackMutation } from "../../lib/packs";
import { dayMonth, today } from "../../lib/dates";
import { errorMessage } from "../../lib/api";

const euros = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

/** Bonos de sesiones del cliente: cuántas lleva, cuántas le quedan, si está pagado y cuándo caduca. */
export function ClientPacks({ client }: { client: Client }) {
  const q = useQuery(packsQuery(client.id));
  const [edit, setEdit] = useState<SessionPack | "new" | null>(null);
  const t = today();
  const shown = (q.data ?? []).filter((p) => !p.archived);
  return (
    <section aria-labelledby="packs-title" className="mb-10">
      <BlockTitle id="packs-title" action={<Button size="sm" variant="secondary" onClick={() => setEdit("new")}>Nuevo bono</Button>}>
        Bonos
      </BlockTitle>
      {q.isPending ? (
        <Skeleton className="h-16" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-2">Sin bonos. Si entrena con bono de sesiones, créalo aquí: cada cita marcada como hecha (o a la que no venga) descuenta una.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {[...shown].reverse().map((p) => {
            const expired = Boolean(p.expires && p.expires < t);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setEdit(p)} className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 py-3 text-left hover:bg-tray">
                  <span className="min-w-0 flex-1 basis-[200px]">
                    <span className="block font-medium">{p.name}</span>
                    <span className="block text-[13px] text-ink-2">
                      {p.used} de {p.total} usadas{p.expires ? `, caduca el ${dayMonth(p.expires)}` : ""}
                      {p.price != null ? `, ${euros(p.price)}` : ""}
                    </span>
                  </span>
                  <span className="flex gap-[3px]" aria-hidden="true">
                    {Array.from({ length: Math.min(p.total, 20) }, (_, i) => (
                      <span key={i} className={i < p.used ? "h-4 w-[5px] rounded-[1px] bg-ink-3" : "h-4 w-[5px] rounded-[1px] bg-plate-green"} />
                    ))}
                  </span>
                  <span className="flex w-full gap-3 sm:w-auto">
                    <PlateMark tone={expired ? "red" : p.remaining === 0 ? "red" : p.remaining === 1 ? "yellow" : "green"}>
                      {expired ? "Caducado" : p.remaining === 0 ? "Agotado" : `Quedan ${p.remaining}`}
                    </PlateMark>
                    <PlateMark tone={p.paid ? "green" : "red"}>{p.paid ? "Pagado" : "Sin pagar"}</PlateMark>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <PackPanel clientId={client.id} pack={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function PackPanel({ clientId, pack, onClose }: { clientId: string; pack: SessionPack | null; onClose: () => void }) {
  const m = usePackMutation(clientId);
  const toast = useToast();
  const ask = useConfirm();
  const [f, setF] = useState({
    name: pack?.name ?? "Bono 10 sesiones",
    total: String(pack?.total ?? 10),
    expires: pack?.expires ?? "",
    price: pack?.price != null ? String(pack.price).replace(".", ",") : "",
    paid: pack?.paid ?? false,
    notes: pack?.notes ?? "",
  });
  const body = {
    name: f.name,
    total: Number(f.total) || 0,
    expires: f.expires || null,
    price: f.price.trim() ? Number(f.price.replace(",", ".")) : null,
    paid: f.paid,
    notes: f.notes,
  };
  const done = (msg: string) => () => (toast(msg), onClose());
  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={pack ? pack.name : "Nuevo bono"}
      description={pack ? `${pack.used} de ${pack.total} sesiones usadas.` : "Las citas de sesión marcadas como hechas o «no vino» descuentan del bono más antiguo que siga valiendo."}
      footer={
        <>
          {pack && (
            <Button
              variant="quiet"
              className="sm:mr-auto"
              onClick={async () =>
                pack.used === 0
                  ? (await ask({ title: "Borrar el bono", confirm: "Borrar bono", danger: true })) && m.mutate({ remove: pack.id }, { onSuccess: done("Bono borrado") })
                  : m.mutate({ id: pack.id, body: { ...body, archived: true } }, { onSuccess: done("Bono archivado") })
              }
            >
              {pack.used === 0 ? "Borrar" : "Archivar"}
            </Button>
          )}
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={m.isPending}
            disabled={!f.name.trim() || body.total < 1}
            onClick={() => (pack ? m.mutate({ id: pack.id, body }, { onSuccess: done("Bono guardado") }) : m.mutate({ create: body }, { onSuccess: done("Bono creado") }))}
          >
            {pack ? "Guardar" : "Crear bono"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <TextField label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Sesiones" type="number" min={1} max={200} value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} />
          <TextField label="Precio" aside="€, opcional" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        </div>
        <TextField label="Caduca" aside="opcional" type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} className="max-w-[240px]" />
        <Checkbox label="Pagado" description="La app no cobra: es para que lo tengas apuntado." checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} />
        <TextArea label="Notas" aside="opcional" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <FormError message={m.isError ? errorMessage(m.error) : null} />
      </div>
    </SidePanel>
  );
}
