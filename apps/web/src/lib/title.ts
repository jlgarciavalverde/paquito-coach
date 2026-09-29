import { useEffect } from "react";
import { BRAND } from "@coach/shared";

/** Título de la pestaña del navegador: «Pantalla · Marca» (la marca sola si no hay título). */
export function useDocumentTitle(title?: string | false | null) {
  useEffect(() => {
    document.title = title ? `${title} – ${BRAND.name}` : BRAND.name;
  }, [title]);
}
