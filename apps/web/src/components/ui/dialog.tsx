import { useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { Drawer } from "vaul";
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

type Parts = { Title: ComponentType<{ className?: string; children: ReactNode }>; Description: ComponentType<{ className?: string; children: ReactNode }>; Close: ComponentType<{ className?: string; "aria-label"?: string; children: ReactNode }> };
const RADIX: Parts = { Title: D.Title, Description: D.Description, Close: D.Close };
const VAUL: Parts = { Title: Drawer.Title, Description: Drawer.Description, Close: Drawer.Close };

/** Cabecera de diálogos y hojas. `parts`: las piezas de Radix (escritorio) o de Vaul (hoja inferior en móvil). */
function Head({ title, description, parts = RADIX }: { title: string; description?: ReactNode; parts?: Parts }) {
  const { Title, Description, Close } = parts;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
      <div>
        <Title className="font-wide text-[21px] leading-tight text-balance text-ink">{title}</Title>
        {description ? <Description className="mt-1 text-sm text-ink-2">{description}</Description> : <Description className="sr-only">{title}</Description>}
      </div>
      <Close className="-mr-2 inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-ink-2 hover:bg-tray hover:text-ink" aria-label="Cerrar">
        <X size={18} />
      </Close>
    </div>
  );
}

/** Pantalla estrecha (móvil): las hojas laterales pasan a hoja inferior que se cierra arrastrando hacia abajo. */
const NARROW = "(max-width: 639px)";
function subscribe(cb: () => void) {
  const m = window.matchMedia(NARROW);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
export function useNarrow() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(NARROW).matches, () => false);
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

/**
 * Hoja lateral para crear o editar sin perder la lista de fondo. En móvil, hoja inferior (Vaul): se ve un trozo de la
 * pantalla de detrás arriba y se cierra arrastrando hacia abajo, como las hojas del sistema.
 */
export function SidePanel({ open, onOpenChange, title, description, children, footer, width = "md" }: Props & { width?: "md" | "lg" }) {
  const narrow = useNarrow();
  if (narrow) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false} noBodyStyles>
        <Drawer.Portal>
          <Drawer.Overlay className={overlay} />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] w-full max-w-full flex-col overflow-hidden rounded-t-[var(--radius-zone)] bg-paper shadow-[var(--shadow-float)] outline-none [&>*]:min-w-0">
            <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-rule-strong" />
            <Head title={title} description={description} parts={VAUL} />
            <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-5 focus-visible:outline-offset-[-2px] [&_.grid>*]:min-w-0" tabIndex={0} data-vaul-no-drag>
              {children}
            </div>
            {footer && <div className="flex flex-col-reverse gap-2 border-t border-rule bg-tray px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }
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
          <div className="flex-1 overflow-y-auto px-6 py-5 focus-visible:outline-offset-[-2px] [&_.grid>*]:min-w-0" tabIndex={0}>
            {children}
          </div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-rule bg-tray px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
