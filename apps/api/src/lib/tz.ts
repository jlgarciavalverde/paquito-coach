import { madridClock } from "./scheduler";

/** Instante (UTC) de una hora local de Madrid: `date` YYYY-MM-DD y `minutes` desde medianoche. Tiene en cuenta el horario de verano. */
export function madridInstant(date: string, minutes: number): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const wanted = Date.UTC(y, m - 1, d, 0, minutes);
  let t = wanted - 2 * 3600_000; // primera aproximación (verano)
  for (let i = 0; i < 3; i++) {
    const c = madridClock(new Date(t));
    const [cy, cm, cd] = c.date.split("-").map(Number) as [number, number, number];
    const seen = Date.UTC(cy, cm - 1, cd, c.hour, c.minute);
    t += wanted - seen;
  }
  return new Date(t);
}
