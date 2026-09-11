/**
 * Quién ve y quién aprueba una Propuesta de pago (Pieza I). Puro.
 *
 * Cambio de autoridad decidido en la sesión 2026-09-11: la policy original
 * decía que aprueba `gerencia` (una sola persona, Juan), y pasa a ser
 * Contabilidad rol admin (Mariela) o admin (Sebastián, Andrés) — cualquiera
 * de ellos alcanza, no hace falta doble firma. Es específico de ESTA
 * pantalla: no cambia ninguna otra función de Gerencia en el módulo.
 *
 * Tesorería ve el panel pero no aprueba: su rol sigue siendo ejecutar el
 * pago DESPUÉS de aprobado, que es otro momento y otra pantalla.
 */

export type PerfilPropuesta = { area: string | null; rol: string | null } | null

export function puedeVerPropuestas(perfil: PerfilPropuesta): boolean {
  return (
    perfil?.area === 'admin' ||
    perfil?.area === 'contabilidad' ||
    perfil?.area === 'tesoreria'
  )
}

/** Mismo criterio de "autoridad final" que el resto del módulo. */
export function puedeAprobarPropuesta(perfil: PerfilPropuesta): boolean {
  return perfil?.area === 'admin' || (perfil?.area === 'contabilidad' && perfil?.rol === 'admin')
}

export type MontoPorMoneda = { moneda: string; monto: number }

/**
 * Totales de un lote, SIEMPRE agrupados por moneda y nunca sumados entre
 * sí: una propuesta puede mezclar PEN y USD, y un único número sería
 * directamente falso.
 *
 * Devuelve dos cortes porque responden preguntas distintas: `total` es el
 * tamaño del lote, y `pendiente` lo que todavía falta desembolsar — en una
 * propuesta a medio ejecutar, el total ya no dice cuánto sale por la puerta.
 */
export function totalesDeLote(
  filas: readonly { moneda: string; montoAPagar: number; yaPagada: boolean }[]
): { total: MontoPorMoneda[]; pendiente: MontoPorMoneda[] } {
  return {
    total: sumarPorMoneda(filas.map((f) => ({ moneda: f.moneda, monto: f.montoAPagar }))),
    pendiente: sumarPorMoneda(
      filas.filter((f) => !f.yaPagada).map((f) => ({ moneda: f.moneda, monto: f.montoAPagar }))
    ),
  }
}

export function sumarPorMoneda(filas: readonly MontoPorMoneda[]): MontoPorMoneda[] {
  const porMoneda = new Map<string, number>()
  for (const f of filas) {
    porMoneda.set(f.moneda, redondear((porMoneda.get(f.moneda) ?? 0) + (Number(f.monto) || 0)))
  }
  return Array.from(porMoneda, ([moneda, monto]) => ({ moneda, monto }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}

function redondear(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}
