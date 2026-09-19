/**
 * Rechazar y anular: las dos salidas hacia atrás de un registro. Puro: sin
 * Next, sin Supabase.
 *
 * ── SIEMPRE DE A UNO, NUNCA EN LOTE ───────────────────────────────────
 *
 * El 2026-09-19 esto existió unas horas como operación en lote, con un
 * motivo compartido por todas las filas seleccionadas. Sebas lo pidió, lo
 * vio funcionando y lo revirtió el mismo día, y la razón es buena: en un
 * lote el motivo deja de ser un motivo. "La factura está a nombre de otra
 * empresa" es cierto para una fila y mentira para las otras cinco, y ese
 * texto es lo ÚNICO que le llega por correo a quien cargó cada registro.
 * Aprobar en lote no tiene ese problema —el sí no necesita explicación—,
 * así que aprobar sigue siendo en lote y esto no.
 *
 * Si alguien vuelve a proponer el lote acá, la pregunta a contestar es esa:
 * qué motivo recibe la persona cuya fila no encaja con el texto común.
 *
 * ── Cobertura despareja ───────────────────────────────────────────────
 *
 * No todos los tipos tienen las dos salidas, y de los que las tienen,
 * varios NO guardan el motivo porque su función individual nunca lo pidió.
 * Está declarado en CORTE_POR_TIPO, y la pantalla lo dice antes de
 * ejecutar en vez de prometer un rastro que no va a existir.
 */

import {
  ETIQUETA_TIPO_PENDIENTE, ETIQUETA_TIPO_PENDIENTE_PLURAL, type TipoPendiente,
} from './pendientes-aprobar'
import { type ResultadoFila } from './aprobacion-en-lote'

export const ACCIONES_CORTE = ['rechazar', 'anular'] as const
export type AccionCorte = (typeof ACCIONES_CORTE)[number]

export function esAccionCorte(v: string | null | undefined): v is AccionCorte {
  return !!v && (ACCIONES_CORTE as readonly string[]).includes(v)
}

/**
 * Cómo se nombra cada acción en pantalla. Las formas verbales van escritas a
 * mano, en singular y en plural: derivar una de la otra con un `replace`
 * termina en "Se rechaza 1 registro" en vez de "Se rechazó 1 registro".
 */
export const ETIQUETA_ACCION: Record<
  AccionCorte,
  {
    verbo: string
    /** El sustantivo CON su artículo: "el rechazo" y "la anulación" no llevan
     *  el mismo, y armarlo con un `el ${sustantivo}` produce "el anulación". */
    elSustantivo: string
    hechoSingular: string
    hechoPlural: string
  }
> = {
  rechazar: {
    verbo: 'Rechazar', elSustantivo: 'el rechazo',
    hechoSingular: 'rechazó', hechoPlural: 'rechazaron',
  },
  anular: {
    verbo: 'Anular', elSustantivo: 'la anulación',
    hechoSingular: 'anuló', hechoPlural: 'anularon',
  },
}

/**
 * Qué salida hacia atrás tiene cada tipo, y si su función individual guarda
 * el motivo.
 *
 * Esto NO es una preferencia de diseño: es el inventario de lo que las
 * funciones de servicio existentes aceptan hoy. `rechazarOS(id)`,
 * `rechazarPropuesta(id)` y las dos de Caja Chica no reciben motivo, así que
 * el que escriba la persona no se va a guardar en esas filas. Mentirlo en la
 * pantalla sería peor que no ofrecer el lote.
 *
 * Reflejar la realidad acá, y no "arreglarla" agregándole un parámetro a
 * cuatro servicios, es deliberado: cambiar la firma de esas funciones toca
 * sus tablas y sus pantallas individuales, y eso es una pieza aparte.
 */
export type CapacidadCorte = { admite: boolean; guardaMotivo: boolean }

export const CORTE_POR_TIPO: Record<TipoPendiente, Record<AccionCorte, CapacidadCorte>> = {
  pago_directo: {
    rechazar: { admite: true, guardaMotivo: true },
    anular: { admite: true, guardaMotivo: true },
  },
  anticipo: {
    rechazar: { admite: true, guardaMotivo: true },
    anular: { admite: true, guardaMotivo: true },
  },
  reembolso: {
    rechazar: { admite: true, guardaMotivo: true },
    anular: { admite: true, guardaMotivo: true },
  },
  os: {
    rechazar: { admite: true, guardaMotivo: false },
    anular: { admite: true, guardaMotivo: true },
  },
  caja_chica: {
    rechazar: { admite: true, guardaMotivo: false },
    // Una reposición no se anula: se rechaza y los movimientos vuelven al
    // fondo. No hay `anularReposicion` y no se inventa una acá.
    anular: { admite: false, guardaMotivo: false },
  },
  propuesta: {
    rechazar: { admite: true, guardaMotivo: false },
    anular: { admite: false, guardaMotivo: false },
  },
  planilla: {
    rechazar: { admite: false, guardaMotivo: false },
    anular: { admite: true, guardaMotivo: true },
  },
  // Confirmar un impuesto no tiene vuelta atrás hoy: ni rechazo ni anulación.
  impuesto: {
    rechazar: { admite: false, guardaMotivo: false },
    anular: { admite: false, guardaMotivo: false },
  },
}

