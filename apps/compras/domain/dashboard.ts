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
