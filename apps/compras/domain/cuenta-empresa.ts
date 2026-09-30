/**
 * Las cuentas bancarias PROPIAS de Logisalud: de cuál sale cada pago.
 * Puro — sin Next, sin Supabase. Ver migración 0075.
 */

export type CuentaEmpresa = {
  id: string
  codigoInterno: string
  nombre: string
  banco: string
  numeroCuenta: string
  moneda: string
  esPredeterminada: boolean
}

/**
 * Qué cuenta aparece elegida al abrir el formulario de pago.
 *
 * Sebas pidió que por defecto sea la 79 (CF010, BCP SOLES 1), y así es para
 * todo pago en soles. La excepción es un pago en DÓLARES: ofrecerle a
 * Tesorería una cuenta en soles por defecto haría que en cada pago en USD
 * tenga que acordarse de cambiarla, y el día que no se acuerde el sistema
 * dice que salió de una cuenta de la que no salió. Para esos se propone la
 * cuenta de la misma moneda.
 *
 * Es solo lo que viene PRESELECCIONADO: el desplegable muestra las cuatro
 * igual, porque pagar en USD desde soles (con cambio) es posible y no le toca
 * al sistema prohibirlo.
 *
 * Orden de preferencia:
 *   1. la predeterminada, si es de la moneda del pago;
 *   2. si no, la primera de esa moneda;
 *   3. si no hay ninguna de esa moneda, la predeterminada igual;
 *   4. si no hay predeterminada, la primera.
 */
export function cuentaEmpresaPorDefecto(
  cuentas: readonly CuentaEmpresa[],
  monedaDelPago: string
): CuentaEmpresa | null {
  if (cuentas.length === 0) return null
  const predeterminada = cuentas.find((c) => c.esPredeterminada) ?? null
  if (predeterminada && predeterminada.moneda === monedaDelPago) return predeterminada
  const deEsaMoneda = cuentas.find((c) => c.moneda === monedaDelPago)
  if (deEsaMoneda) return deEsaMoneda
  return predeterminada ?? cuentas[0]
}

/** "BCP SOLES 1 — 1917315019079" — la forma en que se muestra en todos lados. */
export function etiquetaCuentaEmpresa(c: Pick<CuentaEmpresa, 'nombre' | 'numeroCuenta'>): string {
  return `${c.nombre} — ${c.numeroCuenta}`
}
