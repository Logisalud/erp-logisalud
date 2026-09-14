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

export type BorradorPagoPlanilla = {
  /** 'YYYY-MM' — el mes que la planilla cubre, no cuándo se carga. */
  periodo: string
  secuencia: number
  monto: number
  moneda: string
  fechaPago: string
}

export type ErrorValidacion = { campo: string; mensaje: string }

const FORMATO_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

export function validarPagoPlanilla(b: BorradorPagoPlanilla): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []

  if (!FORMATO_PERIODO.test(b.periodo)) {
    errores.push({ campo: 'periodo', mensaje: 'Elige el mes que cubre esta planilla.' })
  }
  if (!Number.isInteger(b.secuencia) || b.secuencia < 1) {
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
 * Lo que queda escrito en `observaciones` de la obligación.
 *
 * Ahí vive el beneficiario porque `obligaciones.beneficiario_persona` es una
 * FK a `auth.users` y la planilla no le paga a una persona: le paga a todos
 * los trabajadores de una transferencia masiva. Inventar un usuario falso
 * "Planilla" en la base para poder apuntar la FK sería peor — las pantallas
 * ya tienen el fallback a `observaciones` para justamente estos casos.
 */
export function descripcionDeObligacion(periodo: string, secuencia: number): string {
  return `Planilla — transferencia masiva a trabajadores · ${etiquetaPeriodo(periodo)} · ${etiquetaSecuencia(secuencia)}`
}

export type EstadoPagoPlanilla = 'pendiente_contabilidad' | 'conforme' | 'anulada'

export const ETIQUETA_ESTADO_PLANILLA: Record<EstadoPagoPlanilla, string> = {
  pendiente_contabilidad: 'Esperando conformidad',
  conforme: 'Conforme — en camino a pago',
  anulada: 'Anulada',
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
  return (
    perfil?.area === 'tesoreria' ||
    perfil?.area === 'admin' ||
    (perfil?.area === 'contabilidad' && perfil?.rol === 'admin')
  )
}

/** Quién ve la pantalla. Gerencia y el resto de las áreas quedan afuera: la
 * planilla no se le muestra a nadie que no participe del circuito. */
export function puedeVerPlanilla(perfil: PerfilPlanilla): boolean {
  return puedeCargarPlanilla(perfil) || perfil?.area === 'tesoreria'
}
