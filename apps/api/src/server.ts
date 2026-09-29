import { buildApp } from "./app";
import { configFromEnv } from "./config";

const app = await buildApp(configFromEnv());

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void app.close().then(() => process.exit(0)));
}

// En desarrollo solo escucha en local; en el contenedor, en todas las interfaces (la red de Docker).
const host = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
await app.listen({ port: Number(process.env.PORT ?? 3000), host });
