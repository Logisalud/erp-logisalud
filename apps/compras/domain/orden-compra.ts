/**
 * Reglas de la Orden de Compra. Puro: sin Next, sin Supabase, testeable solo.
 *
 * Lenguaje Ubicuo: una Orden de Compra (OC) es el compromiso formal de comprar
 * a un proveedor. Nace en `borrador`, se `envía` al proveedor, él la
 * `confirma`, Almacén la recibe (`parcialmente_recibida` /
 * `recibida_completa`), Cuentas por Pagar la `factura`, y se `cierra`.
 */

export const ESTADOS_OC = [
  'borrador',
  'enviada',
  'confirmada',
  'parcialmente_recibida',
  'recibida_completa',
  'facturada',
  'cerrada',
  'anulada',
] as const

export type EstadoOC = (typeof ESTADOS_OC)[number]

export const MONEDAS = ['PEN', 'USD'] as const
export type Moneda = (typeof MONEDAS)[number]

/** Etiqueta para pantalla. La base guarda el valor técnico. */
export const ETIQUETA_ESTADO: Record<EstadoOC, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada al proveedor',
  confirmada: 'Confirmada',
  parcialmente_recibida: 'Recibida en parte',
  recibida_completa: 'Recibida completa',
  facturada: 'Facturada',
  cerrada: 'Cerrada',
  anulada: 'Anulada',
}

/**
 * A qué estados se puede pasar desde cada uno.
 *
 * Los estados de recepción (parcialmente_recibida, recibida_completa) NO se
 * ponen a mano: los calcula Almacén al registrar lo que llegó. Por eso no
 * salen de `confirmada` acá — esa transición la hará el módulo de Almacén.
 */
const TRANSICIONES: Record<EstadoOC, readonly EstadoOC[]> = {
  borrador: ['enviada', 'anulada'],
  enviada: ['confirmada', 'borrador', 'anulada'],
  confirmada: ['anulada'],
  parcialmente_recibida: [],
  recibida_completa: [],
  facturada: ['cerrada'],
  cerrada: [],
  anulada: [],
}

export function transicionPermitida(desde: EstadoOC, hacia: EstadoOC): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

/** Solo una OC que el proveedor ya confirmó puede empezar a recibirse. */
export function puedeRecibirse(estado: EstadoOC): boolean {
  return estado === 'confirmada' || estado === 'parcialmente_recibida'
}

/**
 * Estado de la OC después de registrar una recepción — lo decide Almacén al
 * recibir, nunca una persona a mano (ver comentario de TRANSICIONES).
 */
export function estadoTrasRecepcion(todosLosItemsCompletos: boolean): EstadoOC {
  return todosLosItemsCompletos ? 'recibida_completa' : 'parcialmente_recibida'
}

/**
 * Cuando Cuentas por Pagar registra una obligación con líneas de esta OC:
 * si con eso ya se facturó todo lo pedido, la OC pasa a 'facturada' sola —
 * nadie la marca a mano. Si no, el estado no se toca acá (lo sigue
 * gobernando la recepción, ver estadoTrasRecepcion): facturar una línea no
 * debería adelantar el estado de recepción de las demás.
 */
export function puedeMarcarseFacturada(todosLosItemsFacturados: boolean): boolean {
  return todosLosItemsFacturados
}

/**
 * Una OC solo se puede editar mientras el proveedor no la haya confirmado.
 * Después, cambiarle las líneas dejaría a Almacén recibiendo contra una
 * cantidad distinta de la que se pidió.
 */
export function puedeEditarse(estado: EstadoOC): boolean {
  return estado === 'borrador' || estado === 'enviada'
}

export type LineaOC = {
  cantidadPedida: number
  precioUnitario: number
}

export type TotalesOC = {
  subtotal: number
  igv: number
  total: number
}

/** IGV peruano. Vive acá y no hardcodeado en la vista. */
export const TASA_IGV = 0.18

/**
 * Totales de la OC.
 *
 * Se redondea a 2 decimales en cada paso y no solo al final: es lo que hace el
 * proveedor en su factura, y si acá se acumulan decimales el total no le cuadra
 * al céntimo con el documento que llega. `precio_unitario` admite 4 decimales
 * (las listas de precios los traen), así que la diferencia es real.
 */
export function calcularTotales(lineas: readonly LineaOC[]): TotalesOC {
  const subtotal = redondear(
    lineas.reduce((acc, l) => acc + redondear(l.cantidadPedida * l.precioUnitario), 0)
  )
  const igv = redondear(subtotal * TASA_IGV)
  return { subtotal, igv, total: redondear(subtotal + igv) }
}

