/**
 * Reglas del Dashboard general. Puro: sin Next, sin Supabase, testeable
 * solo.
 *
 * Carta de Simplicidad UX, regla 5: "Todo proceso debe llegar a un estado
 * final visible. El dashboard general prioriza visualmente los 'loops
 * abiertos' (discrepancias sin resolver, viáticos sin rendir, facturas de
 * servicio sin conformidad) por encima de métricas bonitas." Este módulo
 * define qué cuenta como un loop abierto en cada Bounded Context — las
 * queries en services/dashboard.ts solo traen los datos crudos, la
 * decisión de qué es "abierto" vive acá.
 */

/**
 * Una línea de recepción con discrepancia queda "abierta" hasta que el
 * responsable de Almacén decide una acción (almacen.resoluciones_discrepancia)
 * — ver regla 2 del documento maestro.
 */
export function discrepanciaAbierta(tipoDiscrepancia: string | null, tieneResolucion: boolean): boolean {
  return !!tipoDiscrepancia && tipoDiscrepancia !== 'ninguna' && !tieneResolucion
}

/**
 * Una Orden de Servicio ya facturada queda "abierta" hasta que el área
 * usuaria (nunca Contabilidad) registra su conformidad — regla 5 del
 * documento maestro. `tieneConformidadPositiva` ya filtró `conforme = true`
 * (una conformidad registrada como `false` no cierra el loop).
 */
export function servicioSinConformidad(estadoOS: string, tieneConformidadPositiva: boolean): boolean {
  return estadoOS === 'facturada' && !tieneConformidadPositiva
}

/**
 * KPIs del dashboard (regla 5 del documento maestro admite además de los
 * "loops abiertos" un resumen numérico arriba, siempre que cada número siga
 * llevando a la pantalla real donde se resuelve — nunca una métrica muerta).
 * Cada monto va separado por moneda: nunca se suma PEN con USD.
 */
export type MontoPorMoneda = { moneda: string; monto: number; cantidad: number }

function redondear(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}

/** Agrupa una lista de {moneda, monto} en totales por moneda, con cantidad de filas. */
export function agruparPorMoneda(filas: readonly { moneda: string; monto: number }[]): MontoPorMoneda[] {
  const mapa = new Map<string, MontoPorMoneda>()
  for (const f of filas) {
    if (!mapa.has(f.moneda)) mapa.set(f.moneda, { moneda: f.moneda, monto: 0, cantidad: 0 })
    const g = mapa.get(f.moneda)!
    g.monto = redondear(g.monto + f.monto)
    g.cantidad += 1
  }
  return [...mapa.values()].sort((a, b) => b.monto - a.monto)
}

/** Una obligación vence "en los próximos 7 días" si diasVencido está en [-7, 0) — todavía no vencida pero cerca. */
export function venceEnProximosDias(diasVencido: number | null, ventanaDias: number): boolean {
  if (diasVencido == null) return false
  return diasVencido < 0 && diasVencido >= -ventanaDias
}

/** Una obligación está vencida si diasVencido > 0 (mismo criterio que bucketAntiguedad en domain/reportes.ts). */
export function estaVencidaObligacion(diasVencido: number | null): boolean {
  return diasVencido != null && diasVencido > 0
}
