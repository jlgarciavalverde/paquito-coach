/**
 * Ruta tal y como la ve el enrutador: sin consulta y con los %XX decodificados. Comparar con `req.url` en bruto permite
 * rodeos como `/%61pi/v1/...` (el enrutador entiende `/api/v1/...`, pero `startsWith("/api/")` no).
 */
export function canonicalPath(url: string): string {
  const path = url.split("?")[0]!.split("#")[0]!;
  try {
    return decodeURIComponent(path);
  } catch {
    return path; // %XX mal formado: el enrutador lo rechazará igualmente
  }
}
