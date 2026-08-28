/**
 * Reglas de Financiamiento (préstamos, fraccionamiento SUNAT, letras por
 * pagar) e Impuestos. Puro: sin Next, sin Supabase, testeable solo.
 *
 * Lenguaje Ubicuo: un Préstamo y un Fraccionamiento SUNAT son deudas con
 * Cronograma pactado — una tabla de Cuotas con capital e interés ya
 * definidos por el banco o por la resolución de SUNAT. El sistema NUNCA
 * calcula ese cronograma (ninguna fórmula de amortización): cada cuota se
 * transcribe tal como figura en el documento real, mismo criterio que el
 * IGV de un comprobante en domain/gasto.ts — no se inventa un número que
 * un documento externo ya define.
 *
 * Una Letra por Pagar es el Canje de una factura de compra ya existente
 * (una obligación que ya estaba en `cuentas_x_pagar.obligaciones`) por una
 * o más letras con vencimiento futuro — no es un gasto nuevo, es la misma
 * deuda partida en plazos.
 */

export type Moneda = 'PEN' | 'USD'
export type ErrorValidacion = { campo: string; mensaje: string }

export type BorradorCuota = {
  numeroCuota: number
  fechaVencimiento: string
  montoCapital: number
  montoInteres: number
}

export function validarCuotas(cuotas: readonly BorradorCuota[]): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (cuotas.length === 0) {
    errores.push({ campo: 'cuotas', mensaje: 'Agrega al menos una cuota del cronograma.' })
    return errores
  }
  const numeros = new Set<number>()
  cuotas.forEach((c, i) => {
    if (!(c.numeroCuota > 0)) errores.push({ campo: `cuotas.${i}.numeroCuota`, mensaje: `Cuota ${i + 1}: el número tiene que ser mayor a 0.` })
    if (numeros.has(c.numeroCuota)) errores.push({ campo: `cuotas.${i}.numeroCuota`, mensaje: `Cuota ${i + 1}: el número ${c.numeroCuota} está repetido.` })
    numeros.add(c.numeroCuota)
    if (!c.fechaVencimiento) errores.push({ campo: `cuotas.${i}.fechaVencimiento`, mensaje: `Cuota ${i + 1}: falta la fecha de vencimiento.` })
    if (!(Number(c.montoCapital) > 0)) errores.push({ campo: `cuotas.${i}.montoCapital`, mensaje: `Cuota ${i + 1}: el capital tiene que ser mayor a 0.` })
    if (Number(c.montoInteres) < 0) errores.push({ campo: `cuotas.${i}.montoInteres`, mensaje: `Cuota ${i + 1}: el interés no puede ser negativo.` })
  })
  return errores
}

export type BorradorPrestamo = {
  entidadFinanciera: string
  numeroPrestamo?: string | null
  montoOriginal: number
  moneda: Moneda
  tasaInteresAnual?: number | null
  fechaDesembolso?: string | null
  cuotas: BorradorCuota[]
}

export function validarPrestamo(b: BorradorPrestamo): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (!b.entidadFinanciera.trim()) errores.push({ campo: 'entidadFinanciera', mensaje: 'Falta la entidad financiera.' })
  if (!(Number(b.montoOriginal) > 0)) errores.push({ campo: 'montoOriginal', mensaje: 'El monto original tiene que ser mayor a 0.' })
  if (b.moneda !== 'PEN' && b.moneda !== 'USD') errores.push({ campo: 'moneda', mensaje: 'La moneda tiene que ser PEN o USD.' })
  return [...errores, ...validarCuotas(b.cuotas)]
}

export type BorradorFraccionamiento = {
  numeroExpediente: string
  tipo?: string | null
  /** Qué impuesto se está fraccionando (IGV, Renta, ITAN…) — catálogo de
   * impuestos.tipos_impuesto. Distinto de `tipo`, que es la MODALIDAD del
   * fraccionamiento (IGV Justo, REFT), texto libre. */
  tipoImpuestoId?: string | null
  deudaOriginal: number
  tasaInteresMoratorio?: number | null
  fechaResolucion?: string | null
  fechaResolucionObligatoria?: string | null
  cuotas: BorradorCuota[]
}

export function validarFraccionamiento(b: BorradorFraccionamiento): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (!b.numeroExpediente.trim()) errores.push({ campo: 'numeroExpediente', mensaje: 'Falta el número de expediente.' })
  if (!(Number(b.deudaOriginal) > 0)) errores.push({ campo: 'deudaOriginal', mensaje: 'La deuda original tiene que ser mayor a 0.' })
  return [...errores, ...validarCuotas(b.cuotas)]
}

