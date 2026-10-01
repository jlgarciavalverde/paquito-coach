import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hashRecovery, hotp, newRecoveryCodes, newTotpSecret, totpStep, verifyTotp } from "./totp";

// RFC 6238, apéndice B (SHA1, clave «12345678901234567890»), con 6 cifras (las 6 últimas de los vectores de 8).
const KEY = Buffer.from("12345678901234567890");
const VECTORS: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
];

describe("TOTP", () => {
  it("cumple los vectores del RFC 6238", () => {
    for (const [t, code] of VECTORS) expect(hotp(KEY, Math.floor(t / 30), 8)).toBe(code);
  });
  it("base32 de ida y vuelta (lo que lee la app del móvil)", () => {
    expect(base32Encode(KEY)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").equals(KEY)).toBe(true);
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
  });
  it("acepta el paso actual y ±1, y no reutiliza un paso ya usado", () => {
    const secret = base32Encode(KEY);
    const now = 1111111111 * 1000;
    const code = hotp(KEY, totpStep(now));
    const step = verifyTotp(secret, code, null, now);
    expect(step).toBe(totpStep(now));
    expect(verifyTotp(secret, code, step, now)).toBeNull(); // repetido
    expect(verifyTotp(secret, hotp(KEY, totpStep(now) - 1), null, now)).toBe(totpStep(now) - 1);
    expect(verifyTotp(secret, hotp(KEY, totpStep(now) - 3), null, now)).toBeNull(); // demasiado viejo
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", null, now)).toBeNull();
  });
  it("códigos de recuperación distintos y su hash no depende de mayúsculas ni espacios", () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(hashRecovery(` ${codes[0]!.toUpperCase()} `)).toBe(hashRecovery(codes[0]!));
  });
});
