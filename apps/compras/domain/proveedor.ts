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

export type BorradorProveedorUnificado = {
  ruc: string
  razonSocial: string
  condicionPagoDias: number
  monedaPrincipal: string
}

export function validarProveedor(b: BorradorProveedorUnificado): ErrorValidacionProveedor[] {
  const errores: ErrorValidacionProveedor[] = []
  if (!validarRUC(b.ruc)) errores.push({ campo: 'ruc', mensaje: 'El RUC tiene que tener 11 dígitos.' })
  if (!b.razonSocial.trim()) errores.push({ campo: 'razonSocial', mensaje: 'Escribe la razón social.' })
  if (b.condicionPagoDias < 0) errores.push({ campo: 'condicionPagoDias', mensaje: 'Los días de condición de pago tienen que ser 0 o más.' })
  if (b.monedaPrincipal !== 'PEN' && b.monedaPrincipal !== 'USD') {
    errores.push({ campo: 'monedaPrincipal', mensaje: 'La moneda tiene que ser PEN o USD.' })
  }
  return errores
}

export type CuentaBancariaBorrador = { numeroCuenta: string; cci: string; titular: string }

export function validarCuentaBancaria(b: CuentaBancariaBorrador): ErrorValidacionProveedor[] {
  const errores: ErrorValidacionProveedor[] = []
  if (!b.numeroCuenta.trim()) errores.push({ campo: 'numeroCuenta', mensaje: 'Falta el número de cuenta.' })
  if (!validarCCI(b.cci)) errores.push({ campo: 'cci', mensaje: 'El CCI tiene que tener 20 dígitos.' })
  if (!b.titular.trim()) errores.push({ campo: 'titular', mensaje: 'Falta el titular de la cuenta.' })
  return errores
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
