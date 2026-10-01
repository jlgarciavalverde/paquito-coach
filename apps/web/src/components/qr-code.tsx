import { encode } from "uqr";

/** Código QR como SVG propio (cuadrados), sin HTML inyectado. Siempre negro sobre blanco: así lo leen todas las cámaras. */
export function QrCode({ text, size = 200, label }: { text: string; size?: number; label: string }) {
  const { data, size: n } = encode(text, { ecc: "M", border: 2 });
  const cells: string[] = [];
  data.forEach((row, y) => row.forEach((on, x) => on && cells.push(`M${x} ${y}h1v1h-1z`)));
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className="rounded-[4px]">
      <rect width={n} height={n} fill="#fff" />
      <path d={cells.join("")} fill="#000" />
    </svg>
  );
}
