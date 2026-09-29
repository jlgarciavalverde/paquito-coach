import type { Workout } from "@coach/shared";
import { PlateMark } from "../ui/layout";
import { today } from "../../lib/dates";

/** Hecho (verde), no hecho/saltado (rojo), programado (azul), hoy sin hacer (amarillo). */
export function WorkoutStatusMark({ w }: { w: Pick<Workout, "status" | "date" | "sessionRpe"> }) {
  const t = today();
  if (w.status === "done") return <PlateMark tone="green">Hecho{w.sessionRpe ? `, RPE ${w.sessionRpe}` : ""}</PlateMark>;
  if (w.status === "skipped") return <PlateMark tone="red">No lo hizo</PlateMark>;
  if (w.date < t) return <PlateMark tone="red">Sin registrar</PlateMark>;
  if (w.date === t) return <PlateMark tone="yellow">Hoy</PlateMark>;
  return <PlateMark tone="blue">Programado</PlateMark>;
}
