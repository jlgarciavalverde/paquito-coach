import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const controlClass =
  "w-full rounded-[var(--radius-control)] border border-rule-strong bg-paper px-3 text-[15px] text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow] focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] aria-[invalid=true]:border-plate-red disabled:bg-tray disabled:text-ink-2";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Texto a la derecha de la etiqueta («opcional», unidades…). */
  aside?: ReactNode;
  className?: string;
  /** Oculta la etiqueta visualmente (sigue para lectores de pantalla). */
  hideLabel?: boolean;
}

function Shell({ id, label, hint, error, aside, className, hideLabel, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className={cn("flex items-baseline justify-between gap-2", hideLabel && "sr-only")}>
        <label htmlFor={id} className="text-[13.5px] font-medium text-ink">
          {label}
        </label>
        {aside && <span className="text-[13px] text-ink-3">{aside}</span>}
      </div>
      {children}
      {(error || hint) && (
        <p id={`${id}-desc`} className={cn("text-[13px]", error ? "text-plate-red" : "text-ink-3")} role={error ? "alert" : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export const TextField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, hint, error, aside, className, hideLabel, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} aside={aside} className={className} hideLabel={hideLabel}>
      <input ref={ref} id={fid} aria-invalid={error ? true : undefined} aria-describedby={hint || error ? `${fid}-desc` : undefined} className={cn(controlClass, "h-10")} {...rest} />
    </Shell>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { label, hint, error, aside, className, hideLabel, id, rows = 3, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} aside={aside} className={className} hideLabel={hideLabel}>
      <textarea
        ref={ref}
        id={fid}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${fid}-desc` : undefined}
        className={cn(controlClass, "resize-y py-2 leading-relaxed")}
        {...rest}
      />
    </Shell>
  );
});

export const Select = forwardRef<HTMLSelectElement, FieldProps & SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { label, hint, error, aside, className, hideLabel, id, children, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} aside={aside} className={className} hideLabel={hideLabel}>
      <select ref={ref} id={fid} className={cn(controlClass, "h-10 pr-8")} {...rest}>
        {children}
      </select>
    </Shell>
  );
});

export function Checkbox({ label, description, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--primary)]" {...rest} />
      <label htmlFor={id} className="cursor-pointer text-sm leading-snug text-ink">
        {label}
        {description && <span className="mt-0.5 block text-[13px] text-ink-3">{description}</span>}
      </label>
    </div>
  );
}
