/**
 * Reporte "Notas pendientes de proveedores" (Contabilidad, 2026-11-16). Puro.
 *
 * Cada fila es una línea de recepción donde lo que llegó no coincide con lo
 * facturado — la diferencia que Almacén ya registra en la recepción de tres
 * columnas, sin ningún clic aparte:
 *
 *  - llegó MENOS → el proveedor debe una NOTA DE CRÉDITO. Se cierra cuando
 *    Contabilidad la registra en la ficha de la deuda (que además la libera
 *    para pago).
 *  - llegó MÁS → el proveedor debe una FACTURA por la diferencia o una NOTA
 *    DE DÉBITO. Se cierra cuando Contabilidad registra ese documento desde
 *    este reporte (migración 0089).
 */

import { redondear } from './obligacion'

export type TipoNotaPendiente = 'nota_credito' | 'factura_o_debito'
export type EstadoNotaPendiente = 'pendiente' | 'recibida'

export const ETIQUETA_TIPO_NOTA: Record<TipoNotaPendiente, string> = {
  nota_credito: 'Nota de crédito',
  factura_o_debito: 'Factura o nota de débito',
}

export const ETIQUETA_TIPO_DOCUMENTO_EXCEDENTE = { factura: 'Factura', nota_debito: 'Nota de débito' } as const
export type TipoDocumentoExcedente = keyof typeof ETIQUETA_TIPO_DOCUMENTO_EXCEDENTE

const IGV = 0.18

/** Lo que llega de la base por cada línea con diferencia. */
export type DiferenciaRecepcion = {
  lineaId: string
  recepcionId: string
  fechaRecepcion: string
  recibidoPor: string | null
  ocCodigo: string
  moneda: string
  proveedorId: string
  proveedor: string
  ruc: string | null
  numeroFactura: string | null
  productoCodigo: string | null
  producto: string | null
  cantidadFactura: number
  cantidadFisica: number
  precioUnitario: number
  exoneradoIgv: boolean
  observaciones: string | null
  obligacionId: string | null
  obligacionCodigo: string | null
  esperaNotaCredito: boolean
  /** Las NC registradas contra la deuda de esta recepción. */
  notasCredito: { numero: string | null; fecha: string | null }[]
  /** El documento que cerró el excedente de esta línea, si llegó. */
  documentoExcedente: { tipo: TipoDocumentoExcedente; numero: string; fecha: string } | null
}

export type FilaNotaPendiente = DiferenciaRecepcion & {
  tipo: TipoNotaPendiente
  /** Unidades de diferencia, siempre positivas. */
  diferencia: number
  /** Diferencia × precio de la OC, con IGV si el producto no es exonerado:
   *  la referencia para reclamarle al proveedor. */
  montoEstimado: number
  estado: EstadoNotaPendiente
  /** Qué documento la cerró: "NC F001-123", "Nota de débito FD01-9". */
  documento: string | null
  /** Desde que llegó la mercadería hasta hoy, o hasta que llegó el documento. */
  dias: number
}

function diasEntre(desde: string, hasta: string): number {
  const ms = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)
  return Math.max(0, Math.round(ms / 86_400_000))
}

export function clasificarDiferencia(d: DiferenciaRecepcion, hoy: string): FilaNotaPendiente {
  const tipo: TipoNotaPendiente = d.cantidadFisica < d.cantidadFactura ? 'nota_credito' : 'factura_o_debito'
  const diferencia = redondear(Math.abs(d.cantidadFactura - d.cantidadFisica))
  const base = diferencia * d.precioUnitario
  const montoEstimado = redondear(d.exoneradoIgv ? base : base * (1 + IGV))

  let estado: EstadoNotaPendiente = 'pendiente'
  let documento: string | null = null
  let fechaCierre: string | null = null

  if (tipo === 'nota_credito') {
    // La deuda frenada es la fuente de verdad: mientras espera NC, está
    // pendiente aunque haya alguna NC registrada por otra cosa.
    const nc = d.notasCredito[0]
    if (!d.esperaNotaCredito && nc) {
      estado = 'recibida'
      documento = `NC ${nc.numero ?? 's/n'}`
      fechaCierre = nc.fecha
    }
  } else if (d.documentoExcedente) {
    estado = 'recibida'
    documento = `${ETIQUETA_TIPO_DOCUMENTO_EXCEDENTE[d.documentoExcedente.tipo]} ${d.documentoExcedente.numero}`
    fechaCierre = d.documentoExcedente.fecha
  }

  return {
    ...d,
    tipo,
    diferencia,
    montoEstimado,
    estado,
    documento,
    dias: diasEntre(d.fechaRecepcion, fechaCierre ?? hoy),
  }
}

