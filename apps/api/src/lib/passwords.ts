import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt de node:crypto (sin módulos nativos). N=2^15, r=8, p=1: ~50 ms por intento en el VPS.
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

function derive(pw: string, salt: Buffer, keylen: number, p = PARAMS): Promise<Buffer> {
  return new Promise((ok, ko) => scrypt(pw.normalize("NFKC"), salt, keylen, p, (e, k) => (e ? ko(e) : ok(k))));
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pw, salt, KEYLEN);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Hash de relleno: si el usuario no existe se verifica contra él para tardar lo mismo (no revela qué correos existen).
const DUMMY = `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(KEYLEN).toString("base64")}`;

export async function verifyPassword(pw: string, stored: string | null | undefined): Promise<boolean> {
  const [, n, r, p, saltB64, keyB64] = (stored ?? DUMMY).split("$");
  const expected = Buffer.from(keyB64 ?? "", "base64");
  const actual = await derive(pw, Buffer.from(saltB64 ?? "", "base64"), expected.length || KEYLEN, {
    ...PARAMS,
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return Boolean(stored) && expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Contraseñas demasiado comunes (lista corta; el mínimo de 10 caracteres ya descarta la mayoría). */
const COMMON = new Set([
  "1234567890", "12345678910", "0123456789", "qwertyuiop", "contraseña", "contrasena1", "password12",
  "password123", "passw0rd123", "abcdefghij", "1111111111", "aaaaaaaaaa", "qwerty1234", "asdfghjklñ",
  "iloveyou12", "entrenador", "entrenamiento", "gimnasio12", "futbol1234", "barcelona1", "realmadrid",
]);
export const isCommonPassword = (pw: string) => COMMON.has(pw.toLowerCase());
