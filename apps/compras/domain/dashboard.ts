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

/**
 * Alerta de OC parcial hace demasiado tiempo (loop abierto nuevo): días
 * corridos desde `fecha_emision`, comparado contra el umbral configurable
 * en `compras.configuracion` (clave 'oc_parcial_alerta_dias', ver
 * 0031_configuracion.sql). Se usa `fecha_emision` como ancla porque el
 * modelo de datos no guarda la fecha exacta en que la OC pasó a
 * 'parcialmente_recibida' (misma brecha ya documentada en
 * services/historial-orden.ts para otras transiciones sin columna propia)
 * — es una aproximación conservadora: la OC lleva AL MENOS ese tiempo
 * parcial, nunca menos.
 */
export function diasEnEstado(fechaDesdeISO: string, hoyISO: string): number {
  const desde = new Date(`${fechaDesdeISO.slice(0, 10)}T00:00:00Z`)
  const hoy = new Date(`${hoyISO.slice(0, 10)}T00:00:00Z`)
  return Math.round((hoy.getTime() - desde.getTime()) / 86_400_000)
}

export function ocParcialSuperaUmbral(diasEnParcial: number, umbralDias: number): boolean {
  return diasEnParcial > umbralDias
}
