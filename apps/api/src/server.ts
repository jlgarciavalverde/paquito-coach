import { join } from "node:path";
import { buildApp } from "./app";
import { configFromEnv } from "./config";

const cfg = configFromEnv();
const app = await buildApp(cfg);

// Recordatorios push del día (no en la demo: allí no hay avisos).
if (!cfg.demoMode) {
  const { startReminders } = await import("./lib/scheduler");
  startReminders(app.db, app.push, (err) => app.log.error(err, "recordatorios"), { onHoldsReleased: app.billing.expireForAppointments, mediaDir: join(cfg.dataDir, "media") });
}

// Demo: se re-siembra al arrancar y cada noche a las 4:00 (hora de Madrid). Nunca en producción (ADR 0009).
if (cfg.demoMode) {
  const { resetDemo, msUntilNextReset } = await import("./demo/seed");
  const reset = () =>
    resetDemo(app.db).then(
      () => app.log.info("demo re-sembrada"),
      (err) => app.log.error(err, "demo: fallo al re-sembrar"),
    );
  await reset();
  const schedule = () => setTimeout(() => void reset().finally(schedule), msUntilNextReset()).unref();
  schedule();
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void app.close().then(() => process.exit(0)));
}

// En desarrollo solo escucha en local; en el contenedor, en todas las interfaces (la red de Docker).
const host = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
await app.listen({ port: Number(process.env.PORT ?? 3000), host });
