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
  'factura_adjunta',
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
  factura_adjunta: 'Factura adjunta — falta completar los datos',
  facturada: 'Facturada — falta la conformidad',
  conformada: 'Conforme — en camino a pago',
  cerrada: 'Cerrada',
  anulada: 'Anulada',
}

const TRANSICIONES: Record<EstadoOS, readonly EstadoOS[]> = {
  pendiente_jefe: ['aprobada', 'rechazada_jefe'],
  rechazada_jefe: [],
  aprobada: ['factura_adjunta'],
  en_ejecucion: ['factura_adjunta'],
  factura_adjunta: ['facturada', 'conformada'],
  facturada: ['conformada'],
  conformada: ['cerrada'],
  cerrada: [],
  anulada: [],
}

export function transicionPermitida(desde: EstadoOS, hacia: EstadoOS): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

/**
 * Subir el PDF de la factura NUNCA marca la OS como 'facturada'/'conformada'
 * directo, sin importar si la conformidad ya existía — eso era la causa
 * raíz real de que Mariela viera una OS "resuelta" sin estarlo (hallazgo
 * de Contabilidad, punto 2). Adjuntar el documento solo mueve a
 * 'factura_adjunta' — el estado final recién llega cuando se completan los
 * datos reales en "Registrar obligación" (ver estadoTrasRegistrarObligacion).
 */
export function estadoTrasSubirFactura(): EstadoOS {
  return 'factura_adjunta'
}

/**
 * Si la factura todavía no se subió, dar conformidad no mueve el estado
 * visible (sigue 'aprobada'/'en_ejecucion'). Si el documento ya está
 * adjunto pero todavía faltan los datos reales ('factura_adjunta'),
 * tampoco — saltar a 'conformada' ahí sería el mismo error que con la
 * factura: marcar como resuelto algo que no lo está. Solo si ya se
 * completó "Registrar obligación" (estado 'facturada') la conformidad
 * mueve a 'conformada'. En todos los casos, la fila en
 * `conformidad_servicio` ya quedó guardada igual — el estado de la OS
 * solo refleja lo que falta.
 */
export function estadoTrasConformidad(estadoActual: EstadoOS): EstadoOS {
  if (estadoActual === 'facturada') return 'conformada'
  return estadoActual
}

/**
 * Al completar "Registrar obligación" (N° de factura, fecha, Base, IGV
 * reales) la OS recién pasa a su estado final: 'conformada' si la
 * conformidad ya se había dado mientras estaba en 'factura_adjunta', o
 * 'facturada' (falta la conformidad) si no.
 */
export function estadoTrasRegistrarObligacion(conformidadYaExiste: boolean): EstadoOS {
  return conformidadYaExiste ? 'conformada' : 'facturada'
}

export type BorradorOS = {
  proveedorServicioId: string
  descripcionServicio: string
  montoEstimado: number
  /** true = montoEstimado ya incluye IGV, false = es la base sin IGV. Null
   *  solo en OS viejas que se crearon antes de este campo (ver 0033) —
   *  las nuevas lo piden siempre, no queda ambiguo como antes. */
  montoIncluyeIgv: boolean | null
  moneda: Moneda
  condicionesPagoDias?: number | null
  fechaEntregaEstimada?: string | null
}

export function validarOS(b: BorradorOS): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (!b.proveedorServicioId) errores.push({ campo: 'proveedorServicioId', mensaje: 'Elige un proveedor de servicio.' })
  if (!b.descripcionServicio.trim()) errores.push({ campo: 'descripcionServicio', mensaje: 'Cuenta qué servicio es.' })
  if (!(Number(b.montoEstimado) > 0)) errores.push({ campo: 'montoEstimado', mensaje: 'El monto estimado tiene que ser mayor a 0.' })
  if (b.montoIncluyeIgv == null) {
    errores.push({ campo: 'montoIncluyeIgv', mensaje: 'Indica si el monto es con IGV o sin IGV.' })
  }
  if (b.moneda !== 'PEN' && b.moneda !== 'USD') errores.push({ campo: 'moneda', mensaje: 'La moneda tiene que ser PEN o USD.' })
  if (b.condicionesPagoDias == null) {
    errores.push({ campo: 'condicionesPagoDias', mensaje: 'Pon la condición de pago (0 = contado).' })
  } else if (b.condicionesPagoDias < 0) {
    errores.push({ campo: 'condicionesPagoDias', mensaje: 'Los días no pueden ser negativos.' })
  }
  return errores
}

