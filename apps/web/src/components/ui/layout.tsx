import type { HTMLAttributes, ReactNode } from "react";
import { WarningDiamond } from "@phosphor-icons/react";
import { useDocumentTitle } from "../../lib/title";
import { cn } from "../../lib/cn";

/** Título de pantalla: titular ancho, una frase opcional con datos y las acciones a la derecha. */
export function PageTitle({ title, lead, actions, className, docTitle }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode; className?: string; docTitle?: string }) {
  useDocumentTitle(docTitle ?? (typeof title === "string" ? title : undefined));
  return (
    <header className={cn("flex flex-col gap-4 pb-7 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="font-wide text-[30px] leading-[1.1] text-ink sm:text-[34px]">{title}</h1>
        {lead && <p className="mt-2 max-w-[62ch] text-ink-2">{lead}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function BlockTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="font-wide text-[19px] leading-tight text-ink">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Zona agrupada sobre bandeja. Sin sombra: la jerarquía la da el tono, no la elevación. */
export function Tray({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-zone)] bg-tray", className)} {...rest} />;
}

/** Objeto concreto (una rutina, una comida, una cita): borde fino, radio pequeño. */
export function ObjectCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-control)] border border-rule bg-paper", className)} {...rest} />;
}

export function RowList({ className, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("divide-y divide-rule border-y border-rule", className)} {...rest} />;
}

/** Ficha tipo historia clínica: etiqueta a la izquierda, dato o campo a la derecha. */
export function RecordSheet({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={cn("divide-y divide-rule border-y border-rule", className)}>{children}</dl>;
}

export function RecordRow({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1.5 py-3.5 sm:grid-cols-[200px_1fr] sm:gap-6">
      <dt className="pt-2 text-[13.5px] font-medium text-ink">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
        {hint && <span className="mt-0.5 block text-[13px] font-normal text-ink-3">{hint}</span>}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Vacío: una frase que dice qué falta y la acción para resolverlo. */
export function EmptyNote({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-[var(--radius-zone)] border border-dashed border-rule-strong px-5 py-6", className)}>
      <p className="max-w-[56ch] text-ink-2">{children}</p>
      {action}
    </div>
  );
}

export type PlateTone = "blue" | "red" | "yellow" | "green" | "white" | "grey";
const plateBg: Record<PlateTone, string> = {
  blue: "bg-primary",
  red: "bg-plate-red",
  yellow: "bg-plate-yellow",
  green: "bg-plate-green",
  white: "bg-paper border border-rule-strong",
  grey: "bg-ink-3",
};

/** Marca de disco: rectángulo vertical del color del disco + texto. Es el indicador de estado de toda la app. */
export function PlateMark({ tone, children, className }: { tone: PlateTone; children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[13.5px] whitespace-nowrap text-ink-2", className)}>
      <span className={cn("h-3.5 w-[5px] shrink-0 rounded-[1.5px]", plateBg[tone])} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Aviso de lesión o limitación: se muestra encima de cualquier planificación del cliente. */
export function HealthAlert({ children, title = "Lesiones y limitaciones" }: { children: ReactNode; title?: string }) {
  return (
    <div role="note" className="flex gap-3 border-l-[5px] border-plate-red bg-plate-red-soft px-4 py-3">
      <WarningDiamond size={18} weight="fill" className="mt-0.5 shrink-0 text-plate-red" />
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink">{title}</p>
        <p className="text-sm whitespace-pre-line text-ink-2">{children}</p>
      </div>
    </div>
  );
}

/** Monograma de persona: cuadrado con iniciales sobre bandeja. */
export function Monogram({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const parts = name.trim().split(/\s+/);
  const ini = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-tray-2 font-wide text-ink-2 select-none", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {ini}
    </span>
  );
}
