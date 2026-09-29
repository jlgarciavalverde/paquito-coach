import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { POSE_LABEL, PhotoPose, type ProgressPhoto } from "@coach/shared";
import { Button } from "../ui/button";
import { SidePanel } from "../ui/dialog";
import { Select, TextField } from "../ui/field";
import { BlockTitle, EmptyNote } from "../ui/layout";
import { Skeleton } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { useConfirm } from "../ui/confirm";
import { FormError } from "../form-error";
import { photosQuery, usePhotoMutation } from "../../lib/followup";
import { mediaUrl, uploadPhoto } from "../../lib/chat";
import { dayMonth, today } from "../../lib/dates";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import type { Who } from "../../lib/progress";

const POSES = PhotoPose.options;

/** Fotos de progreso: sesiones por fecha y comparación de dos fechas lado a lado (misma postura). */
export function ProgressPhotos({ who, name }: { who: Who; name?: string }) {
  const q = useQuery(photosQuery(who));
  const [open, setOpen] = useState(false);
  const rows = q.data ?? [];
  const dates = useMemo(() => [...new Set(rows.map((p) => p.date))].sort(), [rows]);

  return (
    <section aria-labelledby="ph-title">
      <BlockTitle id="ph-title" action={<Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Subir fotos</Button>}>
        Fotos de progreso
      </BlockTitle>
      {q.isPending ? (
        <Skeleton className="h-48" />
      ) : rows.length === 0 ? (
        <EmptyNote action={<Button onClick={() => setOpen(true)}>Subir las primeras</Button>}>
          {who === "me" ? "Aún no tienes fotos." : `Aún no hay fotos de ${name?.split(" ")[0] ?? "este cliente"}.`} De frente, de perfil y de espaldas, con la misma luz y ropa, cada 4 semanas.
          {who === "me" && " Solo las veis tú y tu entrenador."}
        </EmptyNote>
      ) : (
        <>
          {dates.length >= 2 && <Compare photos={rows} dates={dates} />}
          <Sessions who={who} photos={rows} dates={[...dates].reverse()} />
        </>
      )}
      <UploadPanel who={who} open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

function Compare({ photos, dates }: { photos: ProgressPhoto[]; dates: string[] }) {
  const [before, setBefore] = useState(dates[0]!);
  const [after, setAfter] = useState(dates.at(-1)!);
  const available = POSES.filter((p) => photos.some((x) => x.pose === p && x.date === before) && photos.some((x) => x.pose === p && x.date === after));
  const [pose, setPose] = useState<PhotoPose>(available[0] ?? "front");
  const shown = available.includes(pose) ? pose : available[0];
  const pick = (d: string) => photos.find((x) => x.date === d && x.pose === shown);
  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Antes" value={before} onChange={(e) => setBefore(e.target.value)} className="min-w-[140px]">
          {dates.map((d) => (
            <option key={d} value={d}>
              {dayMonth(d)}
            </option>
          ))}
        </Select>
        <Select label="Después" value={after} onChange={(e) => setAfter(e.target.value)} className="min-w-[140px]">
          {dates.map((d) => (
            <option key={d} value={d}>
              {dayMonth(d)}
            </option>
          ))}
        </Select>
        <div className="flex gap-1" role="group" aria-label="Postura">
          {POSES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={shown === p}
              disabled={!available.includes(p)}
              onClick={() => setPose(p)}
              className={cn("h-10 rounded-[var(--radius-control)] px-3 text-sm font-medium disabled:opacity-40", shown === p ? "bg-primary text-primary-ink" : "bg-tray text-ink-2 hover:bg-tray-2")}
            >
              {POSE_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      {shown ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-4">
          {[before, after].map((d, i) => {
            const p = pick(d);
            return (
              <figure key={i} className="min-w-0">
                {p && <img src={mediaUrl(p.mediaId)} alt={`${POSE_LABEL[p.pose]}, ${dayMonth(d)}`} className="aspect-[3/4] w-full rounded-[var(--radius-control)] bg-tray object-cover" loading="lazy" />}
                <figcaption className="font-narrow mt-1 text-[14px] text-ink-2">{i === 0 ? "Antes" : "Después"}, {dayMonth(d)}</figcaption>
              </figure>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-2">Esas dos fechas no tienen fotos de la misma postura.</p>
      )}
    </div>
  );
}

function Sessions({ who, photos, dates }: { who: Who; photos: ProgressPhoto[]; dates: string[] }) {
  const m = usePhotoMutation(who);
  const ask = useConfirm();
  return (
    <ol className="flex flex-col divide-y divide-rule border-y border-rule">
      {dates.map((d) => (
        <li key={d} className="flex gap-4 py-3">
          <span className="font-narrow w-14 shrink-0 pt-1 text-[15px] text-ink-2">{dayMonth(d)}</span>
          <ul className="flex flex-wrap gap-2">
            {photos
              .filter((p) => p.date === d)
              .map((p) => (
                <li key={p.id} className="flex flex-col items-start gap-1">
                  <a href={mediaUrl(p.mediaId)} target="_blank" rel="noreferrer" className="block">
                    <img src={mediaUrl(p.mediaId)} alt={`${POSE_LABEL[p.pose]}, ${dayMonth(d)}`} className="h-24 w-[72px] rounded-[4px] bg-tray object-cover" loading="lazy" />
                  </a>
                  <button
                    type="button"
                    className="text-[12.5px] text-ink-3 hover:text-plate-red"
                    aria-label={`Borrar foto ${POSE_LABEL[p.pose].toLowerCase()} del ${dayMonth(d)}`}
                    onClick={async () => (await ask({ title: "Borrar la foto", body: "Se borra del todo; no se puede recuperar.", confirm: "Borrar foto", danger: true })) && m.mutate({ remove: p.id })}
                  >
                    Borrar
                  </button>
                </li>
              ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function UploadPanel({ who, open, onClose }: { who: Who; open: boolean; onClose: () => void }) {
  const m = usePhotoMutation(who);
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [files, setFiles] = useState<Partial<Record<PhotoPose, File>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = Object.keys(files).length;
  const close = () => (setFiles({}), setError(null), onClose());
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const [pose, file] of Object.entries(files) as [PhotoPose, File][]) {
        const mediaId = await uploadPhoto(file, who === "me" ? undefined : who);
        await m.mutateAsync({ add: { mediaId, date, pose } });
      }
      toast(n === 1 ? "Foto guardada" : `${n} fotos guardadas`);
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SidePanel
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Subir fotos de progreso"
      description="Mejor con la misma luz, a la misma distancia y con ropa parecida cada vez."
      footer={
        <>
          <Button variant="quiet" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={n === 0}>
            {n > 1 ? `Guardar ${n} fotos` : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <TextField label="Día" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[220px]" />
        {POSES.map((p) => (
          <label key={p} className="flex items-center gap-4">
            <span className="flex h-24 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-tray text-[12px] text-ink-3">
              {files[p] ? <img src={URL.createObjectURL(files[p])} alt="" className="h-full w-full object-cover" /> : "Sin foto"}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">{POSE_LABEL[p]}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="text-[13px] text-ink-2 file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-tray file:px-3 file:py-1.5 file:text-ink"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setFiles((s) => {
                    const next = { ...s };
                    if (f) next[p] = f;
                    else delete next[p];
                    return next;
                  });
                }}
              />
            </span>
          </label>
        ))}
        <FormError message={error} />
      </div>
    </SidePanel>
  );
}