/**
 * Regla nueva (hallazgo de Mariela, Contabilidad): la factura real de una
 * OS no puede pedir más de lo que la OS aprobó. Compara sobre la MISMA
 * base que `montoIncluyeIgv` señaló al crear la OS — si el monto estimado
 * es "sin IGV", se compara contra la base imponible de la factura (nunca
 * se inventa una tasa de IGV para "completar" la comparación); si es "con
 * IGV", se compara contra el total (base + IGV) de la factura.
 *
 * `montoIncluyeIgv === null` (OS vieja, de antes de 0033) → no hay forma
 * de saber la base de comparación real, así que no se bloquea nada: mejor
 * dejar pasar que bloquear con un dato que no existe.
 */
export function facturaSuperaMontoOS(
  baseImponible: number,
  igv: number,
  montoEstimado: number,
  montoIncluyeIgv: boolean | null
): boolean {
  if (montoIncluyeIgv == null) return false
  const montoFactura = montoIncluyeIgv ? Number(baseImponible) + Number(igv) : Number(baseImponible)
  return montoFactura > montoEstimado
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

/** Datos de la OS necesarios para chequear que la factura no la supere — ver facturaSuperaMontoOS. */
export type OSParaValidarFactura = { montoEstimado: number; montoIncluyeIgv: boolean | null; moneda: Moneda }

export function validarObligacionServicio(b: BorradorObligacionServicio, os?: OSParaValidarFactura): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (!b.numeroFactura.trim()) errores.push({ campo: 'numeroFactura', mensaje: 'Falta el número de factura.' })
  if (!b.fechaFactura) errores.push({ campo: 'fechaFactura', mensaje: 'Falta la fecha de factura.' })
  if (!(Number(b.baseImponible) > 0)) {
    errores.push({ campo: 'baseImponible', mensaje: 'La base imponible tiene que ser mayor a 0 — mira la factura.' })
  }
  if (b.igv == null || Number(b.igv) < 0) {
    errores.push({ campo: 'igv', mensaje: 'Pon el IGV tal como figura en la factura (puede ser 0).' })
  }
  if (os && facturaSuperaMontoOS(Number(b.baseImponible), Number(b.igv), os.montoEstimado, os.montoIncluyeIgv)) {
    errores.push({
      campo: 'baseImponible',
      mensaje: `La factura supera el monto de la Orden de Servicio (${os.moneda} ${os.montoEstimado.toFixed(2)}${os.montoIncluyeIgv ? ' con IGV' : ' sin IGV'}).`,
    })
  }
  return errores
}

/**
 * Regla 1.8: una factura de servicio en soles que supera S/700 suele caer
 * en detracción (Anexo 3 SUNAT) — pero la tasa exacta depende de la
 * categoría de servicio, que todavía no está modelada acá (ver "Pendiente
 * de confirmar" del documento maestro, sección 10: "tasas de detracción
 * reales del anexo SUNAT"). Por eso esto es una ALERTA, no un cálculo ni un
 * bloqueo — Contabilidad decide si aplica y por cuánto, igual que la
 * alerta de comprobante no sustentable (regla 12).
 */
export const UMBRAL_DETRACCION_SERVICIOS_PEN = 700

export function superaUmbralDetraccion(totalFactura: number, moneda: Moneda): boolean {
  return moneda === 'PEN' && totalFactura > UMBRAL_DETRACCION_SERVICIOS_PEN
}
