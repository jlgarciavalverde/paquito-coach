import { BRAND } from "@coach/shared";
import { cn } from "../lib/cn";

// Discos de competición (IWF), de dentro afuera como se cargan: rojo 25, azul 20, amarillo 15, verde 10.
const PLATES = [
  { color: "var(--plate-red)", h: 1, w: 1 },
  { color: "var(--primary)", h: 1, w: 0.9 },
  { color: "var(--plate-yellow)", h: 0.86, w: 0.8 },
  { color: "var(--plate-green)", h: 0.72, w: 0.7 },
];

/** Marca: extremo de una barra cargada, visto de lado. */
export function BarbellMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 24" className={cn("h-6 w-8", className)} aria-hidden="true">
      <rect x="0" y="10.5" width="32" height="3" rx="1" fill="var(--ink-3)" />
      <rect x="6" y="7" width="2.5" height="10" rx="0.8" fill="var(--ink-2)" />
      {PLATES.map((p, i) => {
        const h = 22 * p.h;
        const w = 4.2 * p.w;
        const x = 9.5 + PLATES.slice(0, i).reduce((s, q) => s + 4.2 * q.w + 0.8, 0);
        return <rect key={i} x={x} y={12 - h / 2} width={w} height={h} rx="1" fill={p.color} />;
      })}
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BarbellMark />
      <span className="font-wide text-[17px] leading-none text-ink">{BRAND.name}</span>
    </span>
  );
}

/**
 * Ilustración de la pantalla de acceso (el elemento memorable de la app): una barra olímpica cargada,
 * a escala real relativa (disco de 450 mm, collarín, manguito), con los discos de competición.
 */
export function LoadedBarbell({ className }: { className?: string }) {
  const plates = [
    { c: "var(--plate-red)", w: 54, d: 450, label: "25" },
    { c: "var(--plate-red)", w: 54, d: 450, label: "25" },
    { c: "var(--primary)", w: 46, d: 450, label: "20" },
    { c: "var(--plate-yellow)", w: 38, d: 450, label: "15" },
    { c: "var(--plate-green)", w: 32, d: 450, label: "10" },
    { c: "var(--paper)", w: 26, d: 325, label: "5" },
  ];
  let x = 210;
  return (
    <svg viewBox="0 0 700 520" className={className} role="img" aria-label="Barra olímpica cargada con discos de competición">
      {/* barra y manguito */}
      <rect x="0" y="252" width="200" height="16" rx="3" fill="var(--ink-3)" />
      <rect x="186" y="236" width="24" height="48" rx="4" fill="var(--ink-2)" />
      <rect x="210" y="248" width="480" height="24" rx="4" fill="var(--rule-strong)" />
      {plates.map((p, i) => {
        const h = p.d;
        const el = (
          <g key={i}>
            <rect x={x} y={260 - h / 2} width={p.w} height={h} rx="7" fill={p.c} stroke={p.c === "var(--paper)" ? "var(--rule-strong)" : "none"} strokeWidth="2" />
            <text x={x + p.w / 2} y={260 + h / 2 - 22} textAnchor="middle" className="font-narrow" fontSize="18" fill={p.c === "var(--plate-yellow)" || p.c === "var(--paper)" ? "var(--ink)" : "var(--primary-ink)"}>
              {p.label}
            </text>
          </g>
        );
        x += p.w + 3;
        return el;
      })}
      {/* collarín */}
      <rect x={x + 2} y="226" width="30" height="68" rx="5" fill="var(--ink-2)" />
    </svg>
  );
}
