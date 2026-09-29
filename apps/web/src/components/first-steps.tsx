import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "@phosphor-icons/react";
import { clientsQuery } from "../lib/queries";
import { routinesQuery } from "../lib/training";
import { templatesQuery } from "../lib/nutrition";
import { cn } from "../lib/cn";

/**
 * Primeros pasos del entrenador (la app recién instalada está vacía). Es una secuencia de verdad:
 * sin rutina no hay nada que asignar. Desaparece sola cuando está todo hecho.
 */
export function FirstSteps() {
  const clients = useQuery(clientsQuery());
  const routines = useQuery(routinesQuery);
  const templates = useQuery(templatesQuery);
  if (!clients.data || !routines.data || !templates.data) return null;
  const steps = [
    { done: routines.data.length > 0, title: "Crea tu primera rutina", text: "Con la biblioteca de más de 2.500 ejercicios o los tuyos con vídeo.", to: "/coach/entrenos/$routineId", params: { routineId: "nueva" } },
    { done: clients.data.length > 0, title: "Da de alta a un cliente", text: "Crea su ficha y mándale la invitación por WhatsApp.", to: "/coach/clientes", search: { nuevo: true } },
    { done: routines.data.some((r) => r.assignedCount > 0), title: "Asígnale un entreno", text: "Desde la rutina o desde su ficha, en los días que entrena.", to: "/coach/entrenos" },
    { done: templates.data.length > 0, title: "Prepara una plantilla de comidas", text: "Para aplicarla a tus clientes y ajustarla a cada uno.", to: "/coach/nutricion" },
  ] as const;
  const pending = steps.filter((s) => !s.done).length;
  if (pending === 0) return null;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section aria-labelledby="first-title" className="mb-10 rounded-[var(--radius-zone)] bg-tray p-5 sm:p-6">
      <h2 id="first-title" className="font-wide text-[19px]">
        Para empezar
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        {pending === steps.length ? "Cuatro pasos y tus clientes ya tendrán su plan en el móvil." : `Te ${pending === 1 ? "queda 1 paso" : `quedan ${pending} pasos`}.`}
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Link
              to={s.to}
              params={"params" in s ? s.params : undefined}
              search={"search" in s ? s.search : undefined}
              className={cn(
                "flex h-full gap-3 rounded-[var(--radius-control)] border p-3 transition-colors",
                s.done ? "border-transparent text-ink-3" : i === next ? "border-primary bg-paper hover:bg-primary-soft" : "border-rule bg-paper hover:border-rule-strong",
              )}
            >
              <span
                className={cn("font-narrow flex size-7 shrink-0 items-center justify-center rounded-[4px] text-[15px]", s.done ? "bg-plate-green text-paper" : i === next ? "bg-primary text-primary-ink" : "bg-tray-2 text-ink-2")}
                aria-hidden="true"
              >
                {s.done ? <Check size={15} weight="bold" /> : i + 1}
              </span>
              <span>
                <span className={cn("block text-sm font-medium", s.done ? "line-through" : "text-ink")}>
                  {s.title}
                  {s.done && <span className="sr-only"> (hecho)</span>}
                </span>
                {!s.done && <span className="mt-0.5 block text-[13px] text-ink-2">{s.text}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
