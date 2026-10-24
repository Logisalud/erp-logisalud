// Candado del modo demostración (D-27): datos de prueba en memoria, SIN conexión a
// ninguna base real. Solo puede estar activo en un Preview de Vercel (WMS_DEMO=1) o en
// local (WMS_DEMO_LOCAL=1). En producción NO puede activarse: si alguien deja la
// variable puesta, la app se niega a arrancar en vez de mostrar datos falsos.

export interface EntornoDemo {
  VERCEL?: string
  VERCEL_ENV?: string
  WMS_DEMO?: string
  WMS_DEMO_LOCAL?: string
  /** La ruta de la cuenta DEMO de Nubefact (solo Preview, D-167). Su valor nunca se imprime ni se registra: aquí solo importa si existe. */
  NUBEFACT_RUTA?: string
}

export function leerEntorno(): EntornoDemo {
  return {
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    WMS_DEMO: process.env.WMS_DEMO,
    WMS_DEMO_LOCAL: process.env.WMS_DEMO_LOCAL,
    NUBEFACT_RUTA: process.env.NUBEFACT_RUTA,
  }
}

/** ¿Hay alguna bandera de demostración puesta? */
const hayBandera = (e: EntornoDemo) => e.WMS_DEMO === '1' || e.WMS_DEMO_LOCAL === '1'

/** ¿Es producción? Cualquier despliegue de Vercel que no sea explícitamente Preview cuenta como producción. */
export function esProduccion(e: EntornoDemo = leerEntorno()): boolean {
  if (e.VERCEL_ENV === 'production') return true
  return !!e.VERCEL && e.VERCEL_ENV !== 'preview' && e.VERCEL_ENV !== 'development'
}

/** Falla cerrada: producción con una bandera de demostración puesta no arranca. Tampoco arranca con la ruta de la cuenta DEMO de Nubefact (D-167): esa cuenta no envía a SUNAT. */
export function verificarDemoSeguro(e: EntornoDemo = leerEntorno()): void {
  if (esProduccion(e) && hayBandera(e)) {
    throw new Error(
      'El modo demostración no puede estar activo en producción. Quita WMS_DEMO / WMS_DEMO_LOCAL del entorno de producción.',
    )
  }
  if (esProduccion(e) && (e.NUBEFACT_RUTA ?? '').trim() !== '') {
    throw new Error('NUBEFACT_RUTA es solo para Preview (cuenta DEMO de Nubefact, no envía a SUNAT). Quítala del entorno de producción.')
  }
}

/** Preview de Vercel con la demostración encendida (WMS_DEMO=1): el único lugar donde la demo puede hablar con la cuenta DEMO de Nubefact. Local y pruebas siguen con el simulador. */
export function esPreviewDeDemostracion(e: EntornoDemo = leerEntorno()): boolean {
  return !!e.VERCEL && e.VERCEL_ENV === 'preview' && e.WMS_DEMO === '1'
}

export function modoDemoActivo(e: EntornoDemo = leerEntorno()): boolean {
  verificarDemoSeguro(e)
  if (e.VERCEL) return e.VERCEL_ENV === 'preview' && e.WMS_DEMO === '1'
  return e.WMS_DEMO_LOCAL === '1'
}

/**
 * Órdenes de ejemplo de la demostración (SA-1). Por defecto ENCENDIDAS en demo/Preview. `WMS_DEMO_EJEMPLOS=0` las apaga (lo fijan vitest, Playwright y
 * `e2e-por-viewport.sh` para la suite de siempre); `WMS_DEMO_EJEMPLOS=vacio` además deja la demo sin ninguna salida (para ver la pantalla vacía real).
 */
export type ModoEjemplos = 'si' | 'no' | 'vacio'
export function modoEjemplos(env: Record<string, string | undefined> = process.env): ModoEjemplos {
  const v = (env.WMS_DEMO_EJEMPLOS ?? '').trim().toLowerCase()
  if (v === '0' || v === 'no' || v === 'false') return 'no'
  if (v === 'vacio') return 'vacio'
  return 'si'
}
