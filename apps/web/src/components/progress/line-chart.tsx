import { useEffect, useId, useMemo, useRef, useState } from "react";
import { dayMonth, fromIso } from "../../lib/dates";
import { cn } from "../../lib/cn";

export type Series = {
  key: string;
  label: string;
  /** Token CSS de la serie: var(--chart-1) o var(--chart-2). */
  color: string;
  /** Forma del marcador (segunda codificación además del color). */
  marker: "circle" | "square";
  points: { x: string; y: number | null }[];
};

const fmt = (n: number, unit: string) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`;

/** Ticks «redondos» para el eje Y (3–5 marcas). */
function niceTicks(min: number, max: number) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const step = [1, 2, 2.5, 5, 10, 20, 25, 50, 100].find((s) => span / s <= 4) ?? Math.ceil(span / 4);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v * 10) / 10);
  return out;
}

/**
 * Gráfica de líneas en SVG, sin librería (ver docs/diseno.md y la skill dataviz): un solo eje (misma unidad para todas
 * las series), líneas de 2 px, marcadores ≥ 8 px con anillo del color de fondo, etiqueta directa al final de cada serie,
 * leyenda si hay dos o más, cruz y detalle al pasar el dedo o el ratón, y la tabla con los mismos datos.
 */
export function LineChart({ series, unit, title, height = 220 }: { series: Series[]; unit: string; title: string; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(), [series]);
  const ys = series.flatMap((s) => s.points.map((p) => p.y)).filter((v): v is number => v != null);
  if (xs.length === 0 || ys.length === 0) return null;

  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const pad = { l: 44, r: 64, t: 12, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const t0 = fromIso(xs[0]!).getTime();
  const t1 = fromIso(xs.at(-1)!).getTime();
  const X = (x: string) => pad.l + (t1 === t0 ? iw / 2 : ((fromIso(x).getTime() - t0) / (t1 - t0)) * iw);
  const Y = (y: number) => pad.t + ih - ((y - ticks[0]!) / (ticks.at(-1)! - ticks[0]!)) * ih;
  const xLabels = xs.length <= 4 ? xs : [xs[0]!, xs[Math.floor(xs.length / 2)]!, xs.at(-1)!];

  const onMove = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    xs.forEach((x, i) => {
      if (Math.abs(X(x) - px) < Math.abs(X(xs[best]!) - px)) best = i;
    });
    setHover(best);
  };
  const hx = hover != null ? xs[hover]! : null;

  return (
    <figure className="m-0">
      <figcaption id={titleId} className="sr-only">
        {title}
      </figcaption>
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2" aria-label="Leyenda">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <svg width="22" height="10" aria-hidden="true">
                <line x1="1" y1="5" x2="21" y2="5" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
                {s.marker === "circle" ? <circle cx="11" cy="5" r="4" fill={s.color} /> : <rect x="7" y="1" width="8" height="8" rx="1" fill={s.color} />}
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={box}
        className="relative touch-pan-y select-none"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg width={w} height={height} role="img" aria-labelledby={titleId} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={pad.l - 8} y={Y(t)} textAnchor="end" dominantBaseline="middle" className="font-narrow" fontSize="12" fill="var(--ink-3)">
                {t.toLocaleString("es-ES")}
              </text>
            </g>
          ))}
          {xLabels.map((x) => (
            <text key={x} x={X(x)} y={height - 6} textAnchor="middle" className="font-narrow" fontSize="12" fill="var(--ink-3)">
              {dayMonth(x)}
            </text>
          ))}
          {hx && <line x1={X(hx)} x2={X(hx)} y1={pad.t} y2={pad.t + ih} stroke="var(--ink-3)" strokeWidth="1" />}
          {series.map((s) => {
            const pts = s.points.filter((p): p is { x: string; y: number } => p.y != null);
            const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
            const last = pts.at(-1);
            return (
              <g key={s.key}>
                <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p) =>
                  s.marker === "circle" ? (
                    <circle key={p.x} cx={X(p.x)} cy={Y(p.y)} r={p.x === hx ? 6 : 4} fill={s.color} stroke="var(--paper)" strokeWidth="2" />
                  ) : (
                    <rect key={p.x} x={X(p.x) - (p.x === hx ? 5.5 : 4)} y={Y(p.y) - (p.x === hx ? 5.5 : 4)} width={p.x === hx ? 11 : 8} height={p.x === hx ? 11 : 8} rx="1.5" fill={s.color} stroke="var(--paper)" strokeWidth="2" />
                  ),
                )}
                {last && (
                  <text x={X(last.x) + 10} y={Y(last.y)} dominantBaseline="middle" className="font-narrow" fontSize="13" fill="var(--ink)">
                    {fmt(last.y, unit)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hx && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-[var(--radius-control)] bg-ink px-3 py-2 text-[13px] text-paper shadow-[var(--shadow-float)]"
            style={{ left: Math.min(Math.max(X(hx) - 72, 0), w - 150) }}
            role="status"
          >
            <p className="font-medium">{dayMonth(hx)}</p>
            {series.map((s) => {
              const v = s.points.find((p) => p.x === hx)?.y;
              return v == null ? null : (
                <p key={s.key} className="flex justify-between gap-4">
                  <span className="opacity-80">{s.label}</span>
                  <span className="font-narrow">{fmt(v, unit)}</span>
                </p>
              );
            })}
          </div>
        )}
      </div>
      <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} className="mt-2 text-[13px] font-medium text-primary hover:underline">
        {showTable ? "Ocultar tabla" : "Ver los datos en tabla"}
      </button>
      {showTable && (
        <table className="mt-2 w-full border-collapse text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-rule text-left text-[12.5px] text-ink-3">
              <th className="py-1.5 font-normal">Fecha</th>
              {series.map((s) => (
                <th key={s.key} className="py-1.5 text-right font-normal">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...xs].reverse().map((x) => (
              <tr key={x} className={cn("border-b border-rule")}>
                <td className="py-1.5">{dayMonth(x)}</td>
                {series.map((s) => {
                  const v = s.points.find((p) => p.x === x)?.y;
                  return (
                    <td key={s.key} className="font-narrow py-1.5 text-right">
                      {v == null ? "—" : fmt(v, unit)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
