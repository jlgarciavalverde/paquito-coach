import { cn } from "../../lib/cn";
import { initials } from "../../lib/format";

// Tonos cálidos y apagados; el color sale del nombre para que cada cliente tenga siempre el mismo.
const PALETTE = [
  ["#dde9e4", "#1a4b44"],
  ["#f3e2d5", "#7a3c1c"],
  ["#e6e1f0", "#433763"],
  ["#e9ecd9", "#4a5320"],
  ["#f2e0e3", "#7a2f3d"],
  ["#dde6ee", "#27445e"],
] as const;

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const [bg, fg] = PALETTE[hash(name) % PALETTE.length]!;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium select-none", className)}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}
