import type { MealPlanBody, RoutineBody } from "@coach/shared";

/** Borradores que pasan de una pantalla a otra (p. ej. la IA propone una rutina y se abre en el editor). Se leen una vez. */
type Drafts = { routine?: RoutineBody; mealPlan?: MealPlanBody };
const store: Drafts = {};
export const setDraft = <K extends keyof Drafts>(k: K, v: Drafts[K]) => void (store[k] = v);
export function takeDraft<K extends keyof Drafts>(k: K): Drafts[K] {
  const v = store[k];
  delete store[k];
  return v;
}
