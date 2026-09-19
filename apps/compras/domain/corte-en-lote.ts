/**
 * Reglas de "rechazar o anular varios juntos" desde Pendientes de aprobar.
 * Puro: sin Next, sin Supabase.
 *
 * Es la contraparte de domain/aprobacion-en-lote.ts y reusa su maquinaria
 * (el tope, el orden de ejecución, el resumen honesto) en vez de clonarla.
 * Lo que agrega es lo que NO tiene aprobar:
 *
 *  1. Un MOTIVO, obligatorio, que se aplica igual a todas las filas. Es una
 *     decisión consciente de Sebas (2026-09-19): un motivo compartido puede
 *     no ser exacto para cada caso, y se acepta a cambio de la velocidad —
 *     el mismo canje que ya se aceptó al dejar que un lote mezcle tipos.
 *  2. Cobertura despareja. No todos los tipos tienen las dos salidas hacia
 *     atrás, y de los que las tienen, varios NO guardan el motivo porque su
 *     función individual nunca lo pidió. Eso se declara acá en una tabla, y
 *     la pantalla lo dice antes de ejecutar en vez de prometer que el
 *     motivo quedó escrito en las ocho filas.
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
 * De las filas seleccionadas, cuáles no admiten esta acción. La pantalla las
 * nombra ANTES de ejecutar: enterarse después, en el resumen, es enterarse
 * tarde.
 */
export function filasQueNoAdmiten<T extends { tipo: TipoPendiente }>(
  filas: readonly T[],
  accion: AccionCorte
): T[] {
  return filas.filter((f) => !admiteCorte(f.tipo, accion))
}

/** De las que SÍ se van a cortar, en cuántas el motivo no queda guardado. */
export function filasSinRastroDelMotivo<T extends { tipo: TipoPendiente }>(
  filas: readonly T[],
  accion: AccionCorte
): T[] {
  return filas.filter((f) => admiteCorte(f.tipo, accion) && !guardaElMotivo(f.tipo, accion))
}

/** Qué dice el botón. Mismo criterio que `etiquetaBotonLote` de aprobar. */
export function etiquetaBotonCorte(
  filas: readonly { tipo: TipoPendiente }[],
  accion: AccionCorte
): string {
  const verbo = ETIQUETA_ACCION[accion].verbo
  if (filas.length === 0) return `${verbo} seleccionados`
  const tipos = new Set(filas.map((f) => f.tipo))
  if (tipos.size > 1) return `${verbo} ${filas.length} registros`

  const tipo = [...tipos][0]
  const nombre =
    filas.length === 1 ? ETIQUETA_TIPO_PENDIENTE[tipo] : ETIQUETA_TIPO_PENDIENTE_PLURAL[tipo]
  return `${verbo} ${filas.length} ${nombre}`
}

/**
 * El resumen honesto, igual que en aprobar: nunca "listo" a secas. Sin
 * transacciones, un lote de 6 puede terminar en 4.
 */
export function resumirCorte(
  resultados: readonly ResultadoFila[],
  accion: AccionCorte
): string {
  const { elSustantivo, hechoSingular, hechoPlural } = ETIQUETA_ACCION[accion]
  const ok = resultados.filter((r) => r.ok)
  const fallidos = resultados.filter((r) => !r.ok)

  if (fallidos.length === 0) {
    return ok.length === 1
      ? `Se ${hechoSingular} 1 registro.`
      : `Se ${hechoPlural} los ${ok.length} registros.`
  }
  if (ok.length === 0) {
    return `No se pudo aplicar ${elSustantivo} a ninguno. ${detalleFallidos(fallidos)}`
  }
  const verbo = ok.length === 1 ? hechoSingular : hechoPlural
  return `Se ${verbo} ${ok.length} de ${resultados.length}. ${detalleFallidos(fallidos)}`
}

function detalleFallidos(fallidos: readonly ResultadoFila[]): string {
  const partes = fallidos.map((f) => {
    const nombre = f.tipo ? `${ETIQUETA_TIPO_PENDIENTE[f.tipo]} ` : ''
    return `${nombre}${f.codigo} (${f.motivo ?? 'error desconocido'})`
  })
  if (partes.length === 1) return `No se pudo con ${partes[0]}.`
  return `No se pudo con ${partes.slice(0, -1).join(', ')} ni con ${partes[partes.length - 1]}.`
}
