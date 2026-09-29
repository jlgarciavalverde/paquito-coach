import { describe, expect, it } from "vitest";
import { applyProgression, progressLoad, weekIndex } from "./progression";

describe("progresión de cargas", () => {
  it("suma kilos por semana y respeta el formato", () => {
    expect(progressLoad("70", 0, { kind: "kg", step: 2.5 })).toBe("70");
    expect(progressLoad("70", 2, { kind: "kg", step: 2.5 })).toBe("75");
    expect(progressLoad("62,5 kg", 1, { kind: "kg", step: 2.5 })).toBe("65 kg");
    expect(progressLoad("20", 1, { kind: "kg", step: 1.25 })).toBe("21");
    expect(progressLoad("20", 1, { kind: "kg", step: 2.5 })).toBe("22,5");
  });
  it("porcentaje compuesto, redondeado a medio kilo", () => {
    expect(progressLoad("100", 1, { kind: "pct", step: 5 })).toBe("105");
    expect(progressLoad("100", 2, { kind: "pct", step: 5 })).toBe("110"); // 110,25 → 110
  });
  it("no toca lo que no son kilos", () => {
    for (const l of ["", "70 % 1RM", "banda roja", "peso corporal", "RPE 8"]) expect(progressLoad(l, 3, { kind: "kg", step: 2.5 })).toBe(l);
  });
  it("semanas desde el inicio", () => {
    expect(weekIndex("2026-09-28", "2026-09-28")).toBe(0);
    expect(weekIndex("2026-09-28", "2026-10-04")).toBe(0);
    expect(weekIndex("2026-09-28", "2026-10-05")).toBe(1);
    expect(weekIndex("2026-09-28", "2026-10-26")).toBe(4);
  });
  it("aplica a todos los bloques", () => {
    const blocks = [{ id: "b", name: "", items: [{ id: "i", exerciseId: "e", exerciseName: "Sentadilla", sets: 3, reps: "5", load: "80", effort: "", tempo: "", restSec: null, notes: "", group: null }] }];
    expect(applyProgression(blocks, 1, { kind: "kg", step: 5 })[0]!.items[0]!.load).toBe("85");
    expect(applyProgression(blocks, 1, null)).toBe(blocks);
  });
});
