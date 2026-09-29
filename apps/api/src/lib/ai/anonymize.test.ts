import { describe, expect, it } from "vitest";
import { ageRange, clientContext, stripPII } from "./anonymize";
import { chunkText, cosine, topK } from "./chunks";

describe("seudonimización", () => {
  it("quita correos, teléfonos, enlaces y el nombre (con tildes)", () => {
    const t = stripPII("Lucía Martínez (lucia@correo.es, 612 345 678) dice que a Lucía le duele. Ver https://x.es/a", ["Lucía Martínez"]);
    expect(t).not.toMatch(/Lucía|Martínez|lucia@|612|https/);
    expect(t).toContain("le duele");
  });
  it("no toca palabras que contienen el nombre", () => {
    expect(stripPII("Ana hace sentadilla con banana", ["Ana"])).toBe("[cliente] hace sentadilla con banana");
  });
  it("edad en tramos", () => {
    expect(ageRange("1990-06-15", new Date("2026-09-29T12:00:00Z"))).toBe("30–39 años");
    expect(ageRange(null)).toBeNull();
  });
  it("contexto sin lesiones salvo que se pida", () => {
    const base = { name: "Pepe Gómez", birthDate: "1980-01-01", goal: "Que Pepe corra 10 km", healthNotes: "Hernia L5-S1", includeHealth: false, loads: [{ exercise: "Sentadilla", e1rm: 100.4 }] };
    const a = clientContext(base);
    expect(a).not.toMatch(/Pepe|Hernia|1980/);
    expect(a).toContain("Sentadilla 100 kg");
    expect(clientContext({ ...base, includeHealth: true })).toContain("Hernia L5-S1");
  });
});

describe("trozos y búsqueda", () => {
  it("trocea respetando el tamaño", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Párrafo ${i} `.repeat(30)).join("\n\n");
    const cs = chunkText(text, 1000, 100);
    expect(cs.length).toBeGreaterThan(5);
    expect(Math.max(...cs.map((c) => c.length))).toBeLessThanOrEqual(1600);
  });
  it("coseno y top-k", () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(topK([1, 0], [{ id: "a", embedding: [0, 1] }, { id: "b", embedding: [1, 0.1] }], 1)[0]!.id).toBe("b");
  });
});
