import { z } from "zod";

export const Email = z.string().trim().toLowerCase().email("Correo no válido").max(254);
export const Password = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres")
  .max(200, "La contraseña es demasiado larga");
export const PersonName = z.string().trim().min(1, "Escribe un nombre").max(80);

export const Role = z.enum(["coach", "client"]);
export type Role = z.infer<typeof Role>;

export const LoginInput = z.object({ email: Email, password: z.string().min(1).max(200) });
export type LoginInput = z.infer<typeof LoginInput>;

/** Primera cuenta del sistema: crea el estudio y su entrenador. Solo funciona con el código de instalación. */
export const SetupInput = z.object({
  setupCode: z.string().min(1).max(200),
  studioName: z.string().trim().min(1).max(80),
  name: PersonName,
  email: Email,
  password: Password,
});
export type SetupInput = z.infer<typeof SetupInput>;

/**
 * Alta de un cliente. O bien con una invitación personal (`inviteToken`), o bien con el código
 * público del estudio (`joinCode`, queda pendiente de que el entrenador lo acepte).
 */
export const RegisterInput = z
  .object({
    inviteToken: z.string().min(20).max(200).optional(),
    joinCode: z.string().trim().toUpperCase().min(4).max(20).optional(),
    name: PersonName,
    email: Email,
    password: Password,
    /** Consentimiento explícito para tratar datos de salud (RGPD art. 9). */
    healthDataConsent: z.literal(true, { error: "Necesitamos tu consentimiento para guardar datos de salud" }),
  })
  .refine((v) => Boolean(v.inviteToken) !== Boolean(v.joinCode), { message: "Falta la invitación o el código" });
export type RegisterInput = z.infer<typeof RegisterInput>;

export const ResetPasswordInput = z.object({ token: z.string().min(20).max(200), password: Password });

export const ChangePasswordInput = z.object({ current: z.string().min(1).max(200), next: Password });

export const Me = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: Role,
  studio: z.object({ id: z.string(), name: z.string(), coachName: z.string() }),
  /** Solo clientes: estado de su vínculo con el entrenador. */
  clientStatus: z.enum(["invited", "pending", "active", "archived", "no_account"]).nullable(),
  /** Recibir recordatorios push. */
  reminders: z.boolean(),
  /** Recibir correos no esenciales (confirmaciones de reserva, avisos). */
  emailNotifications: z.boolean(),
  /** Tiene la verificación en dos pasos activada. */
  twoFactor: z.boolean(),
});
export type Me = z.infer<typeof Me>;

/**
 * Resultado de entrar (o de restablecer la contraseña): la cuenta, o, si tiene 2FA, un reto que se completa en
 * POST /auth/login/2fa con el código de la app o uno de recuperación. Hasta entonces no hay sesión.
 */
export const TwoFactorChallenge = z.object({ twoFactorRequired: z.literal(true), challenge: z.string() });
export const LoginResult = z.union([Me, TwoFactorChallenge]);
export type LoginResult = z.infer<typeof LoginResult>;
export const isChallenge = (r: LoginResult): r is z.infer<typeof TwoFactorChallenge> => "twoFactorRequired" in r;

export const TwoFactorLoginInput = z.object({ challenge: z.string().min(20).max(200), code: z.string().trim().min(6).max(20) });
export const ForgotPasswordInput = z.object({ email: Email });
/** Al activar la 2FA: secreto (para escribirlo a mano) y la URL `otpauth://` que se enseña como código QR. */
export const TwoFactorSetup = z.object({ secret: z.string(), otpauthUrl: z.string() });
export const TwoFactorEnableInput = z.object({ code: z.string().trim().min(6).max(10) });
export const TwoFactorDisableInput = z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(20) });
export const RecoveryCodes = z.object({ codes: z.array(z.string()) });
export const EmailChangeInput = z.object({ email: Email, password: z.string().min(1).max(200) });

/** `demo`: esta instancia es la demostración pública (datos de ejemplo que se borran cada noche). */
/**
 * Estado público de la instalación. `mail`: el correo está configurado (si no, «He olvidado la contraseña» remite al
 * entrenador). `studioName`/`accent`: la marca (nombre de la app y color). `published`: hay página pública en `/`.
 */
export const SetupStatus = z.object({
  needsSetup: z.boolean(),
  demo: z.boolean(),
  mail: z.boolean(),
  studioName: z.string().nullable(),
  accent: z.enum(["azul", "verde", "petroleo", "morado", "granate"]),
  published: z.boolean(),
});

export const InvitePreview = z.object({
  studioName: z.string(),
  coachName: z.string(),
  clientName: z.string().nullable(),
  email: z.string().nullable(),
});
export type InvitePreview = z.infer<typeof InvitePreview>;

export const SessionInfo = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof SessionInfo>;
