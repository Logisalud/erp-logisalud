/**
 * Reglas de la Recepción de Almacén. Puro: sin Next, sin Supabase, testeable solo.
 *
 * Lenguaje Ubicuo: una Recepción es lo que Charlie (o Jose Carlos, o Sandra
 * Chau) registra cuando llega la mercadería de una OC. Por línea, el sistema
 * clasifica automáticamente si hay una Discrepancia contra lo pedido — el
 * responsable de Almacén (hoy Sebas) confirma o ajusta la acción sugerida.
 * Ver secciones 5 y 8.2/8.3 de docs/modulo-compras-pagos.md.
 */

export const TIPOS_DISCREPANCIA = [
  'ninguna',
  'faltante',
  'sobrante',
  'producto_erroneo',
  'danado',
  'vencido',
  'por_vencer',
  'lote_no_informado',
] as const
export type TipoDiscrepancia = (typeof TIPOS_DISCREPANCIA)[number]

export const ESTADOS_CALIDAD = ['bueno', 'danado', 'vencido', 'por_vencer'] as const
export type EstadoCalidad = (typeof ESTADOS_CALIDAD)[number]

export const ETIQUETA_DISCREPANCIA: Record<TipoDiscrepancia, string> = {
  ninguna: 'Sin discrepancia',
  faltante: 'Faltante',
  sobrante: 'Sobrante',
  producto_erroneo: 'Producto erróneo',
  danado: 'Dañado',
  vencido: 'Vencido',
  por_vencer: 'Por vencer',
  lote_no_informado: 'Lote no informado',
}

/** Lo que la línea necesita saber del producto para clasificarse. */
export type ProductoParaRecepcion = {
  controlaLote: boolean
  controlaVencimiento: boolean
  mesesVidaUtilMinima: number
}

export type LineaRecepcionInput = {
  /** Lo que aún falta recibir de esa línea de OC (pedida menos ya recibida en recepciones previas). */
  cantidadPedidaPendiente: number
  cantidadGuia: number | null
  cantidadFisica: number
  lote: string | null
  fechaVencimiento: string | null // YYYY-MM-DD
  /** Charlie lo marca a simple vista: el sistema no puede inferir daño físico. */
  danado: boolean
  /** Charlie lo marca cuando lo que llegó no es el producto de esta línea. */
  productoErroneo: boolean
}

export type ClasificacionLinea = {
  estadoCalidad: EstadoCalidad
  tipoDiscrepancia: TipoDiscrepancia
  /** Sugerido según la matriz estándar — el responsable de Almacén puede ajustarlo. */
  cantidadAceptada: number
  cantidadRechazada: number
}

