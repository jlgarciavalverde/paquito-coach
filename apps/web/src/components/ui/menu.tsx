import type { ReactNode } from "react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "../../lib/cn";

/** Menú desplegable para acciones poco frecuentes (las frecuentes van a la vista). */
export function Menu({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-[200px] rounded-[var(--radius-control)] border border-rule bg-paper p-1 shadow-[var(--shadow-float)] data-[state=open]:animate-[fade-in_120ms_ease-out]"
        >
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuItem({ children, onSelect, danger, asChild }: { children: ReactNode; onSelect?: () => void; danger?: boolean; asChild?: boolean }) {
  return (
    <M.Item
      asChild={asChild}
      onSelect={onSelect}
      className={cn(
        "flex h-9 cursor-pointer items-center rounded-[4px] px-2.5 text-sm outline-none select-none data-[highlighted]:bg-tray",
        danger ? "text-plate-red" : "text-ink",
      )}
    >
      {children}
    </M.Item>
  );
}
