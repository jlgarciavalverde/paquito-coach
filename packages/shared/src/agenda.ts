import { z } from "zod";

export const AppointmentKind = z.enum(["session", "assessment", "other"]);
export type AppointmentKind = z.infer<typeof AppointmentKind>;
export const APPOINTMENT_KIND_LABEL: Record<AppointmentKind, string> = {
  session: "Sesión",
  assessment: "Valoración",
  other: "Otro",
};

const IsoDateTime = z.string().datetime({ offset: true, message: "Fecha y hora no válidas" });

export const AppointmentBody = z
  .object({
    clientId: z.string().uuid().nullable(),
    kind: AppointmentKind,
    title: z.string().trim().max(100).default(""),
    startsAt: IsoDateTime,
    endsAt: IsoDateTime,
    location: z.string().trim().max(120).default(""),
    notes: z.string().trim().max(1000).default(""),
  })
  .refine((a) => new Date(a.endsAt) > new Date(a.startsAt), { message: "La cita tiene que terminar después de empezar" })
  .refine((a) => new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime() <= 12 * 3600 * 1000, { message: "Una cita no puede durar más de 12 horas" });
export type AppointmentBody = z.infer<typeof AppointmentBody>;

export const AppointmentPatch = z.object({
  clientId: z.string().uuid().nullable().optional(),
  kind: AppointmentKind.optional(),
  title: z.string().trim().max(100).optional(),
  startsAt: IsoDateTime.optional(),
  endsAt: IsoDateTime.optional(),
  location: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/** Qué pasó con la cita: las «hechas» y «no vino» descuentan del bono del cliente; «cancelada» no. */
export const AttendanceStatus = z.enum(["scheduled", "done", "no_show", "cancelled"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;
export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  scheduled: "Programada",
  done: "Hecha",
  no_show: "No vino",
  cancelled: "Cancelada",
};

export const Appointment = z.object({
  id: z.string(),
  status: AttendanceStatus,
  packId: z.string().nullable(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  kind: AppointmentKind,
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  location: z.string(),
  notes: z.string(),
});
export type Appointment = z.infer<typeof Appointment>;

export const TimeRange = z.object({ from: IsoDateTime, to: IsoDateTime });

/** Título que se muestra: el propio, o el tipo + cliente. */
export const appointmentLabel = (a: Pick<Appointment, "title" | "kind" | "clientName">) =>
  a.title || (a.clientName ? `${APPOINTMENT_KIND_LABEL[a.kind]} con ${a.clientName}` : APPOINTMENT_KIND_LABEL[a.kind]);
