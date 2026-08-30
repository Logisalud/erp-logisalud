/**
 * Reglas de la Obligación. Puro: sin Next, sin Supabase, testeable solo.
 *
 * Lenguaje Ubicuo: una Obligación es cualquier deuda pendiente de pago, sin
 * importar su origen (sección 4 del documento maestro, "La regla de oro").
 * Este PR solo puede CREAR obligaciones con `origen = 'compra'` — las demás
 * (servicio, gasto_directo, anticipo, reposicion_caja_chica, préstamo,
 * fraccionamiento, letra, impuesto) dependen de módulos que todavía no
 * existen como pantalla (Servicios, Gastos, Caja Chica, Financiamiento,
 * Impuestos), aunque el campo `origen` ya soporta los diez valores desde el
 * modelo de datos.
 */

export const ESTADOS_OBLIGACION = [
  'registrada',
  'observada',
  'conforme',
  'en_propuesta',
  'pagada',
  'cerrada',
  'canjeada_por_letra',
] as const
export type EstadoObligacion = (typeof ESTADOS_OBLIGACION)[number]

export const ETIQUETA_ESTADO: Record<EstadoObligacion, string> = {
  registrada: 'Registrada',
  observada: 'Observada',
  conforme: 'Conforme',
  en_propuesta: 'En propuesta de pago',
  pagada: 'Pagada',
  cerrada: 'Cerrada',
  canjeada_por_letra: 'Canjeada por letra',
}

/**
 * A qué estados se puede pasar desde cada uno.
 *
 * `en_propuesta` y `pagada` NO se ponen a mano: los pone Tesorería al armar
 * la propuesta y al ejecutar el pago (ver services/propuestas.ts y
 * services/pagos.ts) — por eso no salen de `conforme` acá, igual que las
 * transiciones de recepción de Almacén no salen a mano de `confirmada` en
 * domain/orden-compra.ts.
 */
const TRANSICIONES: Record<EstadoObligacion, readonly EstadoObligacion[]> = {
  registrada: ['observada', 'conforme'],
  observada: ['conforme'],
  conforme: ['canjeada_por_letra'],
  en_propuesta: [],
  pagada: ['cerrada'],
  cerrada: [],
  canjeada_por_letra: [],
}

export function transicionPermitida(desde: EstadoObligacion, hacia: EstadoObligacion): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

/** Solo Tesorería puede armar una propuesta con obligaciones en este estado. */
export function puedeEntrarAPropuesta(estado: EstadoObligacion): boolean {
  return estado === 'conforme'
}

/**
 * Regla de negocio 3 del documento maestro: la fecha de vencimiento del PAGO
 * se calcula desde la fecha de CONFORMIDAD de la recepción (nunca la fecha
 * de la OC ni la de la factura) más la condición de pago del proveedor (o de
 * la OC si la sobreescribe).
 */
