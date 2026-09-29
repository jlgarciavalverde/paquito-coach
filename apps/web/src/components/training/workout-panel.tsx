import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidePanel } from "../ui/dialog";
import { Button } from "../ui/button";
import { TextArea, TextField } from "../ui/field";
import { Skeleton } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { PrescriptionList } from "./prescription";
import { WorkoutStatusMark } from "./workout-status";
import { useWorkoutEdit, workoutQuery } from "../../lib/training";
import { dayLong } from "../../lib/dates";
import { errorMessage } from "../../lib/api";

/** Detalle de un entreno asignado (entrenador): lo prescrito, lo registrado por el cliente, mover o borrar. */
export function WorkoutPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ ...workoutQuery(id ?? ""), enabled: Boolean(id) });
  const edit = useWorkoutEdit(id ?? "");
  const toast = useToast();
  const w = q.data;
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (w) {
      setDate(w.date);
      setNotes(w.coachNotes);
    }
  }, [w]);
  const changed = w && (date !== w.date || notes !== w.coachNotes);

  return (
    <SidePanel
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={w ? w.title : "Entreno"}
      description={w ? `${w.clientName}, ${dayLong(w.date)}` : undefined}
      footer={
        w && (
          <>
            <Button
              variant="danger"
              className="sm:mr-auto"
              loading={edit.isPending && edit.variables === "delete"}
              onClick={() => edit.mutate("delete", { onSuccess: () => (toast("Entreno quitado"), onClose()), onError: (e) => toast(errorMessage(e), "error") })}
            >
              Quitar entreno
            </Button>
            <Button
              disabled={!changed}
              loading={edit.isPending && edit.variables !== "delete"}
              onClick={() => edit.mutate({ date, coachNotes: notes }, { onSuccess: () => (toast("Entreno actualizado"), onClose()) })}
            >
              Guardar cambios
            </Button>
          </>
        )
      }
    >
      {!w ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <WorkoutStatusMark w={w} />
          </div>
          {(w.clientComment || w.sessionRpe) && (
            <blockquote className="border-l-[5px] border-plate-green bg-plate-green-soft px-4 py-3 text-sm">
              <p className="font-medium text-ink">{w.status === "skipped" ? "No lo hizo" : `Terminado${w.sessionRpe ? `, esfuerzo ${w.sessionRpe} de 10` : ""}`}</p>
              {w.clientComment && <p className="mt-0.5 text-ink-2">«{w.clientComment}»</p>}
            </blockquote>
          )}
          <PrescriptionList blocks={w.blocks} log={w.log} />
          <div className="grid gap-4 border-t border-rule pt-5 sm:grid-cols-[200px_1fr]">
            <TextField label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <TextArea label="Indicaciones para el cliente" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Calienta bien la rodilla antes del bloque A" />
          </div>
        </div>
      )}
    </SidePanel>
  );
}
