/**
 * Pago de Planilla: el pago de sueldos, como concepto propio. Puro.
 *
 * NO es un impuesto, aunque comparta el origen del dato. BUK le arroja el
 * total a Arlette (Gestión Humana) y ella lo transcribe — el sistema nunca
 * lo calcula, igual que nunca calcula una amortización en Financiamiento.
 *
 * Son DOS O MÁS pagos por mes: quincena, fin de mes, y eventualmente otro
 * (una gratificación, una CTS). Por eso `secuencia` es un entero abierto:
 * cerrarlo en 1-2 dejaría el tercero sin forma de cargarse.
 */

/**
 * Qué se paga (migración 0076).
 *
 * - `planilla`: la transferencia masiva a todos los trabajadores, una por
 *   quincena / fin de mes / pago extra. Se identifica por `secuencia`.
 * - `lbs`: Liquidación de Beneficios Sociales — lo que se le paga a UNA
 *   persona cuando se va. Se identifica por `trabajador`, y no tiene
 *   secuencia: en un mismo mes puede haber varias, una por cada persona.
 */
export const CONCEPTOS_PLANILLA = ['planilla', 'lbs'] as const
export type ConceptoPlanilla = (typeof CONCEPTOS_PLANILLA)[number]

export const ETIQUETA_CONCEPTO_PLANILLA: Record<ConceptoPlanilla, string> = {
  planilla: 'Planilla',
  lbs: 'LBS — Liquidación de beneficios sociales',
}

export function esConceptoPlanilla(valor: string): valor is ConceptoPlanilla {
  return (CONCEPTOS_PLANILLA as readonly string[]).includes(valor)
}

export type BorradorPagoPlanilla = {
  concepto: ConceptoPlanilla
  /** 'YYYY-MM' — el mes que la planilla cubre, no cuándo se carga. */
  periodo: string
  /** Solo `planilla`. Null en una LBS. */
  secuencia: number | null
  /** Solo `lbs`: a quién se le liquida. Null en una planilla. */
  trabajador: string | null
  monto: number
  moneda: string
  fechaPago: string
}

export type ErrorValidacion = { campo: string; mensaje: string }

const FORMATO_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

export function validarPagoPlanilla(b: BorradorPagoPlanilla): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []

  if (!esConceptoPlanilla(b.concepto)) {
    errores.push({ campo: 'concepto', mensaje: 'Elige si es planilla o una LBS.' })
  }
  if (!FORMATO_PERIODO.test(b.periodo)) {
    errores.push({ campo: 'periodo', mensaje: 'Elige el mes que cubre este pago.' })
  }
  // Cada concepto pide SU dato y rechaza el del otro. La base tiene el mismo
  // CHECK (pagos_planilla_forma_check); acá se valida antes para devolver un
  // mensaje que se entienda en vez de un error de constraint.
  if (b.concepto === 'lbs') {
    if (!b.trabajador?.trim()) {
      errores.push({ campo: 'trabajador', mensaje: 'Pon el nombre de la persona a la que se le liquida.' })
    }
  } else if (b.secuencia === null || !Number.isInteger(b.secuencia) || b.secuencia < 1) {
    errores.push({ campo: 'secuencia', mensaje: 'Indica si es la 1ra quincena, el fin de mes u otro pago.' })
  }
  if (!(Number(b.monto) > 0)) {
    errores.push({ campo: 'monto', mensaje: 'El monto total tiene que ser mayor a 0.' })
  }
  if (!b.fechaPago) {
    errores.push({ campo: 'fechaPago', mensaje: 'Pon la fecha en que se paga.' })
  }
  if (b.moneda !== 'PEN' && b.moneda !== 'USD') {
    errores.push({ campo: 'moneda', mensaje: 'La moneda tiene que ser PEN o USD.' })
  }
  return errores
}

/**
 * Cómo se llama cada pago del mes. 1 y 2 son los dos normales; de 3 en
 * adelante son los extra (gratificación, CTS, un reintegro), que existen
 * pero no tienen un nombre fijo — por eso se numeran en vez de inventarles
 * una etiqueta que después no coincida con lo que pasó.
 */
export function etiquetaSecuencia(secuencia: number): string {
  if (secuencia === 1) return '1ra quincena'
  if (secuencia === 2) return 'Fin de mes'
  return `Pago ${secuencia} del mes`
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
]

/** '2026-09' → 'setiembre 2026'. "Setiembre" con e, que es la forma usual
 * en Perú. */