export function calcularFechaVencimientoReal(fechaConformidadISO: string, condicionPagoDias: number): string {
  const fecha = new Date(`${fechaConformidadISO.slice(0, 10)}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + condicionPagoDias)
  return fecha.toISOString().slice(0, 10)
}

/** IGV peruano — mismo valor que domain/orden-compra.ts, la base ya viene sin IGV. */
export const TASA_IGV = 0.18

export function redondear(n: number): number {
  // Math.round(x * 100) / 100 falla para casos como 1.005 por el binario.
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}

/** `monto_detraccion` sugerido — el campo queda editable, esto es el default. */
export function calcularDetraccionSugerida(baseImponible: number, porcentaje: number): number {
  return redondear(baseImponible * (1 + TASA_IGV) * (porcentaje / 100))
}

/**
 * Regla 9: al aplicar una nota de crédito, el monto a pagar de la obligación
 * se reduce en ese valor al armar la propuesta de pago. Nunca por debajo de
 * cero: una NC más grande que lo que falta pagar es un error de captura, no
 * un saldo a favor que este módulo sepa devolver.
 */
export function montoAPagarConNotasCredito(netoAPagar: number, notasCreditoAplicadas: readonly number[]): number {
  const totalNC = notasCreditoAplicadas.reduce((acc, m) => acc + m, 0)
  return Math.max(0, redondear(netoAPagar - totalNC))
}

export type LineaConciliacion = {
  ocItemId: string
  cantidadPedida: number
  cantidadRecibida: number
  cantidadFacturada: number
  precioPactado: number
  precioFacturado: number
}

export type ResultadoConciliacion = {
  conforme: boolean
  discrepancias: { ocItemId: string; motivo: string }[]
}

const TOLERANCIA_PRECIO = 0.02 // 2%, regla de negocio 1

/**
 * Regla de negocio 1: conciliación de 3 vías para obligaciones de origen
 * 'compra'. Compara lo pedido, lo que Almacén recibió y lo que factura el
 * proveedor. Cualquier discrepancia manda la obligación a 'observada' en vez
 * de 'registrada' — Contabilidad la revisa antes de darle conformidad.
 *
 * La tolerancia de 2% es del PRECIO (variaciones de redondeo o tipo de
 * cambio entre lo pactado y la factura real); en CANTIDAD no hay tolerancia
 * — cualquier diferencia entre lo recibido y lo facturado es una discrepancia
 * real que alguien tiene que explicar, no un margen de error esperado.
 */
export function conciliarLineas(lineas: readonly LineaConciliacion[]): ResultadoConciliacion {
  const discrepancias: { ocItemId: string; motivo: string }[] = []

  for (const l of lineas) {
    if (l.cantidadFacturada !== l.cantidadRecibida) {
      discrepancias.push({
        ocItemId: l.ocItemId,
        motivo: `Facturado (${l.cantidadFacturada}) no coincide con lo recibido (${l.cantidadRecibida}).`,
      })
    }
    if (l.precioPactado > 0) {
      const desvio = Math.abs(l.precioFacturado - l.precioPactado) / l.precioPactado
      if (desvio > TOLERANCIA_PRECIO) {
        discrepancias.push({
          ocItemId: l.ocItemId,
          motivo: `Precio facturado (${l.precioFacturado}) se desvía más de 2% del pactado (${l.precioPactado}).`,
        })
      }
    }
  }

  return { conforme: discrepancias.length === 0, discrepancias }
}

/**
 * Sobrefacturación: nunca se puede facturar más de lo pedido en una línea
 * de OC, sumando todas las facturas ya registradas contra esa línea más la
 * que se está por registrar. A diferencia de conciliarLineas (que compara
 * contra lo RECIBIDO y solo observa la obligación para que Contabilidad la
 * revise), esto es un tope duro contra lo PEDIDO — Carta de Simplicidad:
 * no se autocorrige, se rechaza con un error explícito antes de guardar
 * nada.
 */
export type LineaFacturacion = {
  ocItemId: string
  cantidadPedida: number
  cantidadYaFacturada: number
  cantidadNuevaFactura: number
}

export type ErrorSobrefacturacion = { ocItemId: string; mensaje: string }

export function validarNoSobrefacturar(lineas: readonly LineaFacturacion[]): ErrorSobrefacturacion[] {
  const errores: ErrorSobrefacturacion[] = []
  for (const l of lineas) {
    const totalFacturado = redondear(l.cantidadYaFacturada + l.cantidadNuevaFactura)
    if (totalFacturado > l.cantidadPedida) {
      const disponible = Math.max(0, redondear(l.cantidadPedida - l.cantidadYaFacturada))
      errores.push({
        ocItemId: l.ocItemId,
        mensaje: `Esta línea solo tiene ${disponible} unidad(es) disponible(s) para facturar (pedido ${l.cantidadPedida}, ya facturado ${l.cantidadYaFacturada}) — no se puede facturar ${l.cantidadNuevaFactura}.`,
      })
    }
  }
  return errores
}

export type ErrorValidacion = { campo: string; mensaje: string }

export type BorradorObligacion = {
  proveedorId: string
  numeroFactura: string
  fechaFactura: string
  moneda: string
  tipoCambio?: number | null
  baseImponible: number
  tasaDetraccionId?: string | null
  montoDetraccion?: number | null
}

export function validarObligacion(b: BorradorObligacion): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []

  if (!b.proveedorId) errores.push({ campo: 'proveedorId', mensaje: 'Falta el proveedor.' })
  if (!b.numeroFactura.trim()) errores.push({ campo: 'numeroFactura', mensaje: 'Falta el número de factura.' })
  if (!b.fechaFactura) errores.push({ campo: 'fechaFactura', mensaje: 'Falta la fecha de factura.' })
  if (!(b.baseImponible > 0)) {
    errores.push({ campo: 'baseImponible', mensaje: 'La base imponible tiene que ser mayor a 0.' })
  }
  if (b.moneda !== 'PEN' && b.moneda !== 'USD') {
    errores.push({ campo: 'moneda', mensaje: 'La moneda tiene que ser PEN o USD.' })
  }
  if (b.moneda === 'USD' && !b.tipoCambio) {
    errores.push({ campo: 'tipoCambio', mensaje: 'En USD hace falta el tipo de cambio.' })
  }
  if (b.montoDetraccion != null && b.montoDetraccion < 0) {
    errores.push({ campo: 'montoDetraccion', mensaje: 'La detracción no puede ser negativa.' })
  }

  return errores
}

/**
 * "Pago directo" — origen `gasto_directo`: factura de un proveedor SIN
 * Orden de Compra ni Orden de Servicio (luz, agua, peajes, notaría,
 * seguros, courier…). El beneficiario es el proveedor, no un empleado —
 * distinto de gastos.solicitudes_gasto, que sí paga/reembolsa a un
 * empleado con su propia cadena de aprobación.
 *
 * Tope de S/5,000 (wording aprobado con Sebas 2026-08-28, "que la empresa
 * pague directo (menos de S/5,000)"): es lo que separa "pago directo" de
 * tener que pasar por una Orden de Compra o de Servicio formal. Solo se
 * exige en soles — no hay un tipo de cambio de referencia definido todavía
 * para convertir un monto en USD contra ese tope.
 */
export const TOPE_PAGO_DIRECTO_PEN = 5000

export type BorradorPagoDirecto = BorradorObligacion & {
  categoriaId: string
  descripcion: string
}

export function validarPagoDirecto(b: BorradorPagoDirecto): ErrorValidacion[] {
  const errores = validarObligacion(b)
  if (!b.categoriaId) errores.push({ campo: 'categoriaId', mensaje: 'Elige una categoría.' })
  if (!b.descripcion.trim()) errores.push({ campo: 'descripcion', mensaje: 'Cuenta para qué es este gasto.' })
  if (b.moneda === 'PEN' && b.baseImponible * (1 + TASA_IGV) >= TOPE_PAGO_DIRECTO_PEN) {
    errores.push({
      campo: 'baseImponible',
      mensaje: `Pago directo es para montos menores a S/${TOPE_PAGO_DIRECTO_PEN.toLocaleString('es-PE')} — con esto, la compra tiene que pasar por una Orden de Compra o de Servicio.`,
    })
  }
  return errores
}
