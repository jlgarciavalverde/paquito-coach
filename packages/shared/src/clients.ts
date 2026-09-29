import { z } from "zod";
import { DateOnly } from "./common";
import { PersonName } from "./auth";

export const ClientStatus = z.enum(["invited", "pending", "active", "archived", "no_account"]);
export type ClientStatus = z.infer<typeof ClientStatus>;

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  invited: "Invitado",
  pending: "Pendiente de aceptar",
  active: "Activo",
  archived: "Archivado",
  no_account: "Sin cuenta",
};

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const ClientFields = z.object({
  name: PersonName,
  email: z.string().trim().toLowerCase().email("Correo no válido").max(254).nullable().optional(),
  phone: optionalText(30),
  birthDate: DateOnly.nullable().optional(),
  goal: optionalText(500),
  /** Lesiones, patologías, limitaciones. Dato de salud (categoría especial RGPD). */
  healthNotes: optionalText(4000),
  /** Notas privadas del entrenador; el cliente nunca las ve. */
  privateNotes: optionalText(4000),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
});

export const CreateClientInput = ClientFields.extend({
  /** true = se genera una invitación para que active su cuenta; false = ficha sin cuenta. */
  invite: z.boolean().default(true),
});
export type CreateClientInput = z.infer<typeof CreateClientInput>;

export const UpdateClientInput = ClientFields.partial();
export type UpdateClientInput = z.infer<typeof UpdateClientInput>;

export const Client = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  birthDate: z.string().nullable(),
  goal: z.string().nullable(),
  healthNotes: z.string().nullable(),
  privateNotes: z.string().nullable(),
  tags: z.array(z.string()),
  status: ClientStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Client = z.infer<typeof Client>;

export const ClientListQuery = z.object({
  status: ClientStatus.optional(),
  q: z.string().trim().max(80).optional(),
});

export const InviteLink = z.object({
  url: z.string(),
  expiresAt: z.string(),
});
export type InviteLink = z.infer<typeof InviteLink>;

export const JoinCode = z.object({ code: z.string(), url: z.string() });
export type JoinCode = z.infer<typeof JoinCode>;