export function admiteCorte(tipo: TipoPendiente, accion: AccionCorte): boolean {
  return CORTE_POR_TIPO[tipo][accion].admite
}

export function guardaElMotivo(tipo: TipoPendiente, accion: AccionCorte): boolean {
  const c = CORTE_POR_TIPO[tipo][accion]
  return c.admite && c.guardaMotivo
}

export function motivoSinLugar(tipo: TipoPendiente, accion: AccionCorte): string {
  return `Un ${ETIQUETA_TIPO_PENDIENTE[tipo]} no se ${accion} desde acá.`
}

/**
 * El motivo es obligatorio y tiene que decir algo.
 *
 * El mínimo de 5 caracteres no es un capricho: el motivo viaja por correo a
 * quien registró el documento y es lo único que le explica por qué volvió.
 * "ok", "x" y "." no explican nada.
 */
export const MOTIVO_MINIMO = 5

export function validarMotivo(motivo: string, accion: AccionCorte): string | null {
  const limpio = motivo.trim()
  if (limpio.length === 0) return `Escribe el motivo ${accion === 'anular' ? 'de la anulación' : 'del rechazo'}.`
  if (limpio.length < MOTIVO_MINIMO) {
    return 'El motivo es demasiado corto — quien lo reciba tiene que entender qué pasó.'
  }
  return null
}

/**
 * El aviso que ve quien va a cortar un registro cuyo tipo NO guarda el
 * motivo. Se muestra junto al campo, antes de enviar: prometer un rastro
 * que no va a existir es peor que no ofrecer el campo.
 */
export function avisoMotivoSinRastro(tipo: TipoPendiente, accion: AccionCorte): string | null {
  if (!admiteCorte(tipo, accion) || guardaElMotivo(tipo, accion)) return null
  return `Ojo: en ${ETIQUETA_TIPO_PENDIENTE[tipo]} ${ETIQUETA_ACCION[accion].elSustantivo} se registra, pero el motivo que escribas no queda guardado.`
}

/**
 * En qué sección de la bandeja va cada tipo.
 *
 * Son dos decisiones distintas y hasta el 2026-09-19 vivían mezcladas en
 * una sola tabla:
 *
 *  - `documento`  Revisás UN documento y decidís si está bien. Es el paso B
 *                 del flujo. Quién lo ve depende de la fila, no de un rol
 *                 fijo: Contabilidad ve lo suyo, el jefe de área lo suyo.
 *  - `lote`       Autorizás que salga la plata de un lote entero. Es el
 *                 paso D. Candado duro: Mariela (contabilidad+admin) y
 *                 admin, nadie más.
 *
 * Mezclarlas hacía que una propuesta de S/ 41,900 se leyera igual que un
 * reembolso de taxi de S/ 20, y que el total en ámbar —que existe para no
 * aprobar a ciegas— apareciera y desapareciera según lo que estuviera
 * tildado.
 */
export const SECCIONES_BANDEJA = ['documento', 'lote'] as const
export type SeccionBandeja = (typeof SECCIONES_BANDEJA)[number]

export const TITULO_SECCION: Record<SeccionBandeja, string> = {
  documento: 'Documentos por aprobar',
  lote: 'Lotes de pago por aprobar',
}

export const BAJADA_SECCION: Record<SeccionBandeja, string> = {
  documento: 'Revisas un documento y decides si está bien.',
  lote: 'Autorizas que salga la plata de un lote entero.',
}

const SECCION_POR_TIPO: Record<TipoPendiente, SeccionBandeja> = {
  pago_directo: 'documento',
  anticipo: 'documento',
  reembolso: 'documento',
  os: 'documento',
  caja_chica: 'documento',
  planilla: 'documento',
  impuesto: 'documento',
  propuesta: 'lote',
}

export function seccionDe(tipo: TipoPendiente): SeccionBandeja {
  return SECCION_POR_TIPO[tipo]
}

export function filasDeSeccion<T extends { tipo: TipoPendiente }>(
  filas: readonly T[],
  seccion: SeccionBandeja
): T[] {
  return filas.filter((f) => seccionDe(f.tipo) === seccion)
}

/**
 * El texto de ayuda que separa las dos salidas. Va DENTRO del panel de
 * confirmación, no en un tooltip: es justo donde alguien duda.
 */
export const AYUDA_RECHAZAR =
  'RECHAZAR es decir "esto está bien cargado, pero no corresponde". Si lo que pasa es que te equivocaste al cargarlo, lo que buscas es Anular.'

export const AYUDA_ANULAR =
  'ANULAR es corregir un error de captura propio, antes de que nadie lo haya revisado. Si el registro está bien hecho y lo que quieres es devolverlo, lo que buscas es Rechazar.'

export const AYUDA_ACCION: Record<AccionCorte, string> = {
  rechazar: AYUDA_RECHAZAR,
  anular: AYUDA_ANULAR,
}
