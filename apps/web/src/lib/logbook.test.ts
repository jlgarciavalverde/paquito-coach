import { describe, expect, it } from "vitest";
import { bumpValue, prescribedKg, suggestSet } from "./logbook";

const it_ = { id: "i1", exerciseId: "e1", exerciseName: "Sentadilla", sets: 3, reps: "8-10", load: "80 kg", effort: "", tempo: "", restSec: null, notes: "", group: null };
const done = (reps: string, load: string) => ({ reps, load, rpe: null, done: true });

describe("sugerencias del cuaderno", () => {
  it("1º lo de la serie anterior de hoy si ya está hecha", () => {
    expect(suggestSet(it_, 1, [done("8", "82,5")], { e1: { date: "2026-09-20", sets: [{ reps: "6", load: "70", rpe: null }] } })).toEqual({ reps: "8", load: "82,5" });
  });
  it("2º la misma serie de la última vez (o su última serie si hoy hay más)", () => {
    const last = { e1: { date: "2026-09-20", sets: [{ reps: "6", load: "70", rpe: null }, { reps: "5", load: "72,5", rpe: null }] } };
    expect(suggestSet(it_, 1, [{ reps: "", load: "", rpe: null, done: false }], last)).toEqual({ reps: "5", load: "72,5" });
    expect(suggestSet(it_, 2, [], last)).toEqual({ reps: "5", load: "72,5" });
  });
  it("3º lo prescrito: primer número de las reps y los kg si la carga es en kg", () => {
    expect(suggestSet(it_, 0, [], {})).toEqual({ reps: "8", load: "80" });
    expect(suggestSet({ ...it_, reps: "30 s", load: "70 % 1RM" }, 0, [], {})).toEqual({ reps: "30", load: "" });
    expect(suggestSet({ ...it_, reps: "al fallo", load: "" }, 0, [], {})).toEqual({ reps: "", load: "" });
  });
  it("una serie anterior hecha pero vacía no cuenta como sugerencia", () => {
    expect(suggestSet(it_, 1, [done("", "")], {})).toEqual({ reps: "8", load: "80" });
  });
  it("carga prescrita", () => {
    expect(prescribedKg(" 62,5 kg ")).toBe("62,5");
    expect(prescribedKg("62.5")).toBe("62.5");
    expect(prescribedKg("2x12 kg")).toBe("");
    expect(prescribedKg("banda roja")).toBe("");
  });
});

describe("botones ±", () => {
  it("suma y resta con coma decimal y sin bajar de 0", () => {
    expect(bumpValue("80", "load", 2.5)).toBe("82,5");
    expect(bumpValue("82,5", "load", -2.5)).toBe("80");
    expect(bumpValue("1", "load", -2.5)).toBe("0");
    expect(bumpValue("8", "reps", -1)).toBe("7");
    expect(bumpValue("0", "reps", -1)).toBe("0");
    expect(bumpValue("", "reps", 1)).toBe("1");
  });
  it("texto que no es un número: no se toca", () => {
    expect(bumpValue("al fallo", "reps", 1)).toBeNull();
    expect(bumpValue("banda", "load", 2.5)).toBeNull();
  });
  it("sin errores de coma flotante", () => {
    let v = "0";
    for (let i = 0; i < 10; i++) v = bumpValue(v, "load", 0.1)!;
    expect(v).toBe("1");
  });
});
