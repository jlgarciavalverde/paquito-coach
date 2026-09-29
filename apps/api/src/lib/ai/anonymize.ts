/** Quita de un texto libre lo que identifica a una persona: correos, teléfonos, enlaces y los nombres indicados. */
export function stripPII(text: string, names: string[] = []): string {
  let t = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
    .replace(/https?:\/\/\S+/g, "[enlace]")
    .replace(/(?:\+?\d[\s.-]?){9,}/g, "[teléfono]");
  const words = [...new Set(names.flatMap((n) => n.split(/\s+/)).filter((w) => w.length >= 3))];
  // \b no entiende de tildes («Lucía»): límites de letra Unicode.
  for (const w of words) t = t.replace(new RegExp(`(?<!\\p{L})${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\p{L})`, "giu"), "[cliente]");
  return t.trim();
}

/** Edad en tramos de 10 años (no la fecha de nacimiento). */
export function ageRange(birthDate: string | null, today = new Date()): string | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T12:00:00Z`);
  let age = today.getUTCFullYear() - b.getUTCFullYear();
  if (today.getUTCMonth() < b.getUTCMonth() || (today.getUTCMonth() === b.getUTCMonth() && today.getUTCDate() < b.getUTCDate())) age--;
  if (age < 0 || age > 120) return null;
  const lo = Math.floor(age / 10) * 10;
  return `${lo}–${lo + 9} años`;
}

/** Contexto del cliente para la IA, sin identificadores. */
export function clientContext(c: {
  name: string;
  birthDate: string | null;
  goal: string | null;
  healthNotes: string | null;
  includeHealth: boolean;
  loads: { exercise: string; e1rm: number | null }[];
}): string {
  const lines: string[] = [];
  const age = ageRange(c.birthDate);
  if (age) lines.push(`Edad: ${age}.`);
  if (c.goal) lines.push(`Objetivo: ${stripPII(c.goal, [c.name])}`);
  if (c.includeHealth && c.healthNotes) lines.push(`Lesiones y limitaciones: ${stripPII(c.healthNotes, [c.name])}`);
  const loads = c.loads.filter((l) => l.e1rm).slice(0, 6);
  if (loads.length) lines.push(`1RM estimados recientes: ${loads.map((l) => `${l.exercise} ${Math.round(l.e1rm!)} kg`).join("; ")}.`);
  return lines.length ? lines.join("\n") : "Sin datos del cliente.";
}