export type ResumenProveedor = {
  proveedorId: string
  proveedor: string
  ruc: string | null
  casos: number
  /** Por moneda: un proveedor puede facturar en soles y en dólares. */
  montoPorMoneda: { moneda: string; monto: number }[]
  /** Los días del caso pendiente más antiguo. */
  masAntiguo: number
}

/**
 * Lo que se le reclama a cada proveedor: solo lo PENDIENTE, del que más
 * tiempo lleva esperando al que menos — es el orden en que se llama.
 */
export function resumenPorProveedor(filas: readonly FilaNotaPendiente[]): ResumenProveedor[] {
  const porProveedor = new Map<string, ResumenProveedor & { _monedas: Map<string, number> }>()
  for (const f of filas) {
    if (f.estado !== 'pendiente') continue
    const r = porProveedor.get(f.proveedorId) ?? {
      proveedorId: f.proveedorId, proveedor: f.proveedor, ruc: f.ruc,
      casos: 0, montoPorMoneda: [], masAntiguo: 0, _monedas: new Map<string, number>(),
    }
    r.casos += 1
    r.masAntiguo = Math.max(r.masAntiguo, f.dias)
    r._monedas.set(f.moneda, redondear((r._monedas.get(f.moneda) ?? 0) + f.montoEstimado))
    porProveedor.set(f.proveedorId, r)
  }
  return [...porProveedor.values()]
    .map(({ _monedas, ...r }) => ({
      ...r,
      montoPorMoneda: [..._monedas].map(([moneda, monto]) => ({ moneda, monto })),
    }))
    .sort((a, b) => b.masAntiguo - a.masAntiguo)
}

export type FiltroNotasPendientes = {
  estado: EstadoNotaPendiente | 'todas'
  tipo: TipoNotaPendiente | 'todos'
  busqueda: string
}

export function leerFiltroNotasPendientes(params: { estado?: string; tipo?: string; q?: string }): FiltroNotasPendientes {
  return {
    // Por defecto, lo que falta: es para lo que se abre el reporte.
    estado: params.estado === 'recibida' || params.estado === 'todas' ? params.estado : 'pendiente',
    tipo: params.tipo === 'nota_credito' || params.tipo === 'factura_o_debito' ? params.tipo : 'todos',
    busqueda: (params.q ?? '').trim(),
  }
}

export function filtrarNotasPendientes(
  filas: readonly FilaNotaPendiente[],
  filtro: FiltroNotasPendientes,
): FilaNotaPendiente[] {
  const q = filtro.busqueda.toLowerCase()
  return filas
    .filter((f) => filtro.estado === 'todas' || f.estado === filtro.estado)
    .filter((f) => filtro.tipo === 'todos' || f.tipo === filtro.tipo)
    .filter((f) => !q || [f.proveedor, f.ruc, f.ocCodigo, f.numeroFactura, f.obligacionCodigo, f.producto]
      .some((v) => (v ?? '').toLowerCase().includes(q)))
    .sort((a, b) => b.dias - a.dias)
}

/** Quién ve el reporte (Sebas, 2026-11-16) y quién registra documentos. */
export const AREAS_VEN_NOTAS_PENDIENTES = ['contabilidad', 'tesoreria', 'gerencia', 'admin'] as const
export const AREAS_REGISTRAN_DOCUMENTO_EXCEDENTE = ['contabilidad', 'admin'] as const

export function puedeVerNotasPendientes(area: string | null | undefined): boolean {
  return (AREAS_VEN_NOTAS_PENDIENTES as readonly string[]).includes(area ?? '')
}

export function puedeRegistrarDocumentoExcedente(area: string | null | undefined): boolean {
  return (AREAS_REGISTRAN_DOCUMENTO_EXCEDENTE as readonly string[]).includes(area ?? '')
}

export function validarDocumentoExcedente(input: {
  tipo: string
  numero: string
  fechaEmision: string
  storagePath: string | null
  lineas: readonly string[]
}): string | null {
  if (!(input.tipo in ETIQUETA_TIPO_DOCUMENTO_EXCEDENTE)) return 'Elige si es factura o nota de débito.'
  if (!input.numero.trim()) return 'Pon el número del documento.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaEmision)) return 'Pon la fecha de emisión.'
  if (!input.storagePath) return 'Sube el archivo del documento.'
  if (input.lineas.length === 0) return 'Elige qué líneas cubre este documento.'
  return null
}
