/**
 * El proveedor comodín del backlog pre-ERP. Puro.
 *
 * Sebas está regularizando retiros anteriores al ERP y de algunos no sabe a
 * qué proveedor correspondían. En vez de inventar un RUC por caso —que
 * después, en un reporte, se ve idéntico a un proveedor real— todos apuntan
 * a un único comodín con nombre explícito.
 *
 * Se identifica por RUC y no por id: el id es de esta base y cambiaría en
 * cualquier otro entorno, el RUC es el dato de negocio.
 */
export const RUC_SIN_IDENTIFICAR = '00000000000'

export const RAZON_SOCIAL_SIN_IDENTIFICAR = 'SIN IDENTIFICAR — Backlog pre-ERP'

export function esProveedorSinIdentificar(ruc: string | null | undefined): boolean {
  return ruc?.trim() === RUC_SIN_IDENTIFICAR
}

/**
 * Cuánto hay pendiente de investigar, por moneda. Nunca un número único
 * mezclando PEN y USD — mismo criterio que el resto del módulo.
 */
export function totalPendienteDeIdentificar(
  filas: readonly { moneda: string; monto: number }[]
): { moneda: string; monto: number }[] {
  const mapa = new Map<string, number>()
  for (const f of filas) mapa.set(f.moneda, (mapa.get(f.moneda) ?? 0) + f.monto)
  return [...mapa.entries()]
    .map(([moneda, monto]) => ({ moneda, monto: Math.round(monto * 100) / 100 }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}

/**
 * Una obligación con el comodín que NO es del backlog es una señal: alguien
 * lo eligió para un pago normal en vez de cargar el proveedor de verdad.
 *
 * Se detecta por la categoría: el comodín existe solo para la categoría
 * temporal "Regularización de pagos antiguos (pre-ERP)". Cualquier otra
 * combinación es uso fuera de alcance y hay que corregirla antes de que se
 * pierda el rastro del proveedor real.
 */
export const CATEGORIA_BACKLOG = 'Regularización de pagos antiguos (pre-ERP)'

export function esUsoFueraDelBacklog(categoria: string | null): boolean {
  return (categoria ?? '').trim() !== CATEGORIA_BACKLOG
}
