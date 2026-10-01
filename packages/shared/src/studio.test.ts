import { describe, expect, it } from "vitest";
import { ACCENTS } from "./studio";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};
// Fondos de la app (tokens --paper y --tray, claro y oscuro)
const BG = { light: ["#f9faf9", "#eef2f0"], dark: ["#10181e", "#172129"] };

describe("acentos del estudio: todos cumplen WCAG AA", () => {
  for (const [name, a] of Object.entries(ACCENTS)) {
    for (const mode of ["light", "dark"] as const) {
      const t = a[mode];
      it(`${name} (${mode === "light" ? "claro" : "oscuro"})`, () => {
        expect(contrast(t.primary, t.ink)).toBeGreaterThanOrEqual(4.5); // botón principal
        expect(contrast(t.hover, t.ink)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.softInk, t.soft)).toBeGreaterThanOrEqual(4.5); // etiquetas suaves
        for (const bg of BG[mode]) expect(contrast(t.primary, bg)).toBeGreaterThanOrEqual(4.5); // enlaces
      });
    }
  }
});
