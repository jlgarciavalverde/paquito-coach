import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ACCENTS, type Accent, type StudioProfile } from "@coach/shared";
import { api, errorMessage, RequestError } from "../../lib/api";
import { studioProfileQuery } from "../../lib/public";
import { statusQuery } from "../../lib/status";
import { useSubmit } from "../../lib/use-form";
import { cn } from "../../lib/cn";
import { FormError } from "../form-error";
import { Button, buttonClass } from "../ui/button";
import { Checkbox, TextArea, TextField } from "../ui/field";
import { BlockTitle } from "../ui/layout";
import { QueryState } from "../ui/query-state";
import { RadioGroup } from "../ui/radio-group";
import { Skeleton } from "../ui/spinner";
import { useToast } from "../ui/toast";

/** Ajustes → Tu estudio: nombre y color de la app, página pública y datos para el aviso legal. */
export function PublicPageSettings() {
  const q = useQuery(studioProfileQuery);
  return (
    <section>
      <BlockTitle>Tu estudio y tu página pública</BlockTitle>
      <QueryState q={q} skeleton={<Skeleton className="h-96" />}>
        {(p) => <Form initial={p} />}
      </QueryState>
    </section>
  );
}

function Form({ initial }: { initial: StudioProfile & { hasPhoto: boolean } }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { hasPhoto: initialPhoto, ...rest } = initial;
  const [f, setF] = useState<StudioProfile>(rest);
  const [specialties, setSpecialties] = useState(rest.specialties.join("\n"));
  const [hasPhoto, setHasPhoto] = useState(initialPhoto);
  const [photoKey, setPhotoKey] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof StudioProfile>(k: K, v: StudioProfile[K]) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => setF(rest), [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = (): StudioProfile => ({ ...f, specialties: specialties.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8) });
  const save = useSubmit(
    () => api<StudioProfile>("/studio/profile", { method: "PUT", body: body() }),
    () => {
      toast(f.published ? "Guardado. Tu página está publicada." : "Guardado");
      void qc.invalidateQueries({ queryKey: statusQuery.queryKey });
      void qc.invalidateQueries({ queryKey: ["public"] });
      void qc.invalidateQueries({ queryKey: studioProfileQuery.queryKey });
    },
  );

  const uploadPhoto = async (fl: File) => {
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", fl);
      const res = await fetch("/api/v1/studio/photo", { method: "POST", body: fd, credentials: "same-origin" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new RequestError(res.status, d.error ?? "http", d.message ?? "No se ha podido subir la foto");
      }
      setHasPhoto(true);
      setPhotoKey((k) => k + 1);
      toast("Foto actualizada");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = () =>
    api("/studio/photo", { method: "DELETE" }).then(
      () => setHasPhoto(false),
      (e) => toast(errorMessage(e), "error"),
    );

  return (
    <form onSubmit={save.onSubmit} className="flex flex-col gap-5">
      <TextField label="Nombre del estudio" hint="Es también el nombre de la app: lo ven tus clientes arriba, en los correos y al instalarla." value={f.name} onChange={(e) => set("name", e.target.value)} />

      <fieldset>
        <legend className="mb-2 text-[13.5px] font-medium">Color</legend>
        <RadioGroup aria-label="Color" className="flex flex-wrap gap-2">
          {(Object.keys(ACCENTS) as Accent[]).map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={f.accent === a}
              onClick={() => set("accent", a)}
              className={cn("flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm", f.accent === a ? "border-ink bg-tray font-medium" : "border-rule-strong text-ink-2 hover:bg-tray")}
            >
              <span className="size-4 rounded-full border border-rule" style={{ background: ACCENTS[a].light.primary }} aria-hidden="true" />
              {ACCENTS[a].label}
            </button>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="border-t border-rule pt-5">
        <Checkbox
          label="Publicar mi página en la dirección de la app"
          description="Quien abra la dirección sin cuenta verá tu presentación, tus tarifas marcadas como públicas y un formulario para empezar contigo."
          checked={f.published}
          onChange={(e) => set("published", e.target.checked)}
        />
      </div>
      <TextField label="Frase de presentación" aside="obligatoria para publicar" placeholder="Fuerza y readaptación de lesiones en Murcia" value={f.tagline} onChange={(e) => set("tagline", e.target.value)} />
      <TextArea label="Quién eres" aside="obligatorio para publicar" rows={5} placeholder="Tu formación, cómo trabajas, a quién ayudas…" value={f.bio} onChange={(e) => set("bio", e.target.value)} />
      <TextArea label="Especialidades" hint="Una por línea, hasta 8." rows={4} placeholder={"Readaptación de rodilla\nFuerza para mayores de 50"} value={specialties} onChange={(e) => setSpecialties(e.target.value)} />

      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-24 w-20 items-center justify-center overflow-hidden rounded-[4px] bg-tray text-[12px] text-ink-3">
          {hasPhoto ? <img key={photoKey} src={`/api/v1/studio/photo?v=${photoKey}`} alt="Tu foto" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : "Sin foto"}
        </span>
        <div className="flex flex-col items-start gap-1">
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => (e.target.files?.[0] && void uploadPhoto(e.target.files[0]), (e.target.value = ""))} />
          <Button type="button" variant="secondary" size="sm" loading={photoBusy} onClick={() => file.current?.click()}>
            {hasPhoto ? "Cambiar la foto" : "Subir una foto"}
          </Button>
          {hasPhoto && (
            <Button type="button" variant="quiet" size="sm" onClick={() => void removePhoto()}>
              Quitar
            </Button>
          )}
          <span className="text-[12.5px] text-ink-3">Vertical, tuya entrenando o dando clase.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Dónde" placeholder="Gimnasio X, Murcia centro" value={f.location} onChange={(e) => set("location", e.target.value)} />
        <TextField label="Horario" placeholder="L–V 8:00–21:00" value={f.hours} onChange={(e) => set("hours", e.target.value)} />
        <TextField label="Teléfono" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        <TextField label="Correo de contacto" type="email" value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
        <TextField label="Instagram" placeholder="@usuario" value={f.instagram} onChange={(e) => set("instagram", e.target.value)} />
      </div>

      <div className="border-t border-rule pt-5">
        <p className="mb-3 text-[13.5px] font-medium">Datos para el aviso legal y la privacidad</p>
        <p className="mb-4 text-[13px] text-ink-2">La ley obliga a que la web diga quién está detrás. Salen en el aviso legal y en la página de privacidad.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Nombre o razón social" value={f.legalName} onChange={(e) => set("legalName", e.target.value)} />
          <TextField label="NIF" value={f.taxId} onChange={(e) => set("taxId", e.target.value)} />
          <TextField label="Dirección" className="sm:col-span-2" value={f.legalAddress} onChange={(e) => set("legalAddress", e.target.value)} />
        </div>
      </div>

      <FormError message={save.error} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={save.pending}>
          Guardar
        </Button>
        {initial.published && (
          <a href="/?vista=publica" target="_blank" rel="noreferrer" className={buttonClass("quiet")}>
            Ver mi página
          </a>
        )}
      </div>
    </form>
  );
}
