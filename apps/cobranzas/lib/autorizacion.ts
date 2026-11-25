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
 * - BORRADO_PAGOS es la única excepción a lo anterior, y se abrió a
 *   tesorería en nov-2026: ver el comentario de la constante.
 */

export const AREAS_LECTURA = ['contabilidad', 'tesoreria', 'gerencia'] as const

export const AREAS_ESCRITURA = ['contabilidad', 'tesoreria'] as const

export const AREAS_IMPORTACION = ['contabilidad'] as const

/** Solo admin. La lista vacía + el pase de admin en exigirArea() lo logran. */
export const AREAS_BORRADO = [] as const

/**
 * Borrar un PAGO: admin y tesorería (nov-2026).
 *
 * Tesorería es quien carga los pagos todo el día, así que es quien produce
 * los duplicados —el mismo voucher entrado dos veces— y quien los detecta.
 * Tenerlos que pedir por WhatsApp a un admin para que los borre convierte
 * un error de tipeo en un trámite, y mientras tanto la factura figura
 * pagada de más.
 *
 * Es una lista aparte y no `tesoreria` dentro de `AREAS_BORRADO` a
 * propósito: esa lista también cubre borrar una LETRA y anular un canje o
 * un ingreso de factoring, que le devuelven saldo pendiente a varias
 * facturas de una vez. Eso sigue siendo solo de admin.
 *
 * La razón por la que el borrado estaba cerrado —"borrarlo lo saca del
 * historial"— se resolvió antes de abrirlo: cada eliminación deja la fila
 * completa en `public.pagos_eliminados`, con quién la borró y cuándo.
 */
export const AREAS_BORRADO_PAGOS = ['tesoreria'] as const

/**
 * Asignación de cartera y links de vendedor (grupo F).
 *
 * La propuesta original (docs/autorizacion-cobranzas.md) dejaba esto en
 * `gerencia` solamente: es una decisión comercial, no contable. Se amplió a
 * tesorería acá porque hoy no hay ningún registro de quién usa estas dos
 * pantallas (no hay login desde antes de este cambio, y nadie audita
 * accesos), así que no hay forma de confirmar si Milagritos las usa antes de
 * aplicar el guard. Incluirla es el lado seguro: nadie de los 4 perfiles
 * reales pierde nada hoy. Si más adelante se confirma que tesorería no lo
 * necesita, sacarla es un cambio de una línea acá, no un guard nuevo.
 */
export const AREAS_ASIGNACION = ['gerencia', 'tesoreria'] as const

/**
 * Dar de baja una factura por incobrable (y revertirla).
 *
 * Solo admin, igual que el borrado y por la misma razón: sacar S/ 12.000 de
 * la cartera con un clic no puede estar al alcance de cualquiera. El resto
 * de las áreas la ve marcada —con su motivo— pero no puede marcarla.
 */
export const AREAS_INCOBRABLE = [] as const
