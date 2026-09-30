/** Oculta tokens en rutas y parámetros de una URL antes de registrarla. */
export function redactUrl(url: string): string {
  return url
    .replace(/(\/auth\/invites\/)[^/?#]+/g, "$1[oculto]")
    .replace(/([?&](?:token|invitacion|codigo|code|key)=)[^&#]*/gi, "$1[oculto]");
}
