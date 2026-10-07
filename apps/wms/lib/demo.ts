// Candado del modo demostración (D-27): datos de prueba en memoria, SIN conexión a
// ninguna base real. Solo puede estar activo en un Preview de Vercel (WMS_DEMO=1) o en
// local (WMS_DEMO_LOCAL=1). En producción NO puede activarse: si alguien deja la
// variable puesta, la app se niega a arrancar en vez de mostrar datos falsos.

export interface EntornoDemo {
  VERCEL?: string
  VERCEL_ENV?: string
  WMS_DEMO?: string
  WMS_DEMO_LOCAL?: string
}

export function leerEntorno(): EntornoDemo {
  return {
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    WMS_DEMO: process.env.WMS_DEMO,
    WMS_DEMO_LOCAL: process.env.WMS_DEMO_LOCAL,
  }
}

/** ¿Hay alguna bandera de demostración puesta? */
const hayBandera = (e: EntornoDemo) => e.WMS_DEMO === '1' || e.WMS_DEMO_LOCAL === '1'

/** ¿Es producción? Cualquier despliegue de Vercel que no sea explícitamente Preview cuenta como producción. */
export function esProduccion(e: EntornoDemo = leerEntorno()): boolean {
  if (e.VERCEL_ENV === 'production') return true
  return !!e.VERCEL && e.VERCEL_ENV !== 'preview' && e.VERCEL_ENV !== 'development'
}

/** Falla cerrada: producción con una bandera de demostración puesta no arranca. */
export function verificarDemoSeguro(e: EntornoDemo = leerEntorno()): void {
  if (esProduccion(e) && hayBandera(e)) {
    throw new Error(
      'El modo demostración no puede estar activo en producción. Quita WMS_DEMO / WMS_DEMO_LOCAL del entorno de producción.',
    )
  }
}

export function modoDemoActivo(e: EntornoDemo = leerEntorno()): boolean {
  verificarDemoSeguro(e)
  if (e.VERCEL) return e.VERCEL_ENV === 'preview' && e.WMS_DEMO === '1'
  return e.WMS_DEMO_LOCAL === '1'
}
