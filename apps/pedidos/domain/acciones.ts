/**
 * El desenlace de una Server Action que el usuario tiene que poder leer.
 *
 * Next reemplaza el mensaje de cualquier EXCEPCIÓN de una Server Action por
 * "An error occurred in the Server Components render…" en producción, para
 * no filtrar detalles del servidor. Es lo correcto para un error inesperado
 * y es pésimo para uno previsto: el usuario recibe un aviso que no dice ni
 * qué pasó ni qué hacer.
 *
 * Regla: un mensaje escrito para que lo lea una persona viaja como valor de
 * retorno. Lanzar queda para lo verdaderamente inesperado, que es justo lo
 * que conviene que Next redacte.
 *
 * Ver docs/architecture.md, "Errores de Server Action que tiene que leer el
 * usuario".
 */

export type Fallo = { ok: false; mensaje: string };

export type ResultadoAccion<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | Fallo;

/** Traduce lo que sea que se haya lanzado a un fallo con mensaje legible. */
export function falloDe(err: unknown, porDefecto: string): Fallo {
  return { ok: false, mensaje: err instanceof Error ? err.message : porDefecto };
}
