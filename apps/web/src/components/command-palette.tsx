import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Dialog as D } from "radix-ui";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Monogram } from "./ui/layout";
import { useCoachActions } from "./coach-actions";
import { clientsQuery } from "../lib/queries";
import { routinesQuery } from "../lib/training";
import { templatesQuery, useCreatePlan } from "../lib/nutrition";
import { cn } from "../lib/cn";

type Item = { id: string; group: string; label: string; hint?: string; person?: string; keywords?: string; run: () => void };

/** Sin tildes y en minúscula: «lucia» encuentra «Lucía». */
export const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const matches = (item: Item, words: string[]) => {
  const hay = norm(`${item.label} ${item.keywords ?? ""}`);
  return words.every((w) => hay.includes(w));
};

/** Paleta de órdenes (⌘K): ir a cualquier sitio o hacer cualquier cosa escribiendo dos o tres letras. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const act = useCoachActions();
  const createPlan = useCreatePlan();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const clients = useQuery({ ...clientsQuery(), enabled: open });
  const routines = useQuery({ ...routinesQuery, enabled: open });
  const templates = useQuery({ ...templatesQuery, enabled: open });

  useEffect(() => {
    if (open) (setQ(""), setActive(0));
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const close = (fn: () => void) => () => (onOpenChange(false), fn());
    const go = (to: string, search?: Record<string, string>) => close(() => void navigate({ to, search } as never));
    const words = norm(q).split(/\s+/).filter(Boolean);
    const people = (clients.data ?? []).filter((c) => c.status !== "pending" && c.status !== "archived");

    const base: Item[] = [
      { id: "a-client", group: "Crear", label: "Nuevo cliente", keywords: "alta invitar ficha", run: close(act.newClient) },
      { id: "a-appt", group: "Crear", label: "Nueva cita", keywords: "agenda sesion valoracion", run: close(() => act.newAppointment()) },
      { id: "a-routine", group: "Crear", label: "Nueva rutina", keywords: "entreno", run: go("/coach/entrenos/nueva") },
      {
        id: "a-plan",
        group: "Crear",
        label: "Nueva plantilla de comidas",
        keywords: "nutricion dieta plan",
        run: close(() => createPlan.mutate({ clientId: null }, { onSuccess: (p) => void navigate({ to: "/coach/nutricion/$planId", params: { planId: p.id } }) })),
      },
      { id: "a-assign", group: "Crear", label: "Asignar una rutina", keywords: "entreno planificar", run: close(() => act.assign()) },
      { id: "a-program", group: "Crear", label: "Nuevo programa de varias semanas", keywords: "mesociclo bloque periodizacion", run: go("/coach/entrenos/programa/nuevo") },
      { id: "a-apply", group: "Crear", label: "Aplicar un programa", keywords: "mesociclo bloque periodizacion", run: close(() => act.applyProgram()) },
      { id: "n-hoy", group: "Ir a", label: "Hoy", keywords: "inicio", run: go("/coach") },
      { id: "n-cli", group: "Ir a", label: "Clientes", run: go("/coach/clientes") },
      { id: "n-ent", group: "Ir a", label: "Entrenos", keywords: "rutinas", run: go("/coach/entrenos") },
      { id: "n-eje", group: "Ir a", label: "Biblioteca de ejercicios", keywords: "ejercicios", run: go("/coach/entrenos", { vista: "ejercicios" }) },
      { id: "n-nut", group: "Ir a", label: "Nutrición", keywords: "comidas plantillas dieta", run: go("/coach/nutricion") },
      { id: "n-age", group: "Ir a", label: "Agenda", keywords: "calendario citas", run: go("/coach/calendario") },
      { id: "n-msg", group: "Ir a", label: "Mensajes", keywords: "chat", run: go("/coach/chat") },
      { id: "n-seg", group: "Ir a", label: "Seguimiento", keywords: "check-in checkin formularios medidas propias", run: go("/coach/seguimiento") },
      { id: "a-form", group: "Crear", label: "Nuevo formulario de check-in", keywords: "seguimiento cuestionario", run: go("/coach/seguimiento/nuevo") },
      { id: "n-aju", group: "Ir a", label: "Ajustes", keywords: "cuenta contraseña codigo tema avisos", run: go("/coach/ajustes") },
    ];
    const clientItems: Item[] = people.map((c) => ({
      id: `c-${c.id}`,
      group: "Clientes",
      label: c.name,
      person: c.name,
      hint: "Abrir ficha",
      keywords: `${c.email ?? ""} ${c.tags.join(" ")}`,
      run: go(`/coach/clientes/${c.id}`),
    }));
    const routineItems: Item[] = (routines.data ?? []).map((r) => ({
      id: `r-${r.id}`,
      group: "Rutinas",
      label: r.name,
      hint: `${r.exerciseCount} ejercicios`,
      run: go(`/coach/entrenos/${r.id}`),
    }));
    const templateItems: Item[] = (templates.data ?? []).map((p) => ({ id: `p-${p.id}`, group: "Plantillas de comidas", label: p.name, run: go(`/coach/nutricion/${p.id}`) }));

    if (words.length === 0) return [...base.filter((i) => i.group === "Crear"), ...clientItems.slice(0, 6), ...base.filter((i) => i.group === "Ir a")];

    const found = {
      clients: clientItems.filter((i) => matches(i, words)),
      routines: routineItems.filter((i) => matches(i, words)),
      templates: templateItems.filter((i) => matches(i, words)),
      base: base.filter((i) => matches(i, words)),
    };
    // Si la búsqueda apunta a una o dos personas, sus acciones directas van justo debajo.
    const quick: Item[] = found.clients.length > 0 && found.clients.length <= 2
      ? found.clients.flatMap((ci) => {
          const id = ci.id.slice(2);
          const first = ci.label.split(" ")[0];
          return [
            { id: `q-w-${id}`, group: `Con ${ci.label}`, label: `Escribir a ${first}`, run: close(() => act.write(id)) },
            { id: `q-a-${id}`, group: `Con ${ci.label}`, label: `Asignar rutina a ${first}`, run: close(() => act.assign({ clientId: id })) },
            { id: `q-p-${id}`, group: `Con ${ci.label}`, label: `Aplicar programa a ${first}`, run: close(() => act.applyProgram(id)) },
            { id: `q-c-${id}`, group: `Con ${ci.label}`, label: `Nueva cita con ${first}`, run: close(() => act.newAppointment(id)) },
            { id: `q-m-${id}`, group: `Con ${ci.label}`, label: `Anotar medidas de ${first}`, run: close(() => act.measure(id)) },
          ];
        })
      : [];
    const assignRoutine: Item[] = found.routines.length === 1
      ? [{ id: `q-ar`, group: "Rutinas", label: `Asignar «${found.routines[0]!.label}»`, run: close(() => act.assign({ routineId: found.routines[0]!.id.slice(2) })) }]
      : [];
    return [...found.clients, ...quick, ...found.routines.slice(0, 6), ...assignRoutine, ...found.templates.slice(0, 4), ...found.base].slice(0, 40);
  }, [q, clients.data, routines.data, templates.data, act, navigate, onOpenChange, createPlan]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((i) => Math.min(items.length - 1, i + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((i) => Math.max(0, i - 1)));
    else if (e.key === "Enter" && items[active]) (e.preventDefault(), items[active].run());
  };

  let lastGroup = "";
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[rgb(16_24_30/0.32)] data-[state=open]:animate-[fade-in_140ms_ease-out]" />
        <D.Content
          className="fixed inset-0 z-50 flex flex-col bg-paper outline-none sm:inset-auto sm:top-[12vh] sm:left-1/2 sm:max-h-[70vh] sm:w-[min(640px,calc(100%-2rem))] sm:-translate-x-1/2 sm:rounded-[var(--radius-zone)] sm:shadow-[var(--shadow-float)] data-[state=open]:animate-[dialog-in_160ms_var(--ease-out-soft)]"
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">Buscar o hacer algo</D.Title>
          <div className="flex items-center gap-3 border-b border-rule px-4">
            <MagnifyingGlass size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="Busca un cliente, una rutina o escribe lo que quieres hacer"
              className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
              aria-label="Buscar o hacer algo"
            />
            <D.Close className="rounded-[var(--radius-control)] px-2 py-1 text-[13px] text-ink-2 hover:bg-tray sm:hidden">Cerrar</D.Close>
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label="Resultados" className="flex-1 overflow-y-auto p-2" tabIndex={-1}>
            {items.length === 0 && <li className="px-3 py-6 text-sm text-ink-2">Nada con «{q}». Prueba con el nombre o parte de él.</li>}
            {items.map((it, i) => {
              const head = it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              return (
                <li key={it.id} role="presentation">
                  {head && <p className="px-3 pt-3 pb-1 text-[12.5px] font-medium text-ink-3" aria-hidden="true">{head}</p>}
                  <div
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={it.run}
                    className={cn("flex min-h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 py-1.5 text-[14.5px]", i === active ? "bg-primary-soft text-ink" : "text-ink")}
                  >
                    {it.person && <Monogram name={it.person} size={26} />}
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.hint && <span className="shrink-0 text-[13px] text-ink-2">{it.hint}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="hidden border-t border-rule px-4 py-2 text-[12.5px] text-ink-2 sm:block">
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> para moverte, <Kbd>Intro</Kbd> para abrir, <Kbd>Esc</Kbd> para cerrar. <Kbd>?</Kbd> muestra todos los atajos.
          </p>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="font-narrow rounded-[3px] border border-rule-strong bg-tray px-1 text-[12px] text-ink">{children}</kbd>;
}
