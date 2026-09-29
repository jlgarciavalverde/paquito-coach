import { createFakeAi } from "./fake";

const it = (exercise: string, sets: number, reps: string, load = "", effort = "RIR 2", supersetWithPrevious = false) => ({ exercise, sets, reps, load, effort, tempo: "", restSeconds: 120, notes: "", supersetWithPrevious });
const leg = { name: "Pierna: fuerza y control", description: "Ejemplo generado sin IA real (demo y pruebas).", blocks: [
  { name: "Activación", items: [it("Puente de glúteo", 2, "12", "", "")] },
  { name: "Principal", items: [it("Sentadilla trasera", 4, "5", "70 kg"), it("Hip thrust", 3, "8", "80 kg")] },
  { name: "Core", items: [it("Plancha", 3, "30 s", "", "")] },
] };

/** Respuestas de ejemplo fijas: para la demo (sin gastar cuota) y los e2e (`AI_FAKE=1`). */
export const createCannedAi = () =>
  createFakeAi((prompt) => {
    if (prompt.includes("Diseña UNA sesión")) return leg;
    if (prompt.includes("Diseña un programa"))
      return { name: "Fuerza base, 4 semanas", description: "Ejemplo de la demo.", progressionKgPerWeek: 2.5, routines: [{ routine: leg, weekdays: [1, 4] }] };
    if (prompt.includes("plan de comidas"))
      return {
        name: "Día tipo, 2.100 kcal",
        notes: "Ejemplo de la demo.",
        kcal: 2100, protein: 150, carbs: 220, fat: 65,
        meals: [
          { name: "Desayuno", time: "08:00", items: [{ food: "Copos de avena", qty: "60 g" }, { food: "Yogur natural", qty: "1" }, { food: "Plátano", qty: "1" }], alternatives: "Tostadas de pan integral con aceite y tomate", notes: "" },
          { name: "Comida", time: "14:00", items: [{ food: "Arroz", qty: "80 g en crudo" }, { food: "Pechuga de pollo", qty: "150 g" }, { food: "Ensalada", qty: "al gusto" }], alternatives: "Pasta o patata en lugar de arroz", notes: "" },
          { name: "Merienda", time: "18:00", items: [{ food: "Queso fresco batido", qty: "250 g" }, { food: "Nueces", qty: "20 g" }], alternatives: "", notes: "" },
          { name: "Cena", time: "21:30", items: [{ food: "Merluza", qty: "180 g" }, { food: "Verduras salteadas", qty: "300 g" }], alternatives: "Tortilla de 2 huevos", notes: "" },
        ],
      };
    return { answer: "Respuesta de ejemplo: en la demo la IA no está conectada.", usedFragments: [1] };
  });
