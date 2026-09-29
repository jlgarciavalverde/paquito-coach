import type { ReactNode } from "react";
import { Tabs as T } from "radix-ui";

export function Tabs({ value, onValueChange, items, children }: { value: string; onValueChange: (v: string) => void; items: { value: string; label: ReactNode }[]; children: ReactNode }) {
  return (
    <T.Root value={value} onValueChange={onValueChange}>
      <T.List className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1" aria-label="Secciones">
        {items.map((it) => (
          <T.Trigger
            key={it.value}
            value={it.value}
            className="relative -mb-px h-11 shrink-0 px-3 text-sm font-medium text-ink-3 transition-colors hover:text-ink data-[state=active]:text-ink data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-0 data-[state=active]:after:h-[2px] data-[state=active]:after:rounded-full data-[state=active]:after:bg-accent"
          >
            {it.label}
          </T.Trigger>
        ))}
      </T.List>
      {children}
    </T.Root>
  );
}
export const TabPanel = T.Content;
