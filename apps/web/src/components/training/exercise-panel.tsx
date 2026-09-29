import { useEffect, useState } from "react";
import { EQUIPMENT, EQUIPMENT_LABEL, MUSCLE_LABEL, MUSCLES, type Equipment, type Exercise, type Muscle } from "@coach/shared";
import { SidePanel } from "../ui/dialog";
import { Button } from "../ui/button";
import { Select, TextArea, TextField } from "../ui/field";
import { useToast } from "../ui/toast";
import { FormError } from "../form-error";
import { VideoEmbed } from "./video";
import { useCreateExercise, useUpdateExercise } from "../../lib/training";
import { errorMessage } from "../../lib/api";

/** Ver un ejercicio (común: solo lectura) o crear/editar uno propio. */
export function ExercisePanel({ open, onOpenChange, exercise }: { open: boolean; onOpenChange: (o: boolean) => void; exercise?: Exercise | null }) {
  const toast = useToast();
  const create = useCreateExercise();
  const update = useUpdateExercise(exercise?.id ?? "");
  const readOnly = exercise ? !exercise.own : false;
  const [f, setF] = useState({ name: "", muscle: "quads" as Muscle, equipment: "barbell" as Equipment, videoUrl: "", instructions: "" });
  useEffect(() => {
    if (open)
      setF({
        name: exercise?.name ?? "",
        muscle: exercise?.muscle ?? "quads",
        equipment: exercise?.equipment ?? "barbell",
        videoUrl: exercise?.videoUrl ?? "",
        instructions: exercise?.instructions.join("\n") ?? "",
      });
  }, [open, exercise]);
  const m = exercise ? update : create;
  const save = () => {
    const body = {
      name: f.name,
      muscle: f.muscle,
      equipment: f.equipment,
      videoUrl: f.videoUrl.trim() || null,
      instructions: f.instructions.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    m.mutate(body, { onSuccess: () => (toast(exercise ? "Ejercicio guardado" : "Ejercicio creado"), onOpenChange(false)) });
  };

  if (readOnly && exercise) {
    return (
      <SidePanel open={open} onOpenChange={onOpenChange} title={exercise.name} description={`${MUSCLE_LABEL[exercise.muscle]}, ${EQUIPMENT_LABEL[exercise.equipment].toLowerCase()}. De la biblioteca común.`}>
        {exercise.instructions.length > 0 ? (
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] text-ink-2 marker:text-ink-3">
            {exercise.instructions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="text-ink-2">Este ejercicio no tiene instrucciones escritas.</p>
        )}
        {exercise.aliases.length > 0 && <p className="mt-6 text-[13px] text-ink-3">También se llama: {exercise.aliases.join(", ")}</p>}
        <p className="mt-6 text-[13px] text-ink-3">Si quieres tu propia versión con vídeo, crea un ejercicio propio con este nombre.</p>
      </SidePanel>
    );
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={exercise ? "Editar ejercicio" : "Nuevo ejercicio propio"}
      description="Tus ejercicios aparecen los primeros al buscar y puedes añadirles tu vídeo."
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} loading={m.isPending} disabled={f.name.trim().length < 2}>
            {exercise ? "Guardar ejercicio" : "Crear ejercicio"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <TextField label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        <div className="grid gap-5 sm:grid-cols-2">
          <Select label="Músculo principal" value={f.muscle} onChange={(e) => setF({ ...f, muscle: e.target.value as Muscle })}>
            {MUSCLES.map((x) => (
              <option key={x} value={x}>
                {MUSCLE_LABEL[x]}
              </option>
            ))}
          </Select>
          <Select label="Material" value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value as Equipment })}>
            {EQUIPMENT.map((x) => (
              <option key={x} value={x}>
                {EQUIPMENT_LABEL[x]}
              </option>
            ))}
          </Select>
        </div>
        <TextField label="Vídeo" aside="YouTube o Vimeo" placeholder="https://youtu.be/…" value={f.videoUrl} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} />
        {f.videoUrl && <VideoEmbed url={f.videoUrl} title={f.name} />}
        <TextArea label="Cómo se hace" hint="Un paso por línea." rows={5} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
        <FormError message={m.isError ? errorMessage(m.error) : null} />
      </div>
    </SidePanel>
  );
}
