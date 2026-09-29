import type { ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "@phosphor-icons/react";
import { cn } from "../../lib/cn";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

function Head({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
      <div>
        <D.Title className="font-wide text-[21px] leading-tight text-ink">{title}</D.Title>
        {description ? <D.Description className="mt-1 text-sm text-ink-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
      </div>
      <D.Close className="-mr-2 inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-ink-2 hover:bg-tray hover:text-ink" aria-label="Cerrar">
        <X size={18} />
      </D.Close>
    </div>
  );
}

const overlay = "fixed inset-0 z-40 bg-[rgb(16_24_30/0.32)] data-[state=open]:animate-[fade-in_140ms_ease-out]";

/** Confirmación o contenido breve, centrado. */
export function Dialog({ open, onOpenChange, title, description, children, footer }: Props) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--radius-zone)] bg-paper shadow-[var(--shadow-float)] outline-none data-[state=open]:animate-[dialog-in_180ms_var(--ease-out-soft)]">
          <Head title={title} description={description} />
          <div className="overflow-y-auto px-6 py-5" tabIndex={0}>
            {children}
          </div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-rule px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Hoja lateral para crear o editar sin perder la lista de fondo. En móvil ocupa la pantalla. */
export function SidePanel({ open, onOpenChange, title, description, children, footer, width = "md" }: Props & { width?: "md" | "lg" }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-paper shadow-[var(--shadow-float)] outline-none data-[state=open]:animate-[panel-in_220ms_var(--ease-out-soft)]",
            width === "lg" ? "sm:max-w-2xl" : "sm:max-w-[480px]",
          )}
        >
          <Head title={title} description={description} />
          {/* Enfocable: si dentro solo hay texto, con teclado también tiene que poder desplazarse. */}
          <div className="flex-1 overflow-y-auto px-6 py-5 focus-visible:outline-offset-[-2px]" tabIndex={0}>
            {children}
          </div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-rule bg-tray px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
