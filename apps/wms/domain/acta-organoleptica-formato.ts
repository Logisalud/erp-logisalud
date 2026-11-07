// Acta de Evaluación Organoléptica — formato controlado LS-FR.55.02 (vigencia 01-09-2026 a 01-09-2028).
// Dónde va cada dato en la hoja OFICIAL (la plantilla .xlsx que entregó Sebas). Es una función pura: el Excel y el PDF llenan exactamente las mismas celdas.
import { ETIQUETA_DECISION, type Respuesta } from './entradas'
import type { OrganolepticaVista } from './entradas-vistas'
import { formatoFecha, formatoFechaHora, textoVencimiento } from './fechas'

/** Lo que la solicitud sabe y el acta no: el proveedor o cliente y la cantidad pedida. */
export interface ExtraActaOrganoleptica {
  contraparte?: string
  cantidadPedida?: number
}
export interface ValorCelda {
  texto: string
  /** Una marca (X) o dato corto que va centrado en su casilla. */
  centro?: boolean
}

/** «+» = la pregunta del formato es positiva (Cerrado, Limpio…: Conforme = SÍ). «−» = es negativa (Arrugado, Quebrado…: Conforme = NO). */
type Sentido = '+' | '-'
interface FilaCheck { ids: string[]; sentido: Sentido }
interface BloqueCheck { si: string; no: string; primeraFila: number; filas: FilaCheck[] }

const g = (p: string): FilaCheck[] => [
  { ids: [`${p}_identificacion`], sentido: '+' }, { ids: [`${p}_rs`], sentido: '+' }, { ids: [`${p}_cerrado`], sentido: '+' }, { ids: [`${p}_limpio`], sentido: '+' },
  { ids: [`${p}_sin_arrugas`], sentido: '-' }, { ids: [`${p}_sin_quiebres`], sentido: '-' },
  // «Deterioro del producto o deformación, Manchas» es UNA fila en el formato
  { ids: [`${p}_sin_deterioro`, `${p}_sin_manchas`], sentido: '-' },
  { ids: [`${p}_sin_cuerpos`], sentido: '-' }, { ids: [`${p}_sin_grietas`], sentido: '-' }, { ids: [`${p}_sello`], sentido: '+' },
]
const r = (p: string, conAlmacenamiento: boolean): FilaCheck[] => [
  { ids: [`${p}_legible`], sentido: '+' }, { ids: [`${p}_nombre`], sentido: '+' }, { ids: [`${p}_fabricante`], sentido: '+' }, { ids: [`${p}_contenido`], sentido: '+' },
  { ids: [`${p}_lote`], sentido: '+' }, { ids: [`${p}_vence`], sentido: '+' },
  ...(conAlmacenamiento ? [{ ids: [`${p}_almacenamiento`], sentido: '+' as Sentido }] : []),
]

/** Las cinco listas de la sección II, con las columnas SÍ / NO de cada una, tal como están en la plantilla. */
export const BLOQUES_CHECK: BloqueCheck[] = [
  { si: 'D', no: 'E', primeraFila: 17, filas: [
    { ids: ['emb_cerrado'], sentido: '+' }, { ids: ['emb_limpio'], sentido: '+' }, { ids: ['emb_sin_arrugas'], sentido: '-' },
    { ids: ['emb_sin_quiebres'], sentido: '-' }, { ids: ['emb_sin_humedad'], sentido: '-' }, { ids: ['emb_sin_deterioro'], sentido: '-' },
  ] },
  { si: 'M', no: 'N', primeraFila: 17, filas: g('mediato') },
  { si: 'V', no: 'W', primeraFila: 17, filas: g('inmediato') },
  { si: 'Z', no: 'AA', primeraFila: 17, filas: r('rotmed', true) },
  { si: 'AF', no: 'AG', primeraFila: 17, filas: r('rotinm', false) },
]

/** Respuesta de una fila del formato a partir de uno o varios ítems de la app: un «No conforme» manda; todos «Conforme» = Conforme; sin respuesta o «No aplica» = sin marca. */
function respuestaDeFila(c: Record<string, Respuesta | undefined>, ids: string[]): Respuesta | undefined {
  const rs = ids.map((i) => c[i]).filter((x): x is Respuesta => !!x)
  if (rs.includes('NC')) return 'NC'
  if (rs.includes('C')) return 'C'
  if (rs.length && rs.every((x) => x === 'NA')) return 'NA'
  return undefined
}

const marca = (texto = 'X'): ValorCelda => ({ texto, centro: true })

export function valoresActaOrganoleptica(a: OrganolepticaVista, extra: ExtraActaOrganoleptica = {}): Record<string, ValorCelda> {
  const v: Record<string, ValorCelda> = {}
  const poner = (celda: string, texto: string | number | undefined | null, centro = false) => { if (texto !== undefined && texto !== null && String(texto) !== '') v[celda] = { texto: String(texto), centro } }

  // I. Motivo
  if (a.ingresoTipo === 'COMPRA_LOCAL') v.L7 = marca()
  if (a.ingresoTipo === 'DEVOLUCION') v.G9 = marca()
  if (a.ingresoTipo === 'INGRESO_CLIENTE') v.L9 = marca()
  poner('T7', a.referencia)
  poner('Y7', formatoFecha(a.creadaEn.slice(0, 10)), true)

  // Producto
  poner('F11', a.producto)
  poner('X11', a.lote, true)
  poner('AC11', a.vence ? textoVencimiento(a.vence, a.venceTexto) : '', true)
  poner('F12', a.registroSanitario)
  poner('X12', extra.cantidadPedida, true)
  poner('Z12', a.cantidadLote, true)
  poner('AF12', a.cantidadMuestra, true)
  poner('F13', a.fabricante)
  poner('X13', a.rsVence ? formatoFecha(a.rsVence) : '', true)
  if (a.datos.certAnalisis === true) v.AE13 = marca('SI')
  if (a.datos.certAnalisis === false) v.AG13 = marca()
  poner('F14', extra.contraparte ?? a.propietario)
  poner('X14', a.formaPresentacion)

  // II. Embalaje, envases y rotulados
  const c = a.datos.checklist as Record<string, Respuesta | undefined>
  for (const b of BLOQUES_CHECK) {
    b.filas.forEach((f, k) => {
      const resp = respuestaDeFila(c, f.ids)
      if (resp !== 'C' && resp !== 'NC') return
      const esSi = f.sentido === '+' ? resp === 'C' : resp === 'NC'
      v[`${esSi ? b.si : b.no}${b.primeraFila + k}`] = marca()
    })
  }

  // Observación, destino y conclusión
  const obs = [a.datos.observacion, a.observacionDt ? `Dirección Técnica: ${a.observacionDt}` : ''].filter(Boolean).join(' · ')
  v.C33 = { texto: `OBSERVACION: ${obs}` }
  if (a.datos.destinoSugerido === 'APROBADO') v.H35 = marca()
  if (a.datos.destinoSugerido === 'DEVOLUCION') v.X35 = marca()
  if (a.datos.destinoSugerido === 'BAJA') v.AD35 = marca()
  if (a.datos.conclusion === 'CONFORME') v.M37 = marca()
  if (a.datos.conclusion === 'NO_CONFORME') v.X37 = marca()

  // Dirección Técnica
  if (a.decision) {
    poner('D42', formatoFechaHora(a.decididoEn))
    v.P40 = { texto: `${a.decididoPor ?? ''} · ${ETIQUETA_DECISION[a.decision]}`, centro: true }
  }
  return v
}
