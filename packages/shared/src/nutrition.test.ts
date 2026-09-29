import { describe, expect, it } from "vitest";
import { MealPlanBody, mealsFor } from "./nutrition";

const meal = (id: string) => ({ id, name: id, time: null, items: [], alternatives: "", notes: "" });

describe("plan de comidas", () => {
  it("modo «igual todos los días» exige un único día 0", () => {
    expect(MealPlanBody.safeParse({ name: "P", targets: {}, mode: "same", days: [{ weekday: 0, meals: [] }] }).success).toBe(true);
    expect(MealPlanBody.safeParse({ name: "P", targets: {}, mode: "same", days: [{ weekday: 1, meals: [] }] }).success).toBe(false);
  });
  it("modo semanal exige los 7 días sin repetir", () => {
    const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, meals: [] }));
    expect(MealPlanBody.safeParse({ name: "P", targets: {}, mode: "weekly", days }).success).toBe(true);
    expect(MealPlanBody.safeParse({ name: "P", targets: {}, mode: "weekly", days: days.slice(0, 6) }).success).toBe(false);
  });
  it("elige las comidas del día (domingo = 7)", () => {
    const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, meals: [meal(`d${weekday}`)] }));
    expect(mealsFor({ mode: "weekly", days }, 0)[0]!.id).toBe("d7");
    expect(mealsFor({ mode: "weekly", days }, 1)[0]!.id).toBe("d1");
    expect(mealsFor({ mode: "same", days: [{ weekday: 0, meals: [meal("x")] }] }, 3)[0]!.id).toBe("x");
  });
});
