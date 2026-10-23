/**
 * Tipo de cambio SUNAT (venta) para una fecha, puro. (Sebas, 2026-10-23:
 * "tipo de cambio SUNAT siempre por default, pero editable".)
 *
 * Qué publica SUNAT: para el día D, el tipo de cambio venta de cierre de la
 * SBS del día hábil anterior. Un sábado, domingo o feriado repite el último.
 *
 * De dónde sale acá:
 *  - HOY: el archivo diario de SUNAT (www.sunat.gob.pe/a/txt/tipoCambio.txt,
 *    "dd/mm/aaaa|compra|venta|"). Solo trae el día en curso.
 *  - UNA FECHA PASADA: la misma serie SBS que publica el BCRP
 *    (PD04640PD, "TC Sistema bancario SBS - Venta"), tomando el último valor
 *    ANTERIOR a esa fecha — que es justamente lo que SUNAT publicó ese día.
 *    La consulta histórica de SUNAT (e-consulta) rechaza pedidos de un
 *    servidor (firewall), por eso no se usa.
 */

export type TipoCambioDia = { fecha: string; venta: number }

/** "23/10/2026|3.443|3.45|" → { fecha: '2026-10-23', venta: 3.45 }. */
export function parsearArchivoSunat(texto: string): TipoCambioDia | null {
  const m = texto.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\|([\d.]+)\|([\d.]+)\|?/)
  if (!m) return null
  const venta = Number(m[5])
  return venta > 0 ? { fecha: `${m[3]}-${m[2]}-${m[1]}`, venta } : null
}

const MESES: Record<string, string> = {
  ene: '01', jan: '01', feb: '02', mar: '03', abr: '04', apr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', aug: '08', set: '09', sep: '09', oct: '10', nov: '11', dic: '12', dec: '12',
}

/** La respuesta JSON del API del BCRP: `periods[].name` "14.Oct.26" y
 * `values[0]` el número, o "n.d." un día sin dato (feriado). */
export function parsearSerieBcrp(json: unknown): TipoCambioDia[] {
  const periodos = (json as { periods?: { name?: string; values?: string[] }[] })?.periods
  if (!Array.isArray(periodos)) return []
  const dias: TipoCambioDia[] = []
  for (const p of periodos) {
    const m = String(p?.name ?? '').match(/^(\d{2})\.([A-Za-z]{3})\.(\d{2})$/)
    const mes = m ? MESES[m[2].toLowerCase()] : undefined
    const venta = Number(p?.values?.[0])
    if (!m || !mes || !(venta > 0)) continue
    dias.push({ fecha: `20${m[3]}-${mes}-${m[1]}`, venta })
  }
  return dias
}

/** El que SUNAT publicó para `fecha`: el último cierre SBS ESTRICTAMENTE
 * anterior. null si no hay ninguno en la lista. */
export function tipoCambioPublicadoPara(cierres: readonly TipoCambioDia[], fecha: string): TipoCambioDia | null {
  let mejor: TipoCambioDia | null = null
  for (const d of cierres) {
    if (d.fecha < fecha && (!mejor || d.fecha > mejor.fecha)) mejor = d
  }
  return mejor
}

/** `fecha` menos `dias` días, en YYYY-MM-DD. */
export function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}
