import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";

/** `YYYY-MM-DD` en hora local (la fecha que ve la persona). */
export const isoDate = (d: Date) => format(d, "yyyy-MM-dd");
export const today = () => isoDate(new Date());
export const fromIso = (s: string) => parseISO(s);
export const mondayOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });
export const plusDays = (s: string, n: number) => isoDate(addDays(parseISO(s), n));

/** «lun 5» */
export const dayShort = (s: string) => format(parseISO(s), "EEE d", { locale: es });
/** «lunes 5 de octubre» */
export const dayLong = (s: string) => format(parseISO(s), "EEEE d 'de' MMMM", { locale: es });
/** «5 oct» */
export const dayMonth = (s: string) => format(parseISO(s), "d MMM", { locale: es });
/** «Semana del 5 de octubre» */
export const weekLabel = (monday: string) => `Semana del ${format(parseISO(monday), "d 'de' MMMM", { locale: es })}`;

export const WEEKDAYS = [
  { n: 1, short: "L", long: "lunes" },
  { n: 2, short: "M", long: "martes" },
  { n: 3, short: "X", long: "miércoles" },
  { n: 4, short: "J", long: "jueves" },
  { n: 5, short: "V", long: "viernes" },
  { n: 6, short: "S", long: "sábado" },
  { n: 0, short: "D", long: "domingo" },
];

/** Fechas desde `start` durante `weeks` semanas en los días de la semana elegidos (0 = domingo). */
export function planDates(start: string, weekdays: number[], weeks: number) {
  const out: string[] = [];
  const s = parseISO(start);
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(s, i);
    if (weekdays.includes(d.getDay())) out.push(isoDate(d));
  }
  return out;
}

export const fmtRest = (sec: number | null) => (sec == null ? "" : sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`);
