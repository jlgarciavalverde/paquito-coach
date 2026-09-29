import { z } from "zod";

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida");
export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Franja semanal en la que se puede reservar (hora de Madrid). */
export const BookingWindow = z
  .object({ weekday: z.number().int().min(1).max(7), start: HHMM, end: HHMM })
  .refine((w) => toMinutes(w.end) > toMinutes(w.start), { message: "La franja tiene que terminar después de empezar" });
export type BookingWindow = z.infer<typeof BookingWindow>;

export const BookingSettings = z.object({
  enabled: z.boolean(),
  slotMinutes: z.number().int().refine((n) => [30, 45, 60, 75, 90].includes(n), "Duración no válida"),
  /** Personas por hueco (1 = sesión individual; más = grupo reducido). */
  capacity: z.number().int().min(1).max(20),
  /** Con cuánta antelación mínima se puede reservar. */
  noticeHours: z.number().int().min(0).max(72),
  /** Hasta cuántas horas antes puede cancelar el cliente. */
  cancelHours: z.number().int().min(0).max(72),
  location: z.string().trim().max(120).default(""),
  windows: z.array(BookingWindow).max(50),
  /** Si el cliente no tiene bono, pagar la sesión al reservar (tarifa de sesión suelta). */
  payAtBooking: z.boolean().default(false),
  sessionPriceId: z.string().uuid().nullable().default(null),
});
export type BookingSettings = z.infer<typeof BookingSettings>;
export const DEFAULT_BOOKING: BookingSettings = { enabled: false, slotMinutes: 60, capacity: 1, noticeHours: 12, cancelHours: 24, location: "", windows: [], payAtBooking: false, sessionPriceId: null };

export const BookingSlot = z.object({ startsAt: z.string(), endsAt: z.string(), free: z.number() });
export type BookingSlot = z.infer<typeof BookingSlot>;

export const BookingInfo = z.object({
  enabled: z.boolean(),
  /** Si al reservar tendrá que pagar (no tiene bono y el entrenador cobra al reservar), el precio. */
  payAmount: z.number().nullable(),
  cancelHours: z.number(),
  location: z.string(),
  slots: z.array(BookingSlot),
});
export type BookingInfo = z.infer<typeof BookingInfo>;

/** Minutos de inicio de cada hueco de un día (sin solapes, dentro de las franjas de ese día de la semana). */
export function slotStartsFor(weekday: number, windows: BookingWindow[], slotMinutes: number): number[] {
  const out = new Set<number>();
  for (const w of windows.filter((x) => x.weekday === weekday)) {
    for (let m = toMinutes(w.start); m + slotMinutes <= toMinutes(w.end); m += slotMinutes) out.add(m);
  }
  return [...out].sort((a, b) => a - b);
}

/** Resultado de reservar: si hay que pagar, la cita queda retenida y se va a la página de pago. */
export const BookingResult = z.object({ appointmentId: z.string(), checkoutUrl: z.string().nullable() });
export type BookingResult = z.infer<typeof BookingResult>;
