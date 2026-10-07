import type { Estado } from './tipos'

/** Transiciones permitidas. Aprobado → Cuarentena NO está y no puede agregarse. */
const TRANSICIONES: ReadonlyArray<readonly [Estado, Estado]> = [
  ['CUARENTENA', 'APROBADO'],
  ['CUARENTENA', 'BAJAS_RECHAZADOS'],
  ['APROBADO', 'BAJAS_RECHAZADOS'],
]

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  CUARENTENA: 'Cuarentena',
  APROBADO: 'Aprobado',
  BAJAS_RECHAZADOS: 'Bajas/Rechazados',
}

export function transicionPermitida(desde: Estado, hasta: Estado): boolean {
  return TRANSICIONES.some(([d, h]) => d === desde && h === hasta)
}

/** Siguiente(s) estado(s) posibles desde un estado. */
export function destinosPosibles(desde: Estado): Estado[] {
  return TRANSICIONES.filter(([d]) => d === desde).map(([, h]) => h)
}

/** Regla que no se negocia: una unidad Aprobada nunca vuelve a Cuarentena. */
export function esRetrocesoProhibido(desde: Estado, hasta: Estado): boolean {
  return desde === 'APROBADO' && hasta === 'CUARENTENA'
}

export type ResultadoValidacion = { ok: true } | { ok: false; mensaje: string }

export function validarCambioEstado(desde: Estado, hasta: Estado): ResultadoValidacion {
  if (esRetrocesoProhibido(desde, hasta)) {
    return {
      ok: false,
      mensaje:
        'Lo aprobado no vuelve a Cuarentena. Si hay una duda de calidad, Dirección Técnica lo pasa a Bajas/Rechazados con su sustento.',
    }
  }
  if (!transicionPermitida(desde, hasta)) {
    return { ok: false, mensaje: `No se puede pasar de ${ETIQUETA_ESTADO[desde]} a ${ETIQUETA_ESTADO[hasta]}.` }
  }
  return { ok: true }
}
