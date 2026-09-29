import type { ReactNode } from "react";
import { Sparkle } from "@phosphor-icons/react";

/** Módulo aún no construido: explica qué va a hacer, para que Paquito vea la hoja de ruta dentro de la app. */
export function ComingSoon({ title, children, phase }: { title: string; children: ReactNode; phase: string }) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface p-8 shadow-[var(--shadow-soft)] sm:p-10">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent-soft-ink">
        <Sparkle size={13} weight="fill" /> En construcción · {phase}
      </span>
      <h2 className="mt-4 font-display text-[32px] leading-tight">{title}</h2>
      <div className="mt-2 max-w-prose text-ink-2 [&_li]:mt-1.5 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
      <svg className="pointer-events-none absolute -right-16 -bottom-16 size-64 text-accent opacity-[0.07]" viewBox="0 0 200 200" aria-hidden="true">
        {[90, 70, 50, 30].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth={r === 50 ? 10 : 2} />
        ))}
      </svg>
    </div>
  );
}
