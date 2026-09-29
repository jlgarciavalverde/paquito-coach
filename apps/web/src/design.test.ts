import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardarraíl del sistema de diseño (docs/diseno.md): nada de colores sueltos en los componentes
 * ni clases de la v0.1 que ya no existen. Si falla, usa un token (`bg-tray`, `text-ink-2`, `bg-plate-red`…).
 */
const root = new URL(".", import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(f) ? [p] : [];
  });

// Excepciones documentadas: verde de WhatsApp (marca ajena) y la marca/ilustración, que usan tokens por variables.
const HEX_ALLOWED = ["components/clients/share-invite.tsx"];
const STALE = /\b(font-display|text-accent|bg-accent|bg-surface|text-clay|bg-clay|text-danger|bg-danger|paper-grain|shadow-soft|shadow-lift|radius-lg|radius-xl)\b/;

describe("sistema de diseño", () => {
  const all = files(root).filter((f) => !f.endsWith("routeTree.gen.ts"));
  it("no hay colores hexadecimales en className", () => {
    const bad = all
      .filter((f) => !HEX_ALLOWED.some((a) => f.endsWith(a)))
      .flatMap((f) => (readFileSync(f, "utf8").match(/className=[^>]*?#[0-9a-fA-F]{3,6}\b/g) ?? []).map((m) => `${f.replace(root, "")}: ${m.slice(0, 80)}`));
    expect(bad).toEqual([]);
  });
  it("no quedan clases de la v0.1", () => {
    const bad = all.filter((f) => STALE.test(readFileSync(f, "utf8"))).map((f) => f.replace(root, ""));
    expect(bad).toEqual([]);
  });
  it("sin sobretítulos en mayúsculas (tic de diseño generado)", () => {
    const bad = all.filter((f) => /className="(?:[^"]*\s)?uppercase(?:\s|")/.test(readFileSync(f, "utf8"))).map((f) => f.replace(root, ""));
    expect(bad).toEqual([]);
  });
});
