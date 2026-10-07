/** Último día del mes (mes 1–12). */
export function ultimoDiaDelMes(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0))
  return d.toISOString().slice(0, 10)
}

/**
 * Vencimiento de un producto. Se registra la fecha COMPLETA que muestra el
 * producto físico. Solo si el producto mismo muestra únicamente mes y año
 * ("02/2027", "2027-02") se usa el último día del mes.
 */
export function parsearVencimiento(texto: string): { fecha: string; textoOriginal: string } | null {
  const t = texto.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (m) return validar(+m[1], +m[2], +m[3]) ? { fecha: t, textoOriginal: t } : null
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (m) {
    const [d, mes, a] = [+m[1], +m[2], +m[3]]
    return validar(a, mes, d) ? { fecha: `${a}-${pad(mes)}-${pad(d)}`, textoOriginal: t } : null
  }
  m = /^(\d{1,2})\/(\d{4})$/.exec(t)
  if (m && +m[1] >= 1 && +m[1] <= 12) return { fecha: ultimoDiaDelMes(+m[2], +m[1]), textoOriginal: t }
  m = /^(\d{4})-(\d{2})$/.exec(t)
  if (m && +m[2] >= 1 && +m[2] <= 12) return { fecha: ultimoDiaDelMes(+m[1], +m[2]), textoOriginal: t }
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

function validar(a: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false
  return d <= +ultimoDiaDelMes(a, m).slice(8)
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 2027-02-28 → "28 feb 2027" */
export function formatoFecha(iso: string | undefined | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES[m - 1]} ${a}`
}
