/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  test: {
    // Las pruebas de componentes eligen jsdom con `// @vitest-environment jsdom`; las de lógica corren en Node.
    setupFiles: ["src/test/setup.ts"],
  },
  server: {
    // En desarrollo la API va por el mismo origen (como en producción): sin CORS.
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});
