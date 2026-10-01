/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/**
 * Tras la build, `dist/sw.js` recibe la versión y la lista de archivos para guardarlos en el móvil. Así el service worker
 * cambia con cada versión (el navegador lo detecta y la app ofrece «Actualizar») y la app abre sin cobertura.
 */
function serviceWorkerPrecache(): Plugin {
  return {
    name: "sw-precache",
    apply: "build",
    closeBundle() {
      const dist = "dist";
      const assets = readdirSync(join(dist, "assets")).filter((f) => /\.(js|css|woff2)$/.test(f)).map((f) => `/assets/${f}`).sort();
      const build = createHash("sha256").update(assets.join("\n")).digest("hex").slice(0, 12);
      const sw = join(dist, "sw.js");
      const src = readFileSync(sw, "utf8").replace('const BUILD = "dev";', `const BUILD = "${build}";`).replace("const PRECACHE = [];", `const PRECACHE = ${JSON.stringify(assets)};`);
      if (!src.includes(build)) throw new Error("sw.js: no se encontró el marcador de BUILD");
      writeFileSync(sw, src);
    },
  };
}

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss(), serviceWorkerPrecache()],
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
