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

/**
 * `pendiente_jefe` y `rechazada_jefe` quedan como estados VESTIGIALES: desde
 * la migración 0037 ninguna solicitud nace ahí. El "jefe de área" aprobaba
 * un Reembolso o un Gasto directo cuando el dinero YA había salido de la
 * empresa, así que no decidía nada; para un Anticipo la decisión real la
 * toma Contabilidad al generar la obligación. Lo que quedó en su lugar es el
 * campo informativo "Quién autoriza" (0036).
 *
 * Se conservan en la lista para que una fila histórica siga siendo legible —
 * la aprobación real que SÍ decide algo (Orden de Servicio antes de
 * `en_ejecucion`, Reposición de Caja Chica por el jefe de Almacén) vive en
 * domain/servicio.ts y domain/caja-chica.ts, y no se toca.
 */
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
 * Estado con el que nace toda solicitud desde la migración 0037 — los tres
 * tipos entran directo a la bandeja de Contabilidad, sin paso de jefe. Se
 * escribe explícito en `crearSolicitud()` además de estar como default de la
 * columna: si mañana alguien cambia el default en la base, el código sigue
 * diciendo lo que el negocio decidió.
 */
export const ESTADO_INICIAL_SOLICITUD: EstadoSolicitud = 'pendiente_contabilidad'

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

/**
 * `montoAnticipo` solo aplica a tipo `anticipo`: es plata que sale ANTES del
 * gasto real, así que no hay ningún comprobante que mirar todavía — se pide
 * el monto tal cual y se rinde después con comprobantes reales (regla 7).
 *
 * `baseImponible`/`igv` solo aplican a `gasto_directo`/`reembolso`: ya existe
 * un comprobante real (factura o boleta) para leer. El sistema NUNCA inventa
 * este desglose — quien registra la solicitud lo transcribe tal como
 * figura en su comprobante. `igv` no se calcula solo: la pantalla puede
 * *sugerir* 18% de la base como punto de partida editable, pero el valor
 * real puede ser 0 (boletas de un régimen que no discrimina IGV, como RUS).
 */
export type BorradorSolicitud = {
  tipo: TipoSolicitud
  categoriaId: string
  moneda: string
  montoAnticipo?: number | null
  baseImponible?: number | null
  igv?: number | null
  descripcion: string
  destino?: string | null
  fechaInicio?: string | null
  fechaFin?: string | null
  /** Solo aplica a `anticipo`: quien recibe los viáticos, cuando no es la
   * misma persona que arma la solicitud (ej. Contabilidad la crea para un
   * vendedor). Si queda null, el beneficiario es quien la crea — ver
   * services/solicitudes-gasto.ts. */
  asignadoA?: string | null
  /** Texto libre, puramente informativo — NO es un paso de aprobación real,
   * no bloquea nada ni requiere que esa persona entre al sistema (ver
   * quien_autoriza en la migración 0036). La pantalla lo sugiere con el
   * responsable del área de quien crea la solicitud, pero es editable a
   * mano. Aplica a `anticipo` y a `reembolso`. */
  quienAutoriza?: string | null
  /** Solo `gasto_directo`/`reembolso`: la fecha que figura en el comprobante
   * real. Obligatoria salvo que no haya comprobante (ver validarSolicitud). */
  fechaFactura?: string | null
  /** Solo `gasto_directo`/`reembolso`: qué comprobante se está sustentando.
   * Vive en el borrador porque de él depende si `fechaFactura` es
   * obligatoria — así la regla es pura y testeable, sin leer el FormData. */
  tipoComprobante?: TipoComprobante | null
}

export const TIPOS_COMPROBANTE = ['factura', 'boleta', 'sin_comprobante'] as const
export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number]

/** El monto total que queda en `solicitudes_gasto.monto_solicitado`. */
export function montoTotalSolicitud(b: Pick<BorradorSolicitud, 'tipo' | 'montoAnticipo' | 'baseImponible' | 'igv'>): number {
  if (b.tipo === 'anticipo') return Number(b.montoAnticipo) || 0
  return redondear((Number(b.baseImponible) || 0) + (Number(b.igv) || 0))
}

export function validarSolicitud(b: BorradorSolicitud): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []

  if (!TIPOS_SOLICITUD.includes(b.tipo)) errores.push({ campo: 'tipo', mensaje: 'Elige un tipo de solicitud.' })
  if (!b.categoriaId) errores.push({ campo: 'categoriaId', mensaje: 'Elige una categoría de gasto.' })
  if (!b.descripcion.trim()) errores.push({ campo: 'descripcion', mensaje: 'Cuenta para qué es este gasto.' })
  if (b.moneda !== 'PEN' && b.moneda !== 'USD') errores.push({ campo: 'moneda', mensaje: 'La moneda tiene que ser PEN o USD.' })

  if (b.tipo === 'anticipo') {
    if (!(Number(b.montoAnticipo) > 0)) errores.push({ campo: 'montoAnticipo', mensaje: 'El monto tiene que ser mayor a 0.' })
    if (b.fechaInicio && b.fechaFin && b.fechaFin < b.fechaInicio) {
      errores.push({ campo: 'fechaFin', mensaje: 'La fecha de fin no puede ser antes que la de inicio.' })
    }
  } else {
    if (!(Number(b.baseImponible) > 0)) {
      errores.push({ campo: 'baseImponible', mensaje: 'La base imponible tiene que ser mayor a 0 — mira tu comprobante.' })
    }
    if (b.igv == null || Number(b.igv) < 0) {
      errores.push({ campo: 'igv', mensaje: 'Pon el IGV tal como figura en tu comprobante (puede ser 0).' })
    }
    // Si hay comprobante, tiene una fecha impresa: pedirla no cuesta nada y
    // es el dato con el que Contabilidad ubica el gasto en el periodo. Sin
    // comprobante no hay nada de dónde copiarla, así que ahí no se exige.
    if (b.tipoComprobante !== 'sin_comprobante' && !b.fechaFactura) {
      errores.push({ campo: 'fechaFactura', mensaje: 'Pon la fecha que figura en tu factura o boleta.' })
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