export function etiquetaPeriodo(periodo: string): string {
  if (!FORMATO_PERIODO.test(periodo)) return periodo
  const [anio, mes] = periodo.split('-')
  return `${MESES[Number(mes) - 1]} ${anio}`
}

/**
 * Cómo se nombra un pago en la tabla, en la bandeja y en la confirmación.
 * Una LBS se nombra por la PERSONA, que es lo que la distingue de otra LBS
 * del mismo mes — y lo que Tesorería necesita saber para pagarla.
 */
export function etiquetaPagoPlanilla(p: {
  concepto: ConceptoPlanilla | string
  secuencia: number | null
  trabajador: string | null
}): string {
  if (p.concepto === 'lbs') return `LBS — ${p.trabajador ?? 'sin nombre'}`
  return etiquetaSecuencia(p.secuencia ?? 0)
}

/**
 * Lo que queda escrito en `observaciones` de la obligación.
 *
 * Ahí vive el beneficiario porque `obligaciones.beneficiario_persona` es una
 * FK a `auth.users` y la planilla no le paga a una persona: le paga a todos
 * los trabajadores de una transferencia masiva. Inventar un usuario falso
 * "Planilla" en la base para poder apuntar la FK sería peor — las pantallas
 * ya tienen el fallback a `observaciones` para justamente estos casos.
 */
export function descripcionDeObligacion(p: {
  concepto: ConceptoPlanilla | string
  periodo: string
  secuencia: number | null
  trabajador: string | null
}): string {
  // Una LBS NO es una transferencia masiva: decirlo así haría que Tesorería
  // la busque en el archivo de BUK del mes, donde no está.
  if (p.concepto === 'lbs') {
    return `Liquidación de beneficios sociales (LBS) — ${p.trabajador ?? 'sin nombre'} · ${etiquetaPeriodo(p.periodo)}`
  }
  return `Planilla — transferencia masiva a trabajadores · ${etiquetaPeriodo(p.periodo)} · ${etiquetaSecuencia(p.secuencia ?? 0)}`
}

// `rechazada` existe en la base desde la 0069, pero no estaba acá: una carga
// rechazada se mostraba con el estado EN BLANCO en la tabla. Se agrega en la
// 0076, junto con el índice que tampoco la había contemplado.
export type EstadoPagoPlanilla = 'pendiente_contabilidad' | 'conforme' | 'anulada' | 'rechazada'

export const ETIQUETA_ESTADO_PLANILLA: Record<EstadoPagoPlanilla, string> = {
  pendiente_contabilidad: 'Esperando conformidad',
  conforme: 'Conforme — en camino a pago',
  anulada: 'Anulada',
  rechazada: 'Rechazada por Contabilidad',
}

/** Solo se corrige o anula lo que todavía no generó obligación: después ya
 * hay una deuda formal en camino a pagarse, y eso se anula desde la ficha
 * de la obligación como cualquier otra. */
export function puedeCorregirse(estado: EstadoPagoPlanilla): boolean {
  return estado === 'pendiente_contabilidad'
}

export function puedeDarseConformidad(estado: EstadoPagoPlanilla): boolean {
  return estado === 'pendiente_contabilidad'
}

export type PerfilPlanilla = { area: string | null; rol: string | null } | null

/** Arlette (gestion_humana) es quien recibe el dato de BUK — sin ella acá el
 * formulario sería inusable justo para quien tiene que usarlo. */
export function puedeCargarPlanilla(perfil: PerfilPlanilla): boolean {
  return (
    perfil?.area === 'gestion_humana' ||
    perfil?.area === 'contabilidad' ||
    perfil?.area === 'admin'
  )
}

/**
 * Tesorería, Contabilidad rol admin, o admin. Beatriz
 * (contabilidad/operativo) NO — mismo criterio que ya la deja afuera de
 * Pago Directo y de las propuestas, sin excepción.
 */
export function puedeDarConformidadPlanilla(perfil: PerfilPlanilla): boolean {
  // Contabilidad entera desde el 2026-09-19, igual que el resto de las
  // conformidades (ver esContabilidadDecisora): la única decisión que se
  // quedó en rol admin es aprobar un lote de pago.
  return (
    perfil?.area === 'tesoreria' ||
    perfil?.area === 'admin' ||
    perfil?.area === 'contabilidad'
  )
}

/** Quién ve la pantalla. Gerencia y el resto de las áreas quedan afuera: la
 * planilla no se le muestra a nadie que no participe del circuito. */
export function puedeVerPlanilla(perfil: PerfilPlanilla): boolean {
  return puedeCargarPlanilla(perfil) || perfil?.area === 'tesoreria'
}
