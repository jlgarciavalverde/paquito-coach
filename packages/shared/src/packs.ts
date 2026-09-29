import { z } from "zod";
import { DateOnly } from "./common";

/** Bono de sesiones presenciales (p. ej. «Bono 10 sesiones»). Sin cobro en la app: se apunta si está pagado. */
export const SessionPackInput = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(80),
  total: z.number().int().min(1, "Al menos 1 sesión").max(200),
  expires: DateOnly.nullable().default(null),
  price: z.number().min(0).max(100000).nullable().default(null),
  paid: z.boolean().default(false),
  notes: z.string().trim().max(500).default(""),
});
export type SessionPackInput = z.infer<typeof SessionPackInput>;

export const SessionPack = SessionPackInput.extend({
  id: z.string(),
  clientId: z.string(),
  used: z.number(),
  remaining: z.number(),
  archived: z.boolean(),
  createdAt: z.string(),
});
export type SessionPack = z.infer<typeof SessionPack>;

/** Un bono cuenta si no está archivado, no ha caducado (en `date`) y le quedan sesiones. */
export const packUsable = (p: Pick<SessionPack, "archived" | "expires" | "remaining">, date: string) => !p.archived && p.remaining > 0 && (!p.expires || p.expires >= date);
