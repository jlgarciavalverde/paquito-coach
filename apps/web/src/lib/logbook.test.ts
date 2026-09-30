import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bumpValue, createLogSaver, prescribedKg, suggestSet } from "./logbook";

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

describe("createLogSaver", () => {
  type Call = { log: number; keepalive: boolean; resolve: () => void; reject: (e: Error) => void };
  const setup = () => {
    const calls: Call[] = [];
    const states: string[] = [];
    const saver = createLogSaver<number>({
      delay: 100,
      onState: (s) => states.push(s),
      save: (log, keepalive = false) => new Promise<void>((resolve, reject) => void calls.push({ log, keepalive, resolve, reject })),
    });
    return { calls, states, saver };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  it("espera a que dejes de escribir y manda solo lo último", async () => {
    const { calls, saver } = setup();
    saver.schedule(1);
    saver.schedule(2);
    saver.schedule(3);
    vi.advanceTimersByTime(100);
    expect(calls.map((c) => c.log)).toEqual([3]);
  });

  it("una petición cada vez: lo escrito mientras guarda se manda después, en orden", async () => {
    const { calls, saver } = setup();
    saver.schedule(1);
    vi.advanceTimersByTime(100);
    saver.schedule(2);
    vi.advanceTimersByTime(100);
    expect(calls).toHaveLength(1); // no hay dos a la vez
    calls[0]!.resolve();
    vi.useRealTimers();
    await tick();
    await tick();
    expect(calls.map((c) => c.log)).toEqual([1, 2]);
  });

  it("flush manda lo pendiente ya y rechaza si falla (no se termina el entreno con series sin guardar)", async () => {
    const { calls, states, saver } = setup();
    saver.schedule(7);
    const p = saver.flush();
    await Promise.resolve();
    expect(calls.map((c) => c.log)).toEqual([7]);
    calls[0]!.reject(new Error("red"));
    await expect(p).rejects.toThrow();
    expect(states.at(-1)).toBe("error");
    // Lo fallido se reintenta en el siguiente flush
    const p2 = saver.flush();
    await Promise.resolve();
    expect(calls.map((c) => c.log)).toEqual([7, 7]);
    calls[1]!.resolve();
    await expect(p2).resolves.toBeUndefined();
    expect(states.at(-1)).toBe("saved");
  });

  it("al salir de la pantalla lo pendiente se manda con keepalive", () => {
    const { calls, saver } = setup();
    saver.schedule(9);
    saver.leave();
    expect(calls).toEqual([expect.objectContaining({ log: 9, keepalive: true })]);
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(1); // el temporizador ya no manda otra
  });

  it("sin nada pendiente, salir no manda nada", () => {
    const { calls, saver } = setup();
    saver.leave();
    expect(calls).toHaveLength(0);
  });
});
