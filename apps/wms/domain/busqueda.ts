/** Quita tildes y pasa a minúsculas: "Dapagliflozina" == "dapagliflozína". */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Puntaje de coincidencia de una consulta contra un texto (0 = no coincide). */
export function puntaje(consulta: string, texto: string): number {
  const q = normalizar(consulta)
  const t = normalizar(texto)
  if (!q || !t) return 0
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  if (t.split(/[\s\-_.\/]+/).some((p) => p.startsWith(q))) return 60
  if (t.includes(q)) return 40
  // Todas las palabras de la consulta aparecen (en cualquier orden).
  const palabras = q.split(/\s+/).filter(Boolean)
  if (palabras.length > 1 && palabras.every((p) => t.includes(p))) return 30
  return 0
}

/** ¿Coincide la consulta con el texto? */
export const buscarEnTexto = (consulta: string, texto: string) => puntaje(consulta, texto) > 0
