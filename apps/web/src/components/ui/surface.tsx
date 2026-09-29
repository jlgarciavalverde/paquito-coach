import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-soft)]", className)} {...rest} />;
}

/** Encabezado de página: sobretítulo pequeño + título en serif + acciones. */
export function PageHeader({ overline, title, description, actions }: { overline?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {overline && <p className="mb-1 text-[12px] font-medium tracking-[0.14em] text-ink-3 uppercase">{overline}</p>}
        <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.01em] text-ink sm:text-[48px]">{title}</h1>
        {description && <p className="mt-2 max-w-prose text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-display text-[24px] leading-tight text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink">{icon}</div>}
      <p className="font-display text-[24px] leading-tight text-ink">{title}</p>
      {children && <p className="mt-1.5 max-w-sm text-sm text-ink-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type Tone = "neutral" | "accent" | "clay" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent-soft-ink",
  clay: "bg-clay-soft text-clay",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Cifra destacada (panel de inicio). */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-medium tracking-[0.12em] text-ink-3 uppercase">{label}</span>
      <span className="font-display text-[44px] leading-none text-ink tabular">{value}</span>
      {hint && <span className="text-[13px] text-ink-2">{hint}</span>}
    </div>
  );
}
