/** Error con código HTTP y mensaje para personas (en español). El manejador global lo convierte en `ApiError`. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "unauthorized", "Inicia sesión para continuar");
export const forbidden = () => new HttpError(403, "forbidden", "No tienes permiso para hacer esto");
export const notFound = (what = "Recurso") => new HttpError(404, "not_found", `${what} no encontrado`);
