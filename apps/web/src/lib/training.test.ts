import { describe, expect, it } from "vitest";
import type { RoutineBlock } from "@coach/shared";
import { itemLabels } from "./training";

const item = (id: string, group: string | null = null) => ({ id, exerciseId: "x", exerciseName: id, sets: 3, reps: "", load: "", effort: "", tempo: "", restSec: null, notes: "", group });

describe("itemLabels", () => {
  it("numera superseries como A1/A2 y sigue con B1", () => {
    const blocks: RoutineBlock[] = [
      { id: "b1", name: "", items: [item("a", "g1"), item("b", "g1"), item("c")] },
      { id: "b2", name: "", items: [item("d", "g2"), item("e", "g2")] },
    ];
    expect(Object.fromEntries(itemLabels(blocks))).toEqual({ a: "A1", b: "A2", c: "B1", d: "C1", e: "C2" });
  });
});
