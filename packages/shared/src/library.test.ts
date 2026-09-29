import { describe, expect, it } from "vitest";
import { ResourceInput, weekStreaks } from "./library";

describe("racha de semanas", () => {
  it("cuenta semanas seguidas y no rompe por la semana en curso", () => {
    // hoy: martes 29-09-2026; semanas con entreno: 7, 14 y 21 sep (lunes) y la del 31 ago
    const done = ["2026-09-08", "2026-09-17", "2026-09-26", "2026-09-01"];
    expect(weekStreaks(done, "2026-09-29")).toEqual({ current: 4, best: 4 }); // 31 ago–21 sep seguidas
    expect(weekStreaks([...done, "2026-09-29"], "2026-09-29")).toEqual({ current: 5, best: 5 });
    expect(weekStreaks(["2026-09-01", "2026-09-17", "2026-09-26"], "2026-09-29")).toEqual({ current: 2, best: 2 }); // falta la del 7
    expect(weekStreaks(["2026-09-08"], "2026-09-29")).toEqual({ current: 0, best: 1 });
    expect(weekStreaks([], "2026-09-29")).toEqual({ current: 0, best: 0 });
  });
});
describe("material", () => {
  it("valida enlace/archivo y destinatarios", () => {
    expect(ResourceInput.safeParse({ title: "x", kind: "link", url: "https://youtu.be/abc" }).success).toBe(true);
    expect(ResourceInput.safeParse({ title: "x", kind: "link", url: "javascript:alert(1)" }).success).toBe(false);
    expect(ResourceInput.safeParse({ title: "x", kind: "pdf" }).success).toBe(false);
    expect(ResourceInput.safeParse({ title: "x", kind: "link", url: "https://a.es", forAll: false }).success).toBe(false);
  });
});
