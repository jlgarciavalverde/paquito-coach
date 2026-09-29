import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Workout } from "@coach/shared";
import { studioWorkoutsQuery } from "../../lib/training";
import { dayLong, fromIso, isoDate, mondayOf, plusDays, today } from "../../lib/dates";
import { Skeleton } from "../ui/spinner";
import { cn } from "../../lib/cn";

const LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

const toneOf = (w: Workout, t: string) =>
  w.status === "done" ? "bg-plate-green" : w.status === "skipped" || w.date < t ? "bg-plate-red" : w.date === t ? "bg-plate-yellow" : "bg-primary";
const wordOf = (w: Workout, t: string) =>
  w.status === "done" ? "hecho" : w.status === "skipped" ? "no hecho" : w.date < t ? "sin registrar" : w.date === t ? "hoy" : "programado";

/**
 * La semana de todos los clientes de un vistazo: una fila por cliente, una columna por día,
 * y en cada celda una marca del color del disco por entreno (verde hecho, rojo sin hacer, azul programado).
 */
export function WeekMatrix({ onOpen }: { onOpen: (id: string) => void }) {
  const t = today();
  const monday = isoDate(mondayOf(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => plusDays(monday, i));
  const q = useQuery(studioWorkoutsQuery(monday, days[6]!));
  if (q.isPending) return <Skeleton className="h-40" />;
  const byClient = new Map<string, { name: string; items: Workout[] }>();
  for (const w of q.data ?? []) {
    const e = byClient.get(w.clientId) ?? { name: w.clientName, items: [] };
    e.items.push(w);
    byClient.set(w.clientId, e);
  }
  if (byClient.size === 0) return <p className="text-sm text-ink-2">Esta semana no hay entrenos asignados.</p>;
  const rows = [...byClient.entries()];
  const done = (q.data ?? []).filter((w) => w.status === "done").length;
  const due = (q.data ?? []).filter((w) => w.date <= t).length;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse">
          <thead>
            <tr>
              <th className="py-2 text-left text-[12.5px] font-normal text-ink-3">Cliente</th>
              {days.map((d, i) => (
                <th key={d} className={cn("w-11 py-2 text-center text-[12.5px] font-normal", d === t ? "text-primary" : "text-ink-3")} aria-label={dayLong(d)}>
                  {LETTERS[i]}
                  <span className="font-narrow block text-[14px]">{fromIso(d).getDate()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([clientId, r]) => (
              <tr key={clientId} className="border-t border-rule">
                <th scope="row" className="max-w-0 py-2 pr-3 text-left text-sm font-normal">
                  <Link to="/coach/clientes/$clientId" params={{ clientId }} className="block truncate text-ink hover:text-primary">
                    {r.name}
                  </Link>
                </th>
                {days.map((d) => {
                  const ws = r.items.filter((w) => w.date === d);
                  return (
                    <td key={d} className={cn("py-2 text-center", d === t && "bg-tray")}>
                      <span className="inline-flex gap-1">
                        {ws.map((w) => (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => onOpen(w.id)}
                            title={`${w.title}: ${wordOf(w, t)}`}
                            aria-label={`${r.name}, ${dayLong(d)}, ${w.title}: ${wordOf(w, t)}`}
                            className={cn("h-6 w-[7px] rounded-[1.5px] hover:outline hover:outline-2 hover:outline-offset-1 hover:outline-ink", toneOf(w, t))}
                          />
                        ))}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] text-ink-3">
        {due > 0 ? `${done} de ${due} entrenos hechos hasta hoy.` : "Aún no ha pasado ningún entreno de la semana."} Verde hecho, rojo sin hacer, amarillo hoy, azul programado.
      </p>
    </div>
  );
}
