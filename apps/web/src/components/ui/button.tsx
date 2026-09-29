import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink hover:bg-primary-hover",
  secondary: "bg-tray text-ink hover:bg-tray-2 border border-rule",
  quiet: "text-ink-2 hover:text-ink hover:bg-tray",
  danger: "text-plate-red hover:bg-plate-red-soft",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13.5px] gap-1.5",
  md: "h-10 px-3.5 text-sm gap-2",
  lg: "h-12 px-5 text-[15px] gap-2",
};

/** Clases de botón para usar en un `<Link>` (nunca anidar un botón dentro de un enlace). */
export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) =>
  cn(
    "inline-flex select-none items-center justify-center rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

/** Botón solo con icono: `label` es obligatorio (lector de pantalla y tooltip nativo). */
export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-ink-2 transition-colors hover:bg-tray hover:text-ink", className)}
      {...rest}
    >
      {children}
    </button>
  );
}
