import { createHash, randomBytes } from "node:crypto";

/** Token aleatorio de 256 bits, apto para URL. Solo se guarda su hash. */
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

// Sin caracteres ambiguos (0/O, 1/I/L) porque el código se dicta o se copia a mano.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newJoinCode(len = 8) {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
