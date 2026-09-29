import { describe, expect, it } from "vitest";
import { BookingWindow, slotStartsFor } from "./booking";

describe("reservas", () => {
  it("huecos dentro de las franjas del día", () => {
    const w = [{ weekday: 1, start: "09:00", end: "12:30" }, { weekday: 1, start: "17:00", end: "19:00" }, { weekday: 2, start: "09:00", end: "10:00" }];
    expect(slotStartsFor(1, w, 60)).toEqual([540, 600, 660, 1020, 1080]);
    expect(slotStartsFor(2, w, 90)).toEqual([]);
    expect(slotStartsFor(3, w, 60)).toEqual([]);
  });
  it("valida franjas", () => {
    expect(BookingWindow.safeParse({ weekday: 1, start: "10:00", end: "09:00" }).success).toBe(false);
    expect(BookingWindow.safeParse({ weekday: 8, start: "09:00", end: "10:00" }).success).toBe(false);
  });
});
