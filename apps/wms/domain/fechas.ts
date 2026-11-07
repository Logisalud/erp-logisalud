/** Último día del mes (mes 1–12). */
export function ultimoDiaDelMes(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0))
  return d.toISOString().slice(0, 10)
}

/** Día que se asume cuando el producto solo muestra mes y año (parámetro `vencimiento_dia_por_defecto`). */
export type DiaPorDefecto = 'primero' | 'ultimo'
/**
 * Valor inicial: PRIMER día del mes (a confirmar con Katia; antes se había decidido el último día, D-PIL-12). Se cambia con el parámetro,
 * sin tocar el código.
 */
export const DIA_POR_DEFECTO_INICIAL: DiaPorDefecto = 'primero'

/** Lo que se escribe cuando el producto solo muestra mes y año: «06/2028» o «2028-06». */
export const SOLO_MES_ANIO = /^\s*(\d{1,2})\/(\d{4})\s*$|^\s*(\d{4})-(\d{2})\s*$/

/** ¿El texto original que escribió la persona era solo mes y año? */
export const esSoloMesAnio = (texto: string | null | undefined): boolean => !!texto && SOLO_MES_ANIO.test(texto)

/** Normaliza el parámetro: cualquier valor que no sea «ultimo» se toma como «primero» (el valor inicial). */
export function diaPorDefectoDe(valor: string | null | undefined): DiaPorDefecto {
  return valor?.trim().toLowerCase() === 'ultimo' ? 'ultimo' : 'primero'
}

/**
 * Vencimiento de un producto. Se registra la fecha COMPLETA que muestra el
 * producto físico. Solo si el producto mismo muestra únicamente mes y año
 * ("02/2027", "2027-02") se usa el día por defecto del mes (hoy el primero).
 */
export function parsearVencimiento(texto: string, dia: DiaPorDefecto = DIA_POR_DEFECTO_INICIAL): { fecha: string; textoOriginal: string } | null {
  const t = texto.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (m) return validar(+m[1], +m[2], +m[3]) ? { fecha: t, textoOriginal: t } : null
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (m) {
    const [d, mes, a] = [+m[1], +m[2], +m[3]]
    return validar(a, mes, d) ? { fecha: `${a}-${pad(mes)}-${pad(d)}`, textoOriginal: t } : null
  }
  m = /^(\d{1,2})\/(\d{4})$/.exec(t)
  if (m && +m[1] >= 1 && +m[1] <= 12) return { fecha: diaDelMes(+m[2], +m[1], dia), textoOriginal: t }
  m = /^(\d{4})-(\d{2})$/.exec(t)
  if (m && +m[2] >= 1 && +m[2] <= 12) return { fecha: diaDelMes(+m[1], +m[2], dia), textoOriginal: t }
  return null
}

const diaDelMes = (anio: number, mes: number, dia: DiaPorDefecto) => (dia === 'ultimo' ? ultimoDiaDelMes(anio, mes) : `${anio}-${pad(mes)}-01`)

/** «06/2028 (solo mes y año)» si la persona escribió solo mes y año; si no, la fecha completa («30 jun 2028»). */
export function textoVencimiento(vence: string | null | undefined, textoOriginal?: string | null): string {
  if (!vence) return '—'
  if (esSoloMesAnio(textoOriginal)) return `${vence.slice(5, 7)}/${vence.slice(0, 4)} (solo mes y año)`
  return formatoFecha(vence)
}

/**
 * Meses COMPLETOS que faltan para el vencimiento (la misma cuenta que `age()` de Postgres): del 4 nov 2026 al 4 nov 2028 son 24;
 * al 3 nov 2028, 23. Negativo si ya venció.
 */
export function mesesDeVidaRestante(vence: string, hoy: string): number {
  const [ay, am, ad] = hoy.split('-').map(Number)
  const [vy, vm, vd] = vence.split('-').map(Number)
  const meses = (vy - ay) * 12 + (vm - am)
  return vd < ad ? meses - 1 : meses
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

/** 2026-10-08T15:32:00Z → "8 oct 2026, 10:32" (hora de Lima). */
export function formatoFechaHora(iso: string | undefined | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const partes = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? ''
  return `${g('day')} ${g('month').replace('.', '')} ${g('year')}, ${g('hour')}:${g('minute')}`
}

/** Fecha de hoy en Lima, YYYY-MM-DD. */
export function hoyEnLima(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(ahora)
}
