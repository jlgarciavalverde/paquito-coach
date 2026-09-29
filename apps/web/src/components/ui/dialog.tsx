import type { ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "@phosphor-icons/react";
import { cn } from "../../lib/cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[rgb(20_24_22/0.38)] backdrop-blur-[2px] data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <D.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col border border-line bg-surface shadow-[var(--shadow-lift)] outline-none",
            "inset-x-0 bottom-0 rounded-t-[var(--radius-xl)] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-xl)]",
            wide ? "sm:max-w-2xl" : "sm:max-w-lg",
            "data-[state=open]:animate-[dialog-in_220ms_var(--ease-out-soft)]",
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div>
              <D.Title className="font-display text-[28px] leading-tight text-ink">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-ink-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="-mr-2 inline-flex size-9 items-center justify-center rounded-[10px] text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Cerrar">
              <X size={18} />
            </D.Close>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
