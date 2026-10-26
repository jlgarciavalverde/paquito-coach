import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ACCENTS, BRAND, type Accent } from "@coach/shared";
import { meQuery } from "./auth";
import { statusQuery } from "./status";

/**
 * Marca: con sesión, la del estudio de la persona; sin sesión, la del estudio de la dirección (dominio propio o
 * `/e/<slug>`) y, si no hay, la de la plataforma. Sin nada todavía (instalación), el nombre provisional de `BRAND`.
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
  const me = useQuery(meQuery).data;
  useEffect(() => {
    if (me) applyBrand({ studioName: me.studio.name, accent: me.studio.accent });
    else if (s) applyBrand({ studioName: s.studioName ?? s.platformName, accent: s.accent });
  }, [s, me]);
  return null;
}

/** El nombre que se ve en la cabecera ahora mismo (misma regla que `BrandSync`). */
export function useBrandName() {
  const s = useQuery(statusQuery).data;
  const me = useQuery(meQuery).data;
  return me?.studio.name ?? s?.studioName ?? s?.platformName ?? BRAND.name;
}
