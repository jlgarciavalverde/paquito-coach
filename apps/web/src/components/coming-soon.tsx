import type { ReactNode } from "react";
import { cn } from "../lib/cn";

const PHASES = ["Cuentas y clientes", "Entrenamiento", "Nutrición", "Agenda", "Mensajes", "Entrega"];

/** Módulo aún no construido: qué hará y en qué punto de la hoja de ruta está (las fases sí son una secuencia). */
export function ComingSoon({ title, children, phase }: { title: string; children: ReactNode; phase: number }) {
  return (
    <section className="max-w-[640px]">
      <h2 className="font-wide text-[22px]">{title}</h2>
      <div className="mt-2 text-ink-2 [&_li]:mt-1 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
      <ol className="mt-8 grid grid-cols-6 gap-1" aria-label="Hoja de ruta">
        {PHASES.map((p, i) => {
          const n = i + 1;
          return (
            <li key={p} className="flex flex-col gap-1.5" aria-current={n === phase ? "step" : undefined}>
              <span className={cn("h-1.5 rounded-[1px]", n < phase ? "bg-plate-green" : n === phase ? "bg-primary" : "bg-tray-2")} />
              <span className={cn("hidden text-[12px] sm:block", n === phase ? "font-medium text-ink" : "text-ink-3")}>{p}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[13px] text-ink-3">Llega en la fase {phase} de 6.</p>
    </section>
  );
}
