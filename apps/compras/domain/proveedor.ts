/**
 * Reglas puras de Proveedor — compartidas por compras.proveedores y
 * servicios.proveedores_servicio (misma forma de dato en las dos tablas,
 * ver docs/modulo-compras-pagos.md sección 1). Sin Next, sin Supabase,
 * testeable solo.
 */

/** RUC peruano: 11 dígitos exactos. Mismo criterio ya usado en
 * app/servicios/proveedores/nuevo/actions.ts — acá queda como función
 * pura y testeada para no repetir el regex a mano en cada formulario. */
export function validarRUC(ruc: string): boolean {
  return /^\d{11}$/.test(ruc.trim())
}

/** CCI (Código de Cuenta Interbancario) peruano: 20 dígitos exactos.
 * Mismo criterio que el check de compras.proveedor_cuentas_bancarias y
 * services/proveedores.ts::crearCuentaBancariaProveedor. */
export function validarCCI(cci: string): boolean {
  return /^\d{20}$/.test(cci.trim())
}

/** Enmascara un número de cuenta o CCI para listados — solo los últimos 4 dígitos visibles. */
export function enmascararCuenta(numero: string): string {
  const limpio = numero.trim()
  if (limpio.length <= 4) return limpio
  return `${'•'.repeat(limpio.length - 4)}${limpio.slice(-4)}`
}

export type ErrorValidacionProveedor = { campo: string; mensaje: string }

/** 'servicio' además de las 3 de compras.proveedores — un solo formulario de
 * alta para las dos tablas (ver services/proveedores-unificado.ts::crearProveedorUnificado),
 * la persona no tiene que saber de antemano en qué schema vive cada una. */
export type TipoProveedorUnificado = 'mercaderia' | 'bien' | 'ambos' | 'servicio'

export type BorradorProveedorUnificado = {
  tipo: TipoProveedorUnificado
  ruc: string
  razonSocial: string
  nombreComercial?: string
  contactoNombre?: string
  contactoEmail?: string
  contactoTelefono?: string
  condicionPagoDias: number
  monedaPrincipal: string
}

const TIPOS_PROVEEDOR_UNIFICADO: readonly TipoProveedorUnificado[] = ['mercaderia', 'bien', 'ambos', 'servicio']

export function validarProveedor(b: BorradorProveedorUnificado): ErrorValidacionProveedor[] {
  const errores: ErrorValidacionProveedor[] = []
  if (!TIPOS_PROVEEDOR_UNIFICADO.includes(b.tipo)) {
    errores.push({ campo: 'tipo', mensaje: 'Elige qué le compras a este proveedor.' })
  }
  if (!validarRUC(b.ruc)) errores.push({ campo: 'ruc', mensaje: 'El RUC tiene que tener 11 dígitos.' })
  if (!b.razonSocial.trim()) errores.push({ campo: 'razonSocial', mensaje: 'Escribe la razón social.' })
  if (b.condicionPagoDias < 0) errores.push({ campo: 'condicionPagoDias', mensaje: 'Los días de condición de pago tienen que ser 0 o más.' })
  if (b.monedaPrincipal !== 'PEN' && b.monedaPrincipal !== 'USD') {
    errores.push({ campo: 'monedaPrincipal', mensaje: 'La moneda tiene que ser PEN o USD.' })
  }
  return errores
}

export type CuentaBancariaBorrador = {
  numeroCuenta: string
  cci: string
  titular: string
  /** Opcionales acá para no romper a los llamadores viejos; el alta
   * completa los exige vía `validarCuentaBancariaCompleta`. */
  banco?: string
  moneda?: string
}

export function validarCuentaBancaria(b: CuentaBancariaBorrador): ErrorValidacionProveedor[] {
  const errores: ErrorValidacionProveedor[] = []
  if (!b.numeroCuenta.trim()) errores.push({ campo: 'numeroCuenta', mensaje: 'Falta el número de cuenta.' })
  if (!validarCCI(b.cci)) errores.push({ campo: 'cci', mensaje: 'El CCI tiene que tener 20 dígitos.' })
  if (!b.titular.trim()) errores.push({ campo: 'titular', mensaje: 'Falta el titular de la cuenta.' })
  return errores
}

/**
 * Igual que `validarCuentaBancaria` más el banco y la moneda, que la tabla
 * exige (`banco not null`, `moneda check (PEN|USD)`) y que hasta ahora se
 * chequeaban sueltos en el servicio.
 */
export function validarCuentaBancariaCompleta(b: CuentaBancariaBorrador): ErrorValidacionProveedor[] {
  const errores = validarCuentaBancaria(b)
  if (!b.banco?.trim()) errores.push({ campo: 'banco', mensaje: 'Falta el banco.' })
  if (b.moneda !== 'PEN' && b.moneda !== 'USD') {
    errores.push({ campo: 'monedaCuenta', mensaje: 'La moneda de la cuenta tiene que ser PEN o USD.' })
  }
  return errores
}

/**
 * Alta COMPLETA de proveedor (`/proveedores/nuevo`): además de los datos
 * del proveedor exige una cuenta bancaria. Antes la cuenta solo se podía
 * cargar después de crearlo, desde su ficha — y así quedaban proveedores
 * sin forma de pagarles, que recién se descubría cuando había que pagar.
 *
 * El alta RÁPIDA desde el combobox (crearProveedorRapidoAction) sigue
 * usando `validarProveedor` a secas: ahí la persona está en medio de una OC
 * y frenarla a pedir el CCI cuesta más de lo que resuelve. Esos quedan
 * marcados como incompletos hasta que alguien les cargue la cuenta.
 */
export function validarAltaCompleta(
  b: BorradorProveedorUnificado,
  cuenta: CuentaBancariaBorrador
): ErrorValidacionProveedor[] {
  return [...validarProveedor(b), ...validarCuentaBancariaCompleta(cuenta)]
}

/** Un proveedor sin ninguna cuenta bancaria cargada — no se le puede pagar. */
export function faltaCuentaBancaria(cantidadCuentas: number): boolean {
  return cantidadCuentas === 0
}

export type FuenteProveedor = 'compra' | 'servicio'

export const ETIQUETA_FUENTE_PROVEEDOR: Record<FuenteProveedor, string> = {
  compra: 'Mercadería / bienes',
  servicio: 'Servicios',
}

/**
 * Un proveedor con movimientos reales (al menos una OC u OS emitida)
 * nunca se borra — solo se puede desactivar (activo=false, soft). Si
 * además tiene movimientos, desactivar es una decisión que hay que avisar
 * explícitamente (Carta de Simplicidad: nunca ocultar una consecuencia).
 */
export function puedeDesactivarseSinAviso(tieneMovimientos: boolean): boolean {
  return !tieneMovimientos
}
