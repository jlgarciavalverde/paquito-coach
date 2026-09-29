import { describe, expect, it } from "vitest";
import { greeting, initials, firstName } from "./format";

describe("format", () => {
  it("iniciales de nombre y apellido", () => {
    expect(initials("Lucía Martínez Gil")).toBe("LG");
    expect(initials("Pepe")).toBe("P");
    expect(initials("Paquito (demo)")).toBe("PD");
  });
  it("primer nombre", () => expect(firstName("  Paquito  Pérez")).toBe("Paquito"));
  it("saludo según la hora", () => {
    expect(greeting(new Date(2026, 0, 1, 9))).toBe("Buenos días");
    expect(greeting(new Date(2026, 0, 1, 16))).toBe("Buenas tardes");
    expect(greeting(new Date(2026, 0, 1, 23))).toBe("Buenas noches");
  });
});
