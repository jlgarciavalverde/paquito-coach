import { z } from "zod";
import { DateOnly } from "./common";

const text = (max: number) => z.string().trim().max(max).default("");

export const FoodItem = z.object({
  id: z.string().min(1).max(40),
  food: z.string().trim().min(1, "Escribe el alimento").max(120),
  qty: text(40), // «80 g», «1 taza», «al gusto»
});
export type FoodItem = z.infer<typeof FoodItem>;

export const Meal = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1, "Ponle nombre a la comida").max(60),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  items: z.array(FoodItem).max(30),
  alternatives: text(1000),
  notes: text(500),
});
export type Meal = z.infer<typeof Meal>;

/** weekday: 1 = lunes … 7 = domingo; 0 = «todos los días» (modo `same`). */
export const MealDay = z.object({ weekday: z.number().int().min(0).max(7), meals: z.array(Meal).max(10) });
export type MealDay = z.infer<typeof MealDay>;

export const Targets = z.object({
  kcal: z.number().int().min(0).max(10000).nullable().default(null),
  protein: z.number().int().min(0).max(1000).nullable().default(null),
  carbs: z.number().int().min(0).max(2000).nullable().default(null),
  fat: z.number().int().min(0).max(1000).nullable().default(null),
});
export type Targets = z.infer<typeof Targets>;

export const MealPlanBody = z
  .object({
    name: z.string().trim().min(1, "Ponle un nombre al plan").max(100),
    notes: text(2000),
    targets: Targets,
    mode: z.enum(["same", "weekly"]),
    days: z.array(MealDay).min(1).max(7),
  })
  .refine((p) => (p.mode === "same" ? p.days.length === 1 && p.days[0]!.weekday === 0 : p.days.length === 7 && new Set(p.days.map((d) => d.weekday)).size === 7 && p.days.every((d) => d.weekday >= 1)), {
    message: "Los días del plan no cuadran con el modo elegido",
  });
export type MealPlanBody = z.infer<typeof MealPlanBody>;

export const MealPlan = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  name: z.string(),
  notes: z.string(),
  targets: Targets,
  mode: z.enum(["same", "weekly"]),
  days: z.array(MealDay),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MealPlan = z.infer<typeof MealPlan>;

export const CreateMealPlanInput = z.object({
  /** Sin cliente = plantilla de la biblioteca. Con cliente = pasa a ser su plan activo. */
  clientId: z.string().uuid().nullable(),
  /** Copiar de una plantilla u otro plan; si no, plan en blanco con `body`. */
  fromPlanId: z.string().uuid().optional(),
  body: MealPlanBody.optional(),
});

export const MealCheck = z.object({ date: DateOnly, mealId: z.string().max(40), done: z.boolean(), note: z.string().nullable() });
export type MealCheck = z.infer<typeof MealCheck>;
export const MealCheckInput = z.object({ date: DateOnly, mealId: z.string().min(1).max(40), done: z.boolean(), note: z.string().trim().max(300).nullable().default(null) });

export const MEAL_PRESETS = ["Desayuno", "Media mañana", "Comida", "Merienda", "Cena", "Antes de entrenar", "Después de entrenar", "Recena"];

/** Las comidas que tocan un día concreto (`weekday` de JS: 0 = domingo). */
export function mealsFor(plan: Pick<MealPlan, "mode" | "days">, jsWeekday: number): Meal[] {
  if (plan.mode === "same") return plan.days[0]?.meals ?? [];
  const wd = jsWeekday === 0 ? 7 : jsWeekday;
  return plan.days.find((d) => d.weekday === wd)?.meals ?? [];
}
