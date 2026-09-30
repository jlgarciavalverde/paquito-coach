/** Quita el carácter NUL (U+0000) de todas las cadenas de un valor JSON (Postgres lo rechaza en textos). */
export function stripNul<T>(v: T, depth = 0): T {
  if (depth > 20) return v;
  if (typeof v === "string") return (v.includes("\u0000") ? v.replaceAll("\u0000", "") : v) as T;
  if (Array.isArray(v)) return v.map((x) => stripNul(x, depth + 1)) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue; // nunca claves que toquen el prototipo
      out[k.replaceAll("\u0000", "")] = stripNul(x, depth + 1);
    }
    return out as T;
  }
  return v;
}
