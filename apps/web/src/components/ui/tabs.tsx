import type { ReactNode } from "react";
import { Tabs as T } from "radix-ui";

export function Tabs({ value, onValueChange, items, children }: { value: string; onValueChange: (v: string) => void; items: { value: string; label: ReactNode }[]; children: ReactNode }) {
  return (
    <T.Root value={value} onValueChange={onValueChange}>
      <T.List className="mb-6 flex gap-5 overflow-x-auto border-b border-rule" aria-label="Secciones">
        {items.map((it) => (
          <T.Trigger
            key={it.value}
            value={it.value}
            className="-mb-px h-11 shrink-0 border-b-2 border-transparent text-sm font-medium text-ink-3 transition-colors hover:text-ink data-[state=active]:border-primary data-[state=active]:text-ink"
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