/** Meses completos entre dos fechas ISO (año+mes, sin contar días sueltos). */
export function mesesEntre(desdeISO: string, hastaISO: string): number {
  const [y1, m1] = desdeISO.split('-').map(Number)
  const [y2, m2] = hastaISO.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

/**
 * Clasifica una línea de recepción.
 *
 * Precedencia cuando aplica más de una condición: producto erróneo (nunca es
 * el que se pidió, no importa nada más) > vencido > dañado > por vencer >
 * lote no informado > faltante/sobrante > ninguna. Vencido pesa más que
 * dañado porque "nunca se recibe producto vencido" (matriz estándar) es una
 * regla sin excepción; dañado sí puede tener autorización puntual.
 */
export function clasificarLinea(
  input: LineaRecepcionInput & { fechaRecepcion: string },
  producto: ProductoParaRecepcion
): ClasificacionLinea {
  let estadoCalidad: EstadoCalidad = input.danado ? 'danado' : 'bueno'

  if (producto.controlaVencimiento && input.fechaVencimiento) {
    if (input.fechaVencimiento < input.fechaRecepcion) {
      estadoCalidad = 'vencido'
    } else if (estadoCalidad !== 'danado') {
      const meses = mesesEntre(input.fechaRecepcion, input.fechaVencimiento)
      if (meses < producto.mesesVidaUtilMinima) estadoCalidad = 'por_vencer'
    }
  }

  let tipoDiscrepancia: TipoDiscrepancia
  if (input.productoErroneo) tipoDiscrepancia = 'producto_erroneo'
  else if (estadoCalidad === 'vencido') tipoDiscrepancia = 'vencido'
  else if (estadoCalidad === 'danado') tipoDiscrepancia = 'danado'
  else if (estadoCalidad === 'por_vencer') tipoDiscrepancia = 'por_vencer'
  else if (producto.controlaLote && !input.lote) tipoDiscrepancia = 'lote_no_informado'
  else if (input.cantidadFisica < input.cantidadPedidaPendiente) tipoDiscrepancia = 'faltante'
  else if (input.cantidadFisica > input.cantidadPedidaPendiente) tipoDiscrepancia = 'sobrante'
  else tipoDiscrepancia = 'ninguna'

  const { cantidadAceptada, cantidadRechazada } = accionSugerida(
    tipoDiscrepancia,
    input.cantidadFisica,
    input.cantidadPedidaPendiente
  )

  return { estadoCalidad, tipoDiscrepancia, cantidadAceptada, cantidadRechazada }
}

/**
 * Cantidad aceptada/rechazada según la acción estándar de
 * `almacen.matriz_resolucion_discrepancias` — el texto de esa tabla es la
 * única fuente de verdad de lo que dice cada acción; esto solo traduce la
 * acción a números para que la recepción tenga un valor por defecto sin
 * esperar a que el responsable de Almacén resuelva cada línea a mano.
 */
function accionSugerida(
  tipo: TipoDiscrepancia,
  cantidadFisica: number,
  cantidadPedida: number
): { cantidadAceptada: number; cantidadRechazada: number } {
  switch (tipo) {
    // "Nunca se recibe producto vencido" / rechazo total.
    case 'vencido':
    case 'danado':
    case 'producto_erroneo':
    // "Rechazo salvo autorización puntual" — el default es rechazar.
    case 'por_vencer':
      return { cantidadAceptada: 0, cantidadRechazada: cantidadFisica }
    case 'sobrante': {
      const aceptada = Math.min(cantidadFisica, cantidadPedida)
      return { cantidadAceptada: aceptada, cantidadRechazada: cantidadFisica - aceptada }
    }
    // "Recibir lo físico real" / "recibir con observación": se acepta todo
    // lo que llegó, la diferencia con lo pedido queda como discrepancia
    // informativa, no como rechazo.
    case 'faltante':
    case 'lote_no_informado':
    case 'ninguna':
    default:
      return { cantidadAceptada: cantidadFisica, cantidadRechazada: 0 }
  }
}

/**
 * ¿La recepción entera puede cerrarse como conforme? Solo si ninguna línea
 * tiene una discrepancia todavía sin resolución del responsable de Almacén.
 * Una línea sin discrepancia ('ninguna') nunca bloquea el cierre.
 */
export function recepcionQuedaConforme(
  items: readonly { tipoDiscrepancia: TipoDiscrepancia; resuelta: boolean }[]
): boolean {
  return items.every((i) => i.tipoDiscrepancia === 'ninguna' || i.resuelta)
}

export type ErrorValidacion = { campo: string; mensaje: string }

export type LineaBorradorRecepcion = {
  ocItemId: string
  cantidadFisica: number
  cantidadGuia: number | null
  lote: string | null
  fechaVencimiento: string | null
  danado: boolean
  productoErroneo: boolean
  controlaLote: boolean
  controlaVencimiento: boolean
}

export type BorradorRecepcion = {
  ocId: string
  fechaRecepcion: string
  guiaRemision: string | null
  lineas: readonly LineaBorradorRecepcion[]
}

/**
 * Valida antes de tocar la base. Devuelve TODOS los errores, no el primero.
 *
 * A propósito NO exige lote cuando el producto lo controla: la ausencia de
 * lote es una discrepancia clasificada ('lote_no_informado'), no un motivo
 * para bloquear el registro — Charlie tiene que poder guardar igual lo que
 * llegó. La fecha de vencimiento sí se exige cuando el producto la controla:
 * no hay un tipo de discrepancia "vencimiento no informado" en la matriz, así
 * que sin el dato el sistema no podría clasificar la línea en absoluto.
 */
export function validarRecepcion(borrador: BorradorRecepcion): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []

  if (!borrador.ocId) errores.push({ campo: 'ocId', mensaje: 'Falta la orden de compra.' })
  if (!borrador.fechaRecepcion) {
    errores.push({ campo: 'fechaRecepcion', mensaje: 'Falta la fecha de recepción.' })
  }

  const conCantidad = borrador.lineas.filter((l) => l.cantidadFisica > 0)
  if (conCantidad.length === 0) {
    errores.push({
      campo: 'lineas',
      mensaje: 'Registra la cantidad física recibida de al menos un producto.',
    })
  }

  borrador.lineas.forEach((l, i) => {
    if (l.cantidadFisica < 0) {
      errores.push({ campo: `lineas.${i}.cantidadFisica`, mensaje: 'No puede ser negativa.' })
    }
    if (l.cantidadFisica > 0 && l.controlaVencimiento && !l.fechaVencimiento) {
      errores.push({
        campo: `lineas.${i}.fechaVencimiento`,
        mensaje: 'Este producto exige fecha de vencimiento al recibir.',
      })
    }
  })

  return errores
}
