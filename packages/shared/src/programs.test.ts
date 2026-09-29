import { describe, expect, it } from "vitest";
import { ProgramBody, isoWeekday, programDates } from "./programs";

const r = "00000000-0000-4000-8000-000000000001";
describe("programas", () => {
  it("día de la semana ISO", () => {
    expect(isoWeekday("2026-09-28")).toBe(1); // lunes
    expect(isoWeekday("2026-10-04")).toBe(7); // domingo
  });
  it("fechas desde un lunes y desde mitad de semana (lo anterior se salta)", () => {
    const slots = [{ week: 1, weekday: 1, routineId: r }, { week: 1, weekday: 4, routineId: r }, { week: 2, weekday: 1, routineId: r }];
    expect(programDates("2026-09-28", slots).map((s) => s.date)).toEqual(["2026-09-28", "2026-10-01", "2026-10-05"]);
    expect(programDates("2026-09-30", slots).map((s) => s.date)).toEqual(["2026-10-01", "2026-10-05"]);
  });
  it("valida semanas y días repetidos", () => {
    expect(ProgramBody.safeParse({ name: "P", weeks: 1, slots: [{ week: 2, weekday: 1, routineId: r }] }).success).toBe(false);
    expect(ProgramBody.safeParse({ name: "P", weeks: 2, slots: [{ week: 1, weekday: 1, routineId: r }, { week: 1, weekday: 1, routineId: r }] }).success).toBe(false);
    expect(ProgramBody.safeParse({ name: "P", weeks: 2, slots: [{ week: 2, weekday: 7, routineId: r }] }).success).toBe(true);
  });
});
