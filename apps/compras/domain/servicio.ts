/**
 * Reglas de Servicios. Puro: sin Next, sin Supabase, testeable solo.
 *
 * Lenguaje Ubicuo: una Orden de Servicio (OS) la crea cualquier área
 * usuaria para contratar un proveedor de servicio (catálogo aparte del de
 * mercadería, ver sección 1 del documento maestro). El jefe de esa área
 * aprueba. Después, "en cualquier orden" (sección 5 del documento maestro),
 * el área usuaria sube la factura del proveedor y da la Conformidad de que
 * el servicio se cumplió — dos hechos independientes, no un paso único.
 */

export type Moneda = 'PEN' | 'USD'
export type ErrorValidacion = { campo: string; mensaje: string }

export const ESTADOS_OS = [
  'pendiente_jefe',
  'rechazada_jefe',
  'aprobada',
  'en_ejecucion',
  'facturada',
  'conformada',
  'cerrada',
  'anulada',
] as const
export type EstadoOS = (typeof ESTADOS_OS)[number]

export const ETIQUETA_ESTADO_OS: Record<EstadoOS, string> = {
  pendiente_jefe: 'Esperando al jefe de área',
  rechazada_jefe: 'Rechazada por el jefe de área',
  aprobada: 'Aprobada — en ejecución',
  en_ejecucion: 'En ejecución',
  facturada: 'Facturada — falta la conformidad',
  conformada: 'Conforme — en camino a pago',
  cerrada: 'Cerrada',
  anulada: 'Anulada',
}

const TRANSICIONES: Record<EstadoOS, readonly EstadoOS[]> = {
  pendiente_jefe: ['aprobada', 'rechazada_jefe'],
  rechazada_jefe: [],
  aprobada: ['facturada', 'conformada'],
  en_ejecucion: ['facturada', 'conformada'],
  facturada: ['conformada'],
  conformada: ['cerrada'],
  cerrada: [],
  anulada: [],
}

export function transicionPermitida(desde: EstadoOS, hacia: EstadoOS): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

/**
 * Factura y conformidad pueden pasar en cualquier orden: si la conformidad
 * ya existía cuando se sube la factura, el estado salta directo a
 * 'conformada' en vez de pasar por 'facturada' — ese estado intermedio
 * solo tiene sentido mientras falta uno de los dos hechos.
 */
export function estadoTrasSubirFactura(conformidadYaExiste: boolean): EstadoOS {
  return conformidadYaExiste ? 'conformada' : 'facturada'
}

/**
 * Si la factura todavía no se subió, dar conformidad no mueve el estado
 * visible (sigue 'aprobada'/'en_ejecucion') — la fila en
 * `conformidad_servicio` ya quedó guardada igual, el estado solo refleja
 * el hecho que faltaba.
 */
export function estadoTrasConformidad(facturaYaSubida: boolean, estadoActual: EstadoOS): EstadoOS {
  return facturaYaSubida ? 'conformada' : estadoActual
}

export type BorradorOS = {
  proveedorServicioId: string
  descripcionServicio: string
  montoEstimado: number
  moneda: Moneda
  condicionesPagoDias?: number | null
  fechaEntregaEstimada?: string | null
}

export function validarOS(b: BorradorOS): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (!b.proveedorServicioId) errores.push({ campo: 'proveedorServicioId', mensaje: 'Elige un proveedor de servicio.' })
  if (!b.descripcionServicio.trim()) errores.push({ campo: 'descripcionServicio', mensaje: 'Cuenta qué servicio es.' })
  if (!(Number(b.montoEstimado) > 0)) errores.push({ campo: 'montoEstimado', mensaje: 'El monto estimado tiene que ser mayor a 0.' })
  if (b.moneda !== 'PEN' && b.moneda !== 'USD') errores.push({ campo: 'moneda', mensaje: 'La moneda tiene que ser PEN o USD.' })
  return errores
}

/**
 * Base/IGV explícitos de la factura real del proveedor de servicio —
 * mismo criterio ya aplicado en Gastos y Caja Chica (domain/gasto.ts,
 * domain/caja-chica.ts): el sistema nunca inventa el desglose, Contabilidad
 * lo transcribe de la factura, con 18% como sugerencia editable.
 */
export type BorradorObligacionServicio = {
  osId: string
  numeroFactura: string
  fechaFactura: string
  tipoCambio?: number | null
  baseImponible: number
  igv: number
}

export function validarObligacionServicio(b: BorradorObligacionServicio): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (!b.numeroFactura.trim()) errores.push({ campo: 'numeroFactura', mensaje: 'Falta el número de factura.' })
  if (!b.fechaFactura) errores.push({ campo: 'fechaFactura', mensaje: 'Falta la fecha de factura.' })
  if (!(Number(b.baseImponible) > 0)) {
    errores.push({ campo: 'baseImponible', mensaje: 'La base imponible tiene que ser mayor a 0 — mira la factura.' })
  }
  if (b.igv == null || Number(b.igv) < 0) {
    errores.push({ campo: 'igv', mensaje: 'Pon el IGV tal como figura en la factura (puede ser 0).' })
  }
  return errores
}
