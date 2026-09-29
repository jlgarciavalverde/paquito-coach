// Genera docs/api/openapi.json a partir de los esquemas Zod de las rutas (necesita el Postgres de desarrollo).
import { writeFileSync } from "node:fs";
import { buildApp } from "../app";
import { configFromEnv } from "../config";

const app = await buildApp({ ...configFromEnv(), exposeDocs: true, logLevel: "silent" });
await app.ready();
const out = new URL("../../../../docs/api/openapi.json", import.meta.url);
writeFileSync(out, JSON.stringify(app.swagger(), null, 2) + "\n");
console.log(`OpenAPI escrito en ${out.pathname}`);
await app.close();
