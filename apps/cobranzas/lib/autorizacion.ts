/**
 * Quién puede hacer qué en Cobranzas.
 *
 * Las listas viven acá, no repetidas en cada Route Handler: si mañana
 * Contabilidad deja de poder borrar, se cambia en un solo lugar y no queda
 * una ruta con la lista vieja.
 *
 * `admin` no aparece en ninguna lista porque `exigirArea()` ya la deja pasar
 * siempre — repetirla acá invitaría a olvidarla en la próxima lista.
 *
 * Criterio (ver docs/autorizacion-cobranzas.md):
 *
 * - LECTURA incluye gerencia: mira la cartera, no la toca.
 * - ESCRITURA la saca: gerencia no registra pagos ni edita letras.
 * - IMPORTACION es más chica todavía — un importador reescribe cientos de
 *   filas de documentos o de cartera de una sola vez; tesorería registra
 *   pagos uno por uno, no hace cargas masivas.
 * - BORRADO es solo admin (decisión explícita del usuario, ago-2026):
 *   contabilidad y tesorería crean y editan, pero no borran. Un pago mal
 *   cargado se corrige con PATCH; borrarlo lo saca del historial.
 */

export const AREAS_LECTURA = ['contabilidad', 'tesoreria', 'gerencia'] as const

export const AREAS_ESCRITURA = ['contabilidad', 'tesoreria'] as const

export const AREAS_IMPORTACION = ['contabilidad'] as const

/** Solo admin. La lista vacía + el pase de admin en exigirArea() lo logran. */
export const AREAS_BORRADO = [] as const
