// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ACCENTS } from "@coach/shared";
import { accentCss, applyBrand, brandName } from "./brand";

describe("marca del estudio", () => {
  it("el nombre del estudio sustituye al provisional y el acento se aplica en claro y oscuro", () => {
    applyBrand({ studioName: "Estudio Paquito", accent: "verde" });
    expect(brandName()).toBe("Estudio Paquito");
    const css = document.getElementById("accent")!.textContent!;
    expect(css).toContain(`--primary:${ACCENTS.verde.light.primary}`);
    expect(css).toContain(`:root[data-theme="dark"]{--primary:${ACCENTS.verde.dark.primary}`);
    expect(css).toContain(':root:not([data-theme="light"])');
  });
  it("el azul es el de siempre (sin estilos añadidos) y aplicar dos veces no duplica", () => {
    applyBrand({ studioName: null, accent: "azul" });
    applyBrand({ studioName: null, accent: "azul" });
    expect(accentCss("azul")).toBe("");
    expect(document.querySelectorAll("#accent")).toHaveLength(1);
    expect(brandName()).toBe("Paquito Coach");
  });
});
