import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashToken } from "./tokens";

/**
 * 2FA con TOTP (RFC 6238: HMAC-SHA1, 6 cifras, pasos de 30 s), lo que usan Google Authenticator, Authy, 1Password…
 * Sin dependencias: `node:crypto` basta.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("base32 no válido");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));
export const totpStep = (now = Date.now()) => Math.floor(now / 1000 / 30);

export function hotp(secret: Buffer, counter: number, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const off = h[h.length - 1]! & 15;
  const n = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(n % 10 ** digits).padStart(digits, "0");
}

/**
 * Comprueba un código admitiendo ±1 paso (relojes del móvil desajustados) y rechazando pasos ya usados (`lastStep`):
 * un código visto por encima del hombro no sirve dos veces. Devuelve el paso usado o null.
 */
export function verifyTotp(secretB32: string, code: string, lastStep: number | null, now = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const key = base32Decode(secretB32);
  const step = totpStep(now);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(hotp(key, s)), Buffer.from(c))) return s;
  }
  return null;
}

export const otpauthUrl = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** 10 códigos de recuperación («abcd-efgh»): se enseñan una vez y se guarda su hash. */
export function newRecoveryCodes() {
  const alpha = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => {
    const b = randomBytes(8);
    const s = Array.from(b, (x) => alpha[x % alpha.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
export const hashRecovery = (code: string) => hashToken(code.trim().toLowerCase().replace(/\s/g, ""));
