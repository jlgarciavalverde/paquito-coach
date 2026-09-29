// Enlace de un solo uso (24 h) para poner contraseña nueva a cualquier cuenta, sobre todo la del entrenador,
// que no tiene a nadie por encima que le genere uno. Se ejecuta DENTRO del contenedor:
//
//   docker exec coach node dist/reset-link.js correo@ejemplo.com
//
// No acepta ni imprime contraseñas: solo el enlace, que hay que abrir en el navegador.
import { and, eq, isNull, sql } from "drizzle-orm";
import { configFromEnv } from "../config";
import { createDb } from "../db/client";
import { passwordResets, users } from "../db/schema";
import { hashToken, newToken } from "../lib/tokens";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Uso: node dist/reset-link.js <correo>");
  process.exit(2);
}
const cfg = configFromEnv();
const { db, sql: pg } = createDb(cfg.databaseUrl);
try {
  const [u] = await db.select({ id: users.id }).from(users).where(and(sql`lower(${users.email}) = ${email}`, isNull(users.deletedAt)));
  if (!u) {
    console.error("No hay ninguna cuenta con ese correo.");
    process.exitCode = 1;
  } else {
    const token = newToken();
    await db.delete(passwordResets).where(and(eq(passwordResets.userId, u.id), isNull(passwordResets.usedAt)));
    await db.insert(passwordResets).values({ userId: u.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 3600 * 1000) });
    console.log(`${cfg.publicUrl}/restablecer?token=${token}`);
    console.log("Válido 24 horas y un solo uso. Al usarlo se cierran todas las sesiones de esa cuenta.");
  }
} finally {
  await pg.end();
}
