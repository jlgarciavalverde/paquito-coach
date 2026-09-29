import { defineConfig } from "tsup";

export default defineConfig({
  entry: { server: "src/server.ts", "reset-link": "src/cli/reset-link.ts" },
  format: ["esm"],
  target: "node22",
  clean: true,
  removeNodeProtocol: false,
  // El paquete compartido es TypeScript sin compilar: se incluye en el bundle.
  noExternal: ["@coach/shared"],
});
