import { describe, expect, it } from "vitest";
import { exerciseMatcher, type LibraryExercise } from "./match";

const lib: LibraryExercise[] = [
  { id: "1", name: "Sentadilla trasera con barra", aliases: ["back squat"], own: false },
  { id: "2", name: "Sentadilla", aliases: [], own: false },
  { id: "3", name: "Press de banca", aliases: ["bench press"], own: false },
  { id: "4", name: "Press de banca con pausa (Paquito)", aliases: [], own: true },
  { id: "5", name: "Peso muerto rumano", aliases: ["RDL"], own: false },
];
const match = exerciseMatcher(lib);

describe("exerciseMatcher", () => {
  it("coincidencia exacta y, entre varias, la más corta", () => {
    expect(match("Sentadilla")?.id).toBe("2");
    expect(match("sentadilla trasera con barra")?.id).toBe("1");
  });
  it("los ejercicios propios del estudio ganan a los comunes", () => {
    expect(match("Press de banca")?.id).toBe("4");
  });
  it("recorta palabras del final hasta dos", () => {
    expect(match("Peso muerto rumano con mancuernas (3 s de bajada)")?.id).toBe("5");
  });
  it("busca también en los alias y sin distinguir mayúsculas", () => {
    expect(match("BENCH PRESS")?.id).toBe("3");
    expect(match("rdl")?.id).toBe("5");
  });
  it("sin coincidencia o sin nombre, null (antes, un nombre vacío casaba con cualquiera)", () => {
    expect(match("Remo en polea baja")).toBeNull();
    expect(match("")).toBeNull();
  });
});
