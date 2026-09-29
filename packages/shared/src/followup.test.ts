import { describe, expect, it } from "vitest";
import { checkinError, nextDueAfter, type CheckinQuestion } from "./followup";

const qs: CheckinQuestion[] = [
  { id: "a", kind: "scale", label: "Energía", required: true },
  { id: "b", kind: "yesno", label: "¿Dolor?", required: true },
  { id: "c", kind: "text", label: "Comentario", required: false },
  { id: "d", kind: "number", label: "Pasos", required: false },
];

describe("check-ins", () => {
  it("valida respuestas", () => {
    expect(checkinError(qs, { a: 7, b: false })).toBeNull();
    expect(checkinError(qs, { b: false })).toBe("Falta: «Energía»");
    expect(checkinError(qs, { a: 11, b: true })).toBe("Respuesta no válida en «Energía»");
    expect(checkinError(qs, { a: 5, b: "sí" })).toBe("Respuesta no válida en «¿Dolor?»");
    expect(checkinError(qs, { a: 5, b: true, c: "", d: 8000 })).toBeNull();
  });
  it("siguiente fecha después de hoy", () => {
    expect(nextDueAfter("2026-09-28", 7, "2026-09-28")).toBe("2026-10-05");
    expect(nextDueAfter("2026-09-01", 7, "2026-09-29")).toBe("2026-10-06");
    expect(nextDueAfter("2026-10-05", 14, "2026-09-29")).toBe("2026-10-19");
  });
});
