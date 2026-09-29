import { describe, expect, it } from "vitest";
import { fmtRest, planDates, plusDays } from "./dates";

describe("dates", () => {
  it("planifica lunes y jueves durante 2 semanas", () => {
    // 2026-10-05 es lunes
    expect(planDates("2026-10-05", [1, 4], 2)).toEqual(["2026-10-05", "2026-10-08", "2026-10-12", "2026-10-15"]);
  });
  it("cuenta semanas de 7 días desde la fecha de inicio (miércoles → incluye el lunes siguiente)", () => {
    expect(planDates("2026-10-07", [1], 1)).toEqual(["2026-10-12"]);
    expect(planDates("2026-10-07", [1, 3], 2)).toEqual(["2026-10-07", "2026-10-12", "2026-10-14", "2026-10-19"]);
  });
  it("suma días cruzando mes", () => expect(plusDays("2026-10-30", 3)).toBe("2026-11-02"));
  it("formatea descansos", () => {
    expect(fmtRest(90)).toBe("1:30");
    expect(fmtRest(45)).toBe("45 s");
    expect(fmtRest(null)).toBe("");
  });
});