/**
 * Genera N cuotas de igual valor — una comodidad para arrancar el
 * cronograma manual rápido, NO un cálculo de amortización (eso sigue
 * prohibido, ver comentario del encabezado): el valor de cada cuota lo da
 * la persona, tal como figura en la resolución, y cada fila queda
 * editable después. `montoCapital` recibe el valor completo y
 * `montoInteres` queda en 0 — quien transcribe ajusta el desglose real si
 * la resolución lo separa.
 */
export function generarCuotasIguales(numeroCuotas: number, valorCuota: number, primerVencimiento?: string): BorradorCuota[] {
  const cuotas: BorradorCuota[] = []
  const base = primerVencimiento ? new Date(`${primerVencimiento}T00:00:00`) : null
  for (let i = 0; i < numeroCuotas; i++) {
    let fechaVencimiento = ''
    if (base) {
      const f = new Date(base)
      f.setMonth(f.getMonth() + i)
      fechaVencimiento = f.toISOString().slice(0, 10)
    }
    cuotas.push({ numeroCuota: i + 1, fechaVencimiento, montoCapital: valorCuota, montoInteres: 0 })
  }
  return cuotas
}

export type BorradorLetra = {
  numero?: string | null
  monto: number
  fechaVencimiento: string
  bancoNegociacion?: string | null
}

/**
 * Regla 8: el canje reemplaza exactamente la obligación original — las
 * letras tienen que sumar lo mismo que se está canjeando (con una
 * tolerancia de centavo por redondeo), ni más ni menos. Si no calzan, algo
 * está mal transcrito.
 */
export function validarLetras(letras: readonly BorradorLetra[], montoObligacion: number): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (letras.length === 0) {
    errores.push({ campo: 'letras', mensaje: 'Agrega al menos una letra.' })
    return errores
  }
  letras.forEach((l, i) => {
    if (!(Number(l.monto) > 0)) errores.push({ campo: `letras.${i}.monto`, mensaje: `Letra ${i + 1}: el monto tiene que ser mayor a 0.` })
    if (!l.fechaVencimiento) errores.push({ campo: `letras.${i}.fechaVencimiento`, mensaje: `Letra ${i + 1}: falta la fecha de vencimiento.` })
  })
  const suma = redondear(letras.reduce((acc, l) => acc + (Number(l.monto) || 0), 0))
  if (Math.abs(suma - redondear(montoObligacion)) > 0.01) {
    errores.push({
      campo: 'letras',
      mensaje: `Las letras suman ${suma.toFixed(2)} y la obligación es ${montoObligacion.toFixed(2)} — tienen que coincidir.`,
    })
  }
  return errores
}

export type TipoVencimiento = 'prestamo' | 'fraccionamiento' | 'letra'

export type VencimientoProximo = {
  tipo: TipoVencimiento
  id: string
  etiqueta: string
  fechaVencimiento: string
  monto: number
  moneda: Moneda
}

/** Regla 10: sin cuota vencida "de verdad" en la base (no hay proceso programado que la marque así — ver services/financiamiento.ts) esto es lo que hace visible la alerta: pendiente + fecha ya pasada. */
export function estaVencida(fechaVencimiento: string, hoyISO: string): boolean {
  return fechaVencimiento < hoyISO
}

export const ETIQUETA_TIPO_VENCIMIENTO: Record<TipoVencimiento, string> = {
  prestamo: 'Cuota de préstamo',
  fraccionamiento: 'Cuota de fraccionamiento SUNAT',
  letra: 'Letra por pagar',
}

/**
 * Estado guardado en `prestamos_cuotas`/`fraccionamientos_sunat_cuotas`/
 * `letras_por_pagar`: 'pendiente' hasta que se genera su obligación,
 * 'en_propuesta' desde ahí en más (aunque la obligación recién esté
 * 'registrada' y todavía no entró a una propuesta de pago real — la
 * etiqueta lo deja claro para no leer un estado literal desactualizado),
 * 'pagada' cuando Tesorería ejecuta el pago.
 */
export const ETIQUETA_ESTADO_VENCIMIENTO: Record<string, string> = {
  pendiente: 'Pendiente',
  en_propuesta: 'En camino a pago',
  pagada: 'Pagada',
  protestada: 'Protestada',
  renovada: 'Renovada',
}

function redondear(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}
