/**
 * Reglas de Caja Chica. Puro: sin Next, sin Supabase, testeable solo.
 *
 * Lenguaje Ubicuo: un Fondo es el dinero fijo que administra un custodio
 * (Roberto, con combustible y peajes de camiones — NUNCA mantenimiento, ver
 * sección 5 del documento maestro). Cada gasto del fondo es un Movimiento,
 * sustentado con su propio comprobante. Cuando el fondo se agota, el
 * custodio arma una Reposición que junta los movimientos todavía no
 * repuestos (regla 13) y sigue el mismo camino de aprobación que un gasto:
 * jefe de área -> Contabilidad -> obligación -> Tesorería repone el fondo.
 */

export type TipoComprobanteMovimiento = 'factura' | 'boleta' | 'sin_comprobante'

/**
 * `baseImponible`/`igv` solo se piden cuando hay comprobante real
 * (factura/boleta) — igual que en gastos/anticipos (ver domain/gasto.ts):
 * el sistema nunca inventa el desglose, el custodio lo transcribe de su
 * boleta, con 18% como sugerencia editable. Un movimiento `sin_comprobante`
 * no tiene nada que transcribir: su monto entero cuenta como base con IGV 0
 * (regla 12, alerta visual no bloqueo — no se inventa un IGV que no hay
 * forma de sustentar).
 */
export type BorradorMovimiento = {
  fondoId: string
  categoriaId: string
  fecha: string
  monto: number
  tipoComprobante: TipoComprobanteMovimiento
  numero?: string | null
  rucEmisor?: string | null
  placaVehiculo?: string | null
  descripcion?: string | null
  baseImponible?: number | null
  igv?: number | null
  sustentable: boolean
}

export type ErrorValidacion = { campo: string; mensaje: string }

export function validarMovimiento(b: BorradorMovimiento): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (!b.fondoId) errores.push({ campo: 'fondoId', mensaje: 'Falta el fondo.' })
  if (!b.categoriaId) errores.push({ campo: 'categoriaId', mensaje: 'Elegí una categoría de gasto.' })
  if (!b.fecha) errores.push({ campo: 'fecha', mensaje: 'Falta la fecha.' })
  if (!(Number(b.monto) > 0)) errores.push({ campo: 'monto', mensaje: 'El monto tiene que ser mayor a 0.' })

  if (b.tipoComprobante !== 'sin_comprobante') {
    if (!(Number(b.baseImponible) > 0)) {
      errores.push({ campo: 'baseImponible', mensaje: 'La base imponible tiene que ser mayor a 0 — mirá tu comprobante.' })
    }
    if (b.igv == null || Number(b.igv) < 0) {
      errores.push({ campo: 'igv', mensaje: 'Poné el IGV tal como figura en tu comprobante (puede ser 0).' })
    }
  }

  return errores
}

/** Lo que efectivamente queda en `movimientos.base_imponible`/`igv`. */
export function baseEIgvMovimiento(b: Pick<BorradorMovimiento, 'tipoComprobante' | 'monto' | 'baseImponible' | 'igv'>): {
  baseImponible: number
  igv: number
} {
  if (b.tipoComprobante === 'sin_comprobante') return { baseImponible: Number(b.monto) || 0, igv: 0 }
  return { baseImponible: Number(b.baseImponible) || 0, igv: Number(b.igv) || 0 }
}

export const ESTADOS_REPOSICION = [
  'pendiente_jefe',
  'rechazada_jefe',
  'pendiente_contabilidad',
  'rechazada_contabilidad',
  'aprobada',
  'pagada',
  'cerrada',
] as const
export type EstadoReposicion = (typeof ESTADOS_REPOSICION)[number]

export const ETIQUETA_ESTADO_REPOSICION: Record<EstadoReposicion, string> = {
  pendiente_jefe: 'Esperando al jefe de Almacén',
  rechazada_jefe: 'Rechazada por el jefe de Almacén',
  pendiente_contabilidad: 'Esperando a Contabilidad',
  rechazada_contabilidad: 'Rechazada por Contabilidad',
  aprobada: 'Aprobada — en camino a pago',
  pagada: 'Pagada',
  cerrada: 'Cerrada — fondo repuesto',
}

/**
 * A diferencia de un anticipo de Gastos, una reposición no tiene "rendición"
 * después de pagada: los comprobantes ya existían desde antes (el custodio
 * gastó primero, pidió reponer después), así que en cuanto Tesorería paga
 * el ciclo queda cerrado — mismo patrón que gasto_directo/reembolso en
 * domain/gasto.ts (estadoTrasPago), sin pasar por un estado 'pagada'
 * intermedio guardado en la fila.
 */
const TRANSICIONES: Record<EstadoReposicion, readonly EstadoReposicion[]> = {
  pendiente_jefe: ['pendiente_contabilidad', 'rechazada_jefe'],
  rechazada_jefe: [],
  pendiente_contabilidad: ['aprobada', 'rechazada_contabilidad'],
  rechazada_contabilidad: [],
  aprobada: [],
  pagada: [],
  cerrada: [],
}

export function transicionPermitida(desde: EstadoReposicion, hacia: EstadoReposicion): boolean {
  return TRANSICIONES[desde].includes(hacia)
}
