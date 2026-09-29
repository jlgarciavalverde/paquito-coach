import { describe, expect, it } from "vitest";
import type { RoutineBlock } from "@coach/shared";
import { epley, exerciseSummaries, parseLoadKg, progressFromWorkouts } from "./progress";

describe("parseLoadKg", () => {
  it.each([
    ["80", 80],
    ["82,5", 82.5],
    ["80 kg", 80],
    ["2×12 kg", 24],
    ["2x16", 32],
    ["70% 1RM", null],
    ["RPE 8", null],
    ["peso corporal", null],
    ["", null],
    ["pesado", null],
  ])("«%s» → %s", (t, v) => expect(parseLoadKg(t)).toBe(v));
});

describe("epley", () => {
  it("100 kg × 5 ≈ 116,7", () => expect(epley(100, 5)).toBe(116.7));
  it("no estima con más de 12 repeticiones", () => expect(epley(50, 15)).toBeNull());
});

const blocks = (load = "", reps = "5"): RoutineBlock[] => [
  { id: "b", name: "", items: [{ id: "i1", exerciseId: "sq", exerciseName: "Sentadilla", sets: 3, reps, load, effort: "", tempo: "", restSec: null, notes: "", group: null }] },
];

describe("progressFromWorkouts", () => {
  it("progresión 60 → 70 kg: una sesión por entreno con la mejor serie y su 1RM", () => {
    const ws = [60, 65, 70].map((kg, i) => ({
      id: `w${i}`,
      date: `2026-10-0${i + 1}`,
      blocks: blocks(),
      log: { i1: [{ reps: "5", load: String(kg - 5), rpe: null, done: true }, { reps: "5", load: String(kg), rpe: 8, done: true }, { reps: "5", load: "999", rpe: null, done: false }] },
    }));
    const map = progressFromWorkouts(ws);
    const pts = map.get("sq")!.points;
    expect(pts.map((p) => p.bestLoadKg)).toEqual([60, 65, 70]);
    expect(pts[2]!.e1rm).toBe(81.7);
    expect(pts[0]!.sets).toBe(2); // la serie no hecha no cuenta
    expect(pts[0]!.volumeKg).toBe(55 * 5 + 60 * 5);
    expect(exerciseSummaries(map)[0]).toMatchObject({ exerciseName: "Sentadilla", sessions: 3, bestE1rm: 81.7, lastE1rm: 81.7 });
  });

  it("si el cliente no anota kilos, usa la carga prescrita; sin carga clara, no hay punto", () => {
    const withPrescribed = progressFromWorkouts([{ id: "a", date: "2026-10-01", blocks: blocks("80 kg"), log: { i1: [{ reps: "", load: "", rpe: null, done: true }] } }]);
    expect(withPrescribed.get("sq")!.points[0]).toMatchObject({ bestLoadKg: 80, reps: 5 });
    const none = progressFromWorkouts([{ id: "b", date: "2026-10-01", blocks: blocks("70% 1RM"), log: { i1: [{ reps: "5", load: "", rpe: null, done: true }] } }]);
    expect(none.size).toBe(0);
  });
});
