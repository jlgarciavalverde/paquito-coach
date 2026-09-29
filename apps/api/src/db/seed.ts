import { count, isNull } from "drizzle-orm";
import type { DB } from "./client";
import { exercises } from "./schema";
import seed from "./exercise-seed.json";

type SeedRow = { k: string; n: string; a: string[]; m: string; s: string[]; e: string; t: string; i: string[] };

/**
 * Carga la biblioteca común de ejercicios (≈2.500, nombres en español; origen: catálogo de CheluisFIT,
 * basado en free-exercise-db, wger y otros abiertos). Solo si está vacía; idempotente por `source_key`.
 */
export async function seedExercises(db: DB) {
  const [row] = await db.select({ n: count() }).from(exercises).where(isNull(exercises.studioId));
  if ((row?.n ?? 0) > 0) return 0;
  const rows = (seed as SeedRow[]).map((r) => ({
    sourceKey: r.k,
    name: r.n,
    aliases: r.a,
    muscle: r.m,
    secondary: r.s,
    equipment: r.e,
    instructions: r.i,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(exercises).values(rows.slice(i, i + 500)).onConflictDoNothing();
  }
  return rows.length;
}
