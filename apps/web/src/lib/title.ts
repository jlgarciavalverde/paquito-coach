import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { brandName } from "./brand";
import { statusQuery } from "./status";

/** Título de la pestaña del navegador: «Pantalla · Marca» (la marca sola si no hay título). */
export function useDocumentTitle(title?: string | false | null) {
  // Se vuelve a poner al llegar el nombre del estudio (el estado público puede tardar en cargar).
  const studio = useQuery(statusQuery).data?.studioName;
  useEffect(() => {
    document.title = title ? `${title} – ${brandName()}` : brandName();
  }, [title, studio]);
}
