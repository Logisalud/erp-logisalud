/**
 * Filtro del buscador "¿Para quién es el anticipo?". Puro.
 *
 * Sin tildes y sin mayúsculas ("jose" encuentra a "José"), y por CUALQUIER
 * palabra del nombre ("vargas" encuentra a "Luis Vargas"): quien arma el
 * anticipo suele recordar el apellido del vendedor, no cómo empieza el
 * nombre completo.
 */

export type OpcionPersona = {
  /** Codificado, como viaja en el formulario: `usuario:<id>` / `persona:<id>`. */
  valor: string
  nombre: string
  /** Una persona sin usuario desactivada no se ofrece — salvo que sea la
   * que ya está elegida (al editar una solicitud vieja). */
  activo: boolean
}

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function filtrarPersonas(
  opciones: readonly OpcionPersona[],
  termino: string,
  elegido: string = '',
): OpcionPersona[] {
  const partes = normalizar(termino).split(/\s+/).filter(Boolean)
  return opciones
    .filter((o) => o.activo || o.valor === elegido)
    .filter((o) => {
      const palabras = normalizar(o.nombre).split(/\s+/)
      // Cada parte de lo escrito tiene que ser el comienzo de alguna palabra.
      return partes.every((p) => palabras.some((w) => w.startsWith(p)))
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
