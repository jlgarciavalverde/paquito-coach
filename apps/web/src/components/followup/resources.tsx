import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePdf, LinkSimple } from "@phosphor-icons/react";
import type { Resource } from "@coach/shared";
import { Button } from "../ui/button";
import { SidePanel } from "../ui/dialog";
import { Checkbox, TextArea, TextField } from "../ui/field";
import { BlockTitle, EmptyNote } from "../ui/layout";
import { Skeleton } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { useConfirm } from "../ui/confirm";
import { FormError } from "../form-error";
import { resourcesQuery, uploadPdf, useResourceMutation } from "../../lib/library";
import { clientsQuery } from "../../lib/queries";
import { mediaUrl } from "../../lib/chat";
import { relativeTime } from "../../lib/format";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { QueryError } from "../ui/query-state";
import { RadioGroup } from "../ui/radio-group";

export const resourceHref = (r: Resource) => (r.kind === "pdf" && r.mediaId ? mediaUrl(r.mediaId) : (r.url ?? "#"));

/** Material para clientes: pautas en PDF y enlaces (vídeos, artículos), para todos o para algunos. */
export function ResourcesBlock() {
  const q = useQuery(resourcesQuery);
  const clients = useQuery(clientsQuery());
  const [edit, setEdit] = useState<Resource | "new" | null>(null);
  const nameOf = (id: string) => clients.data?.find((c) => c.id === id)?.name.split(" ")[0] ?? "—";
  return (
    <section aria-labelledby="res-title">
      <BlockTitle id="res-title" action={<Button size="sm" variant="secondary" onClick={() => setEdit("new")}>Añadir material</Button>}>
        Material para tus clientes
      </BlockTitle>
      {q.isPending ? (
        <Skeleton className="h-24" />
      ) : q.isError ? (
        <QueryError q={q} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyNote action={<Button onClick={() => setEdit("new")}>Añadir el primero</Button>}>
          Pautas de readaptación en PDF, vídeos de técnica o artículos que quieres que lean. Lo ven en su app, en «Material».
        </EmptyNote>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {q.data!.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-3">
              {r.kind === "pdf" ? <FilePdf size={20} className="mt-0.5 shrink-0 text-plate-red" aria-hidden="true" /> : <LinkSimple size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />}
              <button type="button" onClick={() => setEdit(r)} className="min-w-0 flex-1 text-left hover:text-primary">
                <span className="block font-medium">{r.title}</span>
                <span className="block text-[13px] text-ink-2">
                  {r.forAll ? "Para todos" : `Para ${r.clientIds.map(nameOf).join(", ")}`}. Añadido {relativeTime(r.createdAt)}.
                </span>
              </button>
              <a href={resourceHref(r)} target="_blank" rel="noreferrer noopener" className="shrink-0 text-[13px] font-medium text-primary hover:underline">
                Abrir
              </a>
            </li>
          ))}
        </ul>
      )}
      {edit && <ResourcePanel r={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function ResourcePanel({ r, onClose }: { r: Resource | null; onClose: () => void }) {
  const m = useResourceMutation();
  const toast = useToast();
  const ask = useConfirm();
  const clients = useQuery(clientsQuery("active"));
  const [f, setF] = useState({ title: r?.title ?? "", description: r?.description ?? "", kind: r?.kind ?? ("link" as Resource["kind"]), url: r?.url ?? "", forAll: r?.forAll ?? true, clientIds: r?.clientIds ?? [] });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const mediaId = f.kind === "pdf" ? (file ? await uploadPdf(file) : r?.mediaId ?? null) : null;
      await m.mutateAsync({ id: r?.id, body: { title: f.title, description: f.description, kind: f.kind, url: f.kind === "link" ? f.url : null, mediaId, forAll: f.forAll, clientIds: f.forAll ? [] : f.clientIds } });
      toast(r ? "Material guardado" : "Material añadido");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const ready = f.title.trim() && (f.kind === "link" ? /^https?:\/\/.+/.test(f.url.trim()) : Boolean(file || r?.mediaId)) && (f.forAll || f.clientIds.length > 0);
  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={r ? r.title : "Añadir material"}
      footer={
        <>
          {r && (
            <Button
              variant="quiet"
              className="sm:mr-auto"
              onClick={async () => (await ask({ title: "Quitar el material", body: "Tus clientes dejarán de verlo.", confirm: "Quitar", danger: true })) && m.mutate({ remove: r.id }, { onError: (e) => toast(errorMessage(e), "error"), onSuccess: () => (toast("Material quitado"), onClose()) })}
            >
              Quitar
            </Button>
          )}
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!ready}>
            {r ? "Guardar" : "Añadir"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <RadioGroup className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-control)] border border-rule-strong" aria-label="Tipo">
          {(["link", "pdf"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })} className={cn("h-10 text-sm font-medium not-first:border-l not-first:border-rule-strong", f.kind === k ? "bg-ink text-paper" : "text-ink-2 hover:bg-tray")}>
              {k === "link" ? "Enlace o vídeo" : "PDF"}
            </button>
          ))}
        </RadioGroup>
        <TextField label="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Pauta de ejercicios para casa" />
        {f.kind === "link" ? (
          <TextField label="Enlace" type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" />
        ) : (
          <label className="flex flex-col gap-1.5 text-[13.5px] font-medium">
            Archivo PDF {r?.mediaId && !file && <span className="font-normal text-ink-2">(ya subido; elige otro para cambiarlo)</span>}
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px] font-normal text-ink-2 file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-tray file:px-3 file:py-2 file:text-ink" />
          </label>
        )}
        <TextArea label="Para qué es" aside="opcional" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Checkbox label="Para todos mis clientes" checked={f.forAll} onChange={(e) => setF({ ...f, forAll: e.target.checked })} />
        {!f.forAll && (
          <fieldset>
            <legend className="mb-2 text-[13.5px] font-medium">Solo para</legend>
            <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-[var(--radius-control)] border border-rule p-3">
              {(clients.data ?? []).map((c) => (
                <Checkbox key={c.id} label={c.name} checked={f.clientIds.includes(c.id)} onChange={(e) => setF((s) => ({ ...s, clientIds: e.target.checked ? [...s.clientIds, c.id] : s.clientIds.filter((x) => x !== c.id) }))} />
              ))}
            </div>
          </fieldset>
        )}
        <FormError message={error} />
      </div>
    </SidePanel>
  );
}
