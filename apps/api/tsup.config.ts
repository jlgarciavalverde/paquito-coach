import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  removeNodeProtocol: false,
  // El paquete compartido es TypeScript sin compilar: se incluye en el bundle.
  noExternal: ["@coach/shared"],
});
