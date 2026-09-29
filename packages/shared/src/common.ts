import { z } from "zod";

export const Id = z.string().uuid();

/** Forma única de los errores de la API. `code` es estable (para el código); `message` es para personas, en español. */
export const ApiError = z.object({
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

export const Health = z.object({
  status: z.literal("ok"),
  version: z.string(),
  uptime: z.number(),
  db: z.enum(["ok", "error"]),
});
export type Health = z.infer<typeof Health>;

export const Ok = z.object({ ok: z.literal(true) });

/** Fecha de calendario `YYYY-MM-DD` (sin zona horaria; es el día que ve la persona). */
export const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida");
