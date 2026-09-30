import { describe, expect, it } from "vitest";
import { stripNul } from "./sanitize";

describe("stripNul", () => {
  it("quita NUL en cadenas, arrays y objetos anidados", () => {
    expect(stripNul({ a: "x\u0000y", b: ["\u0000", { c: "ok" }], n: 3, t: true, z: null })).toEqual({ a: "xy", b: ["", { c: "ok" }], n: 3, t: true, z: null });
  });
  it("descarta claves peligrosas y no contamina prototipos", () => {
    const out = stripNul(JSON.parse('{"a":1}') as Record<string, unknown>);
    const evil = Object.fromEntries([["__proto__", { hacked: true }], ["ok", 1]]);
    const clean = stripNul(evil) as Record<string, unknown>;
    expect(Object.getPrototypeOf(clean)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).hacked).toBeUndefined();
    expect(clean.ok).toBe(1);
    expect(out).toEqual({ a: 1 });
  });
  it("no se cuelga con anidamientos muy profundos", () => {
    let deep: unknown = "x\u0000";
    for (let i = 0; i < 1000; i++) deep = [deep];
    expect(() => stripNul(deep)).not.toThrow();
  });
});
