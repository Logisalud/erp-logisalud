/**
 * Reglas de Gastos / Anticipos. Puro: sin Next, sin Supabase, testeable solo.
 *
 * Lenguaje Ubicuo: una Solicitud de Gasto es gasto_directo (factura sin OC:
 * útiles, pasajes, mantenimiento), reembolso (el empleado ya pagó de su
 * bolsillo) o anticipo (adelanto antes del gasto real, que se Rinde /
 * Liquida después con comprobantes reales). Ver sección 4 ("La regla de
 * oro") y el caso "anticipo" del mapa de flujo, sección 5.
 */

export const TIPOS_SOLICITUD = ['gasto_directo', 'reembolso', 'anticipo'] as const
export type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number]

export const ETIQUETA_TIPO: Record<TipoSolicitud, string> = {
  gasto_directo: 'Gasto directo',
  reembolso: 'Reembolso',
  anticipo: 'Anticipo',
}

export const ESTADOS_SOLICITUD = [
  'pendiente_jefe',
  'rechazada_jefe',
  'pendiente_contabilidad',
  'rechazada_contabilidad',
  'aprobada',
  'pagada',
  'pendiente_rendicion',
  'rendida',
  'cerrada',
] as const
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number]

export const ETIQUETA_ESTADO: Record<EstadoSolicitud, string> = {
  pendiente_jefe: 'Esperando a tu jefe de área',
  rechazada_jefe: 'Rechazada por tu jefe de área',
  pendiente_contabilidad: 'Esperando a Contabilidad',
  rechazada_contabilidad: 'Rechazada por Contabilidad',
  aprobada: 'Aprobada — en camino a pago',
  pagada: 'Pagada',
  pendiente_rendicion: 'Pagada — pendiente de rendir',
  rendida: 'Rendida',
  cerrada: 'Cerrada',
}

/**
 * `aprobada` -> `pagada` NO se pone a mano: lo dispara Tesorería al pagar
 * la obligación que Contabilidad generó (regla 6), igual que
 * domain/orden-compra.ts no deja poner a mano los estados que decide
 * Almacén. Por eso no sale de `aprobada` acá.
 */
const TRANSICIONES: Record<EstadoSolicitud, readonly EstadoSolicitud[]> = {
  pendiente_jefe: ['pendiente_contabilidad', 'rechazada_jefe'],
  rechazada_jefe: [],
  pendiente_contabilidad: ['aprobada', 'rechazada_contabilidad'],
  rechazada_contabilidad: [],
  aprobada: [],
  pagada: [],
  pendiente_rendicion: ['rendida'],
  rendida: ['cerrada'],
  cerrada: [],
}

export function transicionPermitida(desde: EstadoSolicitud, hacia: EstadoSolicitud): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

/**
 * Estado de la solicitud cuando Tesorería paga la obligación asociada
 * (regla 6, la contraparte de estadoTrasRecepcion en domain/orden-compra.ts):
 * un anticipo queda pendiente de rendir, gasto_directo y reembolso se
 * cierran solos porque no hay nada más que sustentar después de pagados.
 */
export function estadoTrasPago(tipo: TipoSolicitud): EstadoSolicitud {
  return tipo === 'anticipo' ? 'pendiente_rendicion' : 'cerrada'
}

export type ErrorValidacion = { campo: string; mensaje: string }

export type BorradorSolicitud = {
  tipo: TipoSolicitud
  categoriaId: string
  moneda: string
  montoSolicitado: number
  descripcion: string
  destino?: string | null
  fechaInicio?: string | null
  fechaFin?: string | null
}

export function validarSolicitud(b: BorradorSolicitud): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []

  if (!TIPOS_SOLICITUD.includes(b.tipo)) errores.push({ campo: 'tipo', mensaje: 'Elegí un tipo de solicitud.' })
  if (!b.categoriaId) errores.push({ campo: 'categoriaId', mensaje: 'Elegí una categoría de gasto.' })
  if (!(b.montoSolicitado > 0)) errores.push({ campo: 'montoSolicitado', mensaje: 'El monto tiene que ser mayor a 0.' })
  if (!b.descripcion.trim()) errores.push({ campo: 'descripcion', mensaje: 'Contá para qué es este gasto.' })
  if (b.moneda !== 'PEN' && b.moneda !== 'USD') errores.push({ campo: 'moneda', mensaje: 'La moneda tiene que ser PEN o USD.' })

  if (b.tipo === 'anticipo') {
    if (b.fechaInicio && b.fechaFin && b.fechaFin < b.fechaInicio) {
      errores.push({ campo: 'fechaFin', mensaje: 'La fecha de fin no puede ser antes que la de inicio.' })
    }
  }

  return errores
}

export type Comprobante = { monto: number; sustentable: boolean }

export type ResultadoLiquidacion = 'devolucion_empleado' | 'reembolso_adicional' | 'sin_diferencia'

export type Liquidacion = {
  montoSustentado: number
  diferencia: number
  resultado: ResultadoLiquidacion
}

/**
 * Regla 7: al subir comprobantes de rendición, calcula cuánto se sustentó
 * y en qué dirección queda la diferencia. Mismo cálculo que hacen las
 * columnas generadas de `gastos.liquidaciones_anticipo` en la base — vive
 * acá también para que la pantalla pueda mostrar el resultado ANTES de
 * guardar, no solo después de que la base lo calculó.
 *
 * Los comprobantes no sustentables (`sustentable = false`) SÍ suman al
 * monto sustentado — regla 12 es una alerta visual, no un bloqueo: el
 * empleado gastó la plata igual, sustentarlo mal no la hace desaparecer.
 */
export function calcularLiquidacion(montoAnticipo: number, comprobantes: readonly Comprobante[]): Liquidacion {
  const montoSustentado = redondear(comprobantes.reduce((acc, c) => acc + c.monto, 0))
  const diferencia = redondear(montoAnticipo - montoSustentado)
  const resultado: ResultadoLiquidacion =
    diferencia > 0 ? 'devolucion_empleado' : diferencia < 0 ? 'reembolso_adicional' : 'sin_diferencia'
  return { montoSustentado, diferencia, resultado }
}

function redondear(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}
