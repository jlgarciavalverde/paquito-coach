import { describe, expect, it } from "vitest";
import { atLocal, localDate, minutesOf } from "./agenda";

describe("agenda: horas locales", () => {
  it("ida y vuelta fecha + minutos ↔ instante", () => {
    const iso = atLocal("2026-10-06", 8 * 60 + 30);
    expect(localDate(iso)).toBe("2026-10-06");
    expect(minutesOf(iso)).toBe(510);
  });
  it("cambio de hora de octubre (domingo 25): las 10:00 siguen siendo las 10:00 locales", () => {
    expect(minutesOf(atLocal("2026-10-25", 600))).toBe(600);
  });
});
