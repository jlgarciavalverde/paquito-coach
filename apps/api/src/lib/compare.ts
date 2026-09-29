import { createHash, timingSafeEqual } from "node:crypto";

/** Comparación en tiempo constante de dos cadenas de cualquier longitud. */
export const safeEqual = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
