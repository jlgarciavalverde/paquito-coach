import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { App } from "../app";
import { resetDb, testApp } from "../test-utils";

/**
 * Toda clave ajena necesita un índice que empiece por su columna: si no, borrar el padre (un cliente, un usuario) recorre la
 * tabla hija entera, y los filtros por esa columna también. Generado desde el catálogo: una tabla nueva queda cubierta sola.
 */
/** Columnas de autoría (quién creó o revisó algo): solo auditoría, nunca se filtra por ellas y un usuario se borra muy pocas veces. */
const AUTHORSHIP = new Set(["created_by", "reviewed_by", "uploader_id", "sender_id", "actor_id"]);

let app: App;
beforeAll(async () => {
  await resetDb();
  app = await testApp();
});
afterAll(() => app.close());

describe("índices", () => {
  it("cada clave ajena tiene un índice que empieza por su columna", async () => {
    const rows = await app.db.execute<{ fk: string }>(sql`
      select c.conrelid::regclass::text || '.' || a.attname as fk
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
      order by 1`);
    const missing = rows.map((r) => r.fk).filter((fk) => !AUTHORSHIP.has(fk.split(".")[1]!));
    expect(missing).toEqual([]);
  });
});
