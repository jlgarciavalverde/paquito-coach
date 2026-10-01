import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ACCENTS, BRAND, type Accent } from "@coach/shared";
import { statusQuery } from "./status";

/**
 * Marca del estudio: el nombre (cabecera, título de la pestaña) y el color de acento salen del estado público, así cada
 * entrenador ve su app con su nombre. Sin estudio todavía (instalación), el nombre provisional de `BRAND`.
 */
let name: string = BRAND.name;
export const brandName = () => name;

type Tokens = { primary: string; hover: string; ink: string; soft: string; softInk: string };
const vars = (t: Tokens) =>
  `--primary:${t.primary};--primary-hover:${t.hover};--primary-ink:${t.ink};--primary-soft:${t.soft};--primary-soft-ink:${t.softInk};`;

/** CSS del acento con los mismos selectores de tema que `styles.css` (claro, oscuro del sistema y oscuro elegido). */
export function accentCss(accent: Accent) {
  if (accent === "azul") return "";
  const a = ACCENTS[accent];
  return `:root{${vars(a.light)}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars(a.dark)}}}:root[data-theme="dark"]{${vars(a.dark)}}`;
}

export function applyBrand(s: { studioName: string | null; accent: Accent }) {
  name = s.studioName ?? BRAND.name;
  let el = document.getElementById("accent") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "accent";
    document.head.appendChild(el);
  }
  el.textContent = accentCss(s.accent);
}

/** En la raíz: aplica la marca al cargar y cada vez que cambia (p. ej. al guardar la página pública). */
export function BrandSync() {
  const s = useQuery(statusQuery).data;
  useEffect(() => {
    if (s) applyBrand(s);
  }, [s]);
  return null;
}