export function redondear(n: number): number {
  // Math.round(x * 100) / 100 falla para casos como 1.005 por el binario.
  // El desplazamiento por notación exponencial evita ese error.
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}

export type ErrorValidacion = { campo: string; mensaje: string }

/** 'mercaderia' = catálogo para revender (producto_id). 'bien' = no es para
 * revender (equipos, muebles) — no vive en catalogo.productos, va con texto
 * libre por línea. */
export const TIPOS_OC = ['mercaderia', 'bien'] as const
export type TipoOC = (typeof TIPOS_OC)[number]

export type LineaOCMercaderia = LineaOC & { productoId: string }
export type LineaOCBien = LineaOC & { descripcionLibre: string }

export type BorradorOC = {
  proveedorId: string
  fechaEmision: string
  fechaEntregaEstimada?: string | null
  moneda: string
  condicionesPagoDias?: number | null
  tipo?: TipoOC
  lineas: readonly (LineaOCMercaderia | LineaOCBien)[]
}

function esLineaBien(l: LineaOCMercaderia | LineaOCBien): l is LineaOCBien {
  return 'descripcionLibre' in l
}

/**
 * Valida antes de tocar la base. Devuelve TODOS los errores, no el primero:
 * un formulario que corrige de a un error por vez es una pantalla que la gente
 * abandona.
 */
export function validarOC(oc: BorradorOC): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []

  if (!oc.proveedorId) {
    errores.push({ campo: 'proveedorId', mensaje: 'Elige un proveedor.' })
  }
  if (!oc.fechaEmision) {
    errores.push({ campo: 'fechaEmision', mensaje: 'Pon la fecha de emisión.' })
  }
  if (!MONEDAS.includes(oc.moneda as Moneda)) {
    errores.push({ campo: 'moneda', mensaje: 'La moneda tiene que ser PEN o USD.' })
  }
  if (
    oc.fechaEntregaEstimada &&
    oc.fechaEmision &&
    oc.fechaEntregaEstimada < oc.fechaEmision
  ) {
    errores.push({
      campo: 'fechaEntregaEstimada',
      mensaje: 'La entrega no puede ser antes de la emisión.',
    })
  }
  if (oc.condicionesPagoDias != null && oc.condicionesPagoDias < 0) {
    errores.push({ campo: 'condicionesPagoDias', mensaje: 'Los días no pueden ser negativos.' })
  }

  if (oc.lineas.length === 0) {
    errores.push({
      campo: 'lineas',
      mensaje: oc.tipo === 'bien' ? 'Agrega al menos un bien.' : 'Agrega al menos un producto.',
    })
  }

  oc.lineas.forEach((l, i) => {
    if (esLineaBien(l)) {
      if (!l.descripcionLibre.trim()) {
        errores.push({ campo: `lineas.${i}.descripcionLibre`, mensaje: 'Describe el bien.' })
      }
    } else if (!l.productoId) {
      errores.push({ campo: `lineas.${i}.productoId`, mensaje: 'Falta el producto.' })
    }
    if (!(l.cantidadPedida > 0)) {
      errores.push({ campo: `lineas.${i}.cantidadPedida`, mensaje: 'La cantidad tiene que ser mayor a 0.' })
    }
    if (l.precioUnitario < 0) {
      errores.push({ campo: `lineas.${i}.precioUnitario`, mensaje: 'El precio no puede ser negativo.' })
    }
  })

  // Un producto repetido en dos líneas rompe la recepción: Almacén no sabría
  // contra cuál de las dos descargar lo que llegó. Solo aplica a mercadería —
  // un bien no tiene identidad de catálogo contra la cual chocar.
  const vistos = new Set<string>()
  oc.lineas.forEach((l, i) => {
    if (!esLineaBien(l) && l.productoId) {
      if (vistos.has(l.productoId)) {
        errores.push({
          campo: `lineas.${i}.productoId`,
          mensaje: 'Este producto ya está en otra línea. Suma las cantidades en una sola.',
        })
      }
      vistos.add(l.productoId)
    }
  })

  return errores
}

/**
 * Siguiente código de OC. Formato OC-AAAA-NNNN, correlativo por año.
 *
 * Recibe el último código del año en vez de contar filas: contar filas daría
 * el mismo número dos veces si una OC se borrara, y `codigo` es unique.
 */
export function siguienteCodigoOC(anio: number, ultimoCodigoDelAnio: string | null): string {
  const correlativo = ultimoCodigoDelAnio
    ? Number(ultimoCodigoDelAnio.slice(-4)) + 1
    : 1
  return `OC-${anio}-${String(correlativo).padStart(4, '0')}`
}
