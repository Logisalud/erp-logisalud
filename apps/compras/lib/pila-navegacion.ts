export type PasoNavegacion = { href: string; texto: string }

const CLAVE_SESSION_STORAGE = 'compras_pila_navegacion'

/**
 * Pila de pasos en memoria para el botón "Atrás" del módulo — nunca el
 * historial del navegador, nunca router.back(), nunca un <Link> a una ruta
 * fija (ver ADDENDUM — patrón de navegación "Atrás"). El botón nativo del
 * navegador después de un redirect() de Server Action puede caer en 404
 * (la app se sirve con basePath vía rewrite entre proyectos Vercel
 * distintos), así que "atrás" se resuelve enteramente del lado del cliente,
 * leyendo por dónde fue pasando la persona.
 */
export function agregarPaso(pila: PasoNavegacion[], paso: PasoNavegacion): PasoNavegacion[] {
  const tope = pila[pila.length - 1]
  if (tope?.href === paso.href) {
    if (tope.texto === paso.texto) return pila
    return [...pila.slice(0, -1), paso]
  }
  return [...pila, paso]
}

export function retroceder(pila: PasoNavegacion[]): PasoNavegacion[] {
  if (pila.length <= 1) return pila
  return pila.slice(0, -1)
}

/** El paso al que hay que volver si se presiona "Atrás" ahora mismo — el
 * anterior al tope, porque el tope es la pantalla actual. Solo existe si hay
 * más de un paso en la pila. */
export function pasoAnterior(pila: PasoNavegacion[]): PasoNavegacion | null {
  return pila.length > 1 ? pila[pila.length - 2] : null
}

export function leerPilaGuardada(): PasoNavegacion[] {
  if (typeof window === 'undefined') return []
  try {
    const crudo = window.sessionStorage.getItem(CLAVE_SESSION_STORAGE)
    if (!crudo) return []
    const datos = JSON.parse(crudo)
    return Array.isArray(datos) ? datos : []
  } catch {
    return []
  }
}

export function guardarPila(pila: PasoNavegacion[]): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(CLAVE_SESSION_STORAGE, JSON.stringify(pila))
  } catch {
    // sessionStorage puede fallar (modo privado, cuota) — no es crítico, la
    // pila sigue viva en memoria para el resto de la sesión de React.
  }
}
