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
export const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida")
  .refine((s) => {
    // Que exista en el calendario (nada de 30 de febrero) y en un rango razonable.
    const d = new Date(`${s}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= "1900-01-01" && s <= "2100-12-31";
  }, "Fecha no válida");

/**
 * Identificador local (filas de rutina, comidas, preguntas…) que además se usa como clave de objeto: solo letras, números,
 * guiones y guion bajo, y nunca nombres especiales de JavaScript (`__proto__`, `constructor`, `prototype`).
 */
export const SafeId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,40}$/, "Identificador no válido")
  .refine((s) => !["__proto__", "constructor", "prototype"].includes(s), "Identificador no válido");
