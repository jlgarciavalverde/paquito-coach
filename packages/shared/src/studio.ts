import { z } from "zod";
import { Email } from "./auth";

/**
 * Colores de acento del estudio (paleta cerrada: todos cumplen WCAG AA). Cada uno da los tokens `--primary*` en claro y
 * oscuro; «azul» es el de siempre. `studio.test.ts` comprueba los contrastes.
 */
type Tokens = { primary: string; hover: string; ink: string; soft: string; softInk: string };
export const ACCENTS = {
  azul: { label: "Azul", light: { primary: "#2447a6", hover: "#1c3a8c", ink: "#ffffff", soft: "#e3e9f8", softInk: "#1c3a8c" }, dark: { primary: "#8aa6f2", hover: "#a5bbf6", ink: "#0d1733", soft: "#1d2a4b", softInk: "#b9caf8" } },
  verde: { label: "Verde", light: { primary: "#1d6b4e", hover: "#16573f", ink: "#ffffff", soft: "#dff0e8", softInk: "#16573f" }, dark: { primary: "#72cfa3", hover: "#93dcb9", ink: "#082318", soft: "#173a2d", softInk: "#a9e5c8" } },
  petroleo: { label: "Petróleo", light: { primary: "#0f5f73", hover: "#0b4c5c", ink: "#ffffff", soft: "#ddeef2", softInk: "#0b4c5c" }, dark: { primary: "#6cc4d8", hover: "#8fd3e3", ink: "#06232b", soft: "#15343c", softInk: "#a8deea" } },
  morado: { label: "Morado", light: { primary: "#5b3aa6", hover: "#4a2e8a", ink: "#ffffff", soft: "#ece6f8", softInk: "#4a2e8a" }, dark: { primary: "#b9a3f2", hover: "#cbbaf6", ink: "#1d1238", soft: "#2c2348", softInk: "#d6c9f8" } },
  granate: { label: "Granate", light: { primary: "#8e2440", hover: "#761d35", ink: "#ffffff", soft: "#f6e3e8", softInk: "#761d35" }, dark: { primary: "#f09ab0", hover: "#f4b3c4", ink: "#2e0a14", soft: "#45202b", softInk: "#f7c4d1" } },
} as const satisfies Record<string, { label: string; light: Tokens; dark: Tokens }>;
export const Accent = z.enum(["azul", "verde", "petroleo", "morado", "granate"]);
export type Accent = z.infer<typeof Accent>;

const line = (max: number) => z.string().trim().max(max).default("");
const optEmail = z.union([Email, z.literal("")]).default("");

/** Lo que el entrenador edita en Ajustes → Página pública (y los datos fiscales del aviso legal). */
export const StudioProfile = z.object({
  /** Nombre del estudio y de la app (cabecera, correos, título, icono instalado). */
  name: z.string().trim().min(1, "Ponle un nombre").max(60),
  accent: Accent.default("azul"),
  published: z.boolean().default(false),
  tagline: line(120),
  bio: line(2000),
  specialties: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  location: line(200),
  hours: line(300),
  phone: line(30),
  contactEmail: optEmail,
  instagram: z.string().trim().max(40).regex(/^@?[\w.]*$/, "Solo el usuario, p. ej. @paquito.entrena").default(""),
  legalName: line(120),
  taxId: line(20),
  legalAddress: line(200),
});
export type StudioProfile = z.infer<typeof StudioProfile>;

/** Página pública del estudio (sin sesión). */
export const PublicStudio = z.object({
  name: z.string(),
  coachName: z.string(),
  accent: Accent,
  tagline: z.string(),
  bio: z.string(),
  specialties: z.array(z.string()),
  location: z.string(),
  hours: z.string(),
  phone: z.string(),
  contactEmail: z.string(),
  instagram: z.string(),
  hasPhoto: z.boolean(),
  prices: z.array(z.object({ name: z.string(), kind: z.enum(["pack", "session", "subscription"]), amount: z.number(), sessions: z.number().nullable(), validDays: z.number().nullable() })),
});
export type PublicStudio = z.infer<typeof PublicStudio>;

/** Datos del responsable para el aviso legal, los términos y la privacidad. */
export const LegalInfo = z.object({ studioName: z.string(), legalName: z.string(), taxId: z.string(), legalAddress: z.string(), contactEmail: z.string() });
export type LegalInfo = z.infer<typeof LegalInfo>;

/** Formulario «Quiero empezar» de la página pública. `website` es un campo trampa (oculto): si llega relleno, es un robot. */
export const LeadInput = z.object({
  name: z.string().trim().min(1, "Escribe tu nombre").max(80),
  email: Email,
  phone: z.string().trim().max(30).default(""),
  message: z.string().trim().max(1000).default(""),
  website: z.string().max(200).default(""),
  consent: z.literal(true, { error: "Necesitamos tu permiso para contestarte" }),
});
export const Lead = z.object({ id: z.string(), name: z.string(), email: z.string(), phone: z.string(), message: z.string(), createdAt: z.string() });
export type Lead = z.infer<typeof Lead>;
