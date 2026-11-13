// Stock del cliente de almacenamiento (migración 0067): lo que ve quien abre su enlace. Dominio puro, de SOLO LECTURA.
// Su stock por producto y lote (nunca ubicaciones, precios ni datos del personal), lo que ya venció o vence pronto, y su Kardex descargable con el modelo de Logisalud.
// La base (`wms.stock_cliente_por_token`, `wms.kardex_cliente_por_token`) aplica lo mismo y manda; esto solo ordena y nombra lo que ella devuelve.
import { formatoFecha } from './fechas'
import { parsearTramos, type FilaKardex } from './inventario'

export interface LoteStock {
  loteId: string
  lote: string
  /** AAAA-MM-DD; sin dato si el lote no tiene fecha de vencimiento. */
  vence?: string
  /** Días que faltan (negativo = ya venció). */
  dias?: number
  vencido: boolean
  /** Lo que hay en el almacén (aprobado y en revisión de Calidad; las bajas y rechazados no cuentan). */
  stock: number
  /** Lo que puede salir hoy: aprobado menos lo ya comprometido en sus salidas. */
  disponible: number
  /** Lo que todavía está en revisión de Calidad (cuarentena o devolución): está en el almacén, pero aún no se puede despachar. */
  enRevision: number
}

export interface ProductoStock {
  productoId: string
  codigo: string
  /** El código propio del cliente (por ejemplo AJR0026), si lo tiene registrado. */
  codigoCliente?: string
  descripcion: string
  presentacion?: string
  stock: number
  disponible: number
  enRevision: number
  /** Unidades de lotes ya vencidos. */
  vencido: number
  lotes: LoteStock[]
}

export type RespuestaStockCliente =
  | { estado: 'OK'; cliente: { codigo: string; nombre: string }; hoy: string; actualizadoEn: string; tramos: number[]; productos: ProductoStock[] }
  | { estado: 'NO_ENCONTRADO' }
  | { estado: 'ESPERA'; esperaSegundos: number }
  | { estado: 'NO_DISPONIBLE' }
  | { estado: 'ERROR' }

export interface KardexProducto { productoId: string; codigo: string; descripcion: string; filas: FilaKardex[] }
export type RespuestaKardexCliente =
  | { estado: 'OK'; cliente: { codigo: string; nombre: string }; hoy: string; /** El código controlado del formato de Kardex de Logisalud. */ formato: string; productos: KardexProducto[] }
  | { estado: 'NO_ENCONTRADO' }
  | { estado: 'ESPERA'; esperaSegundos: number }
  | { estado: 'NO_DISPONIBLE' }
  | { estado: 'ERROR' }

export interface FiltroKardexCliente { productoId?: string; desde?: string; hasta?: string }

export const TEXTO_NO_DISPONIBLE_STOCK = 'Esta página todavía no está disponible. Cuando Logisalud la active, tu enlace funcionará.'
export const TEXTO_ENLACE_INVALIDO_STOCK = 'Este enlace no es válido o ya venció. Pídele uno nuevo a Logisalud.'
export const TEXTO_ERROR_STOCK = 'No pudimos mostrar tu stock en este momento. Intenta de nuevo en unos minutos.'
export const TEXTO_SIN_STOCK = 'Por ahora no tienes productos en el almacén de Logisalud.'
export const AVISO_PIE_STOCK = 'El stock se actualiza en cada visita, con lo que Logisalud tiene registrado en el almacén. «Disponible» es lo que puede salir hoy: lo aprobado, menos lo que ya está comprometido en tus salidas.'

// ── Resumen y búsqueda ──────────────────────────────────────────────────────

export interface ResumenStock { productos: number; lotes: number; unidades: number; disponibles: number; enRevision: number; vencidas: number; porVencer: number }

/** Los totales de arriba de la página. `porVencer` = unidades que vencen dentro del primer tramo (3 meses por defecto) y todavía no vencieron. */
export function resumenStock(productos: readonly ProductoStock[], tramos: readonly number[]): ResumenStock {
  const limite = tramos[0] ?? 90
  let lotes = 0; let porVencer = 0
  for (const p of productos) for (const l of p.lotes) {
    lotes += 1
    if (!l.vencido && l.dias !== undefined && l.dias <= limite) porVencer += l.stock
  }
  return {
    productos: productos.length, lotes,
    unidades: productos.reduce((t, p) => t + p.stock, 0), disponibles: productos.reduce((t, p) => t + p.disponible, 0),
    enRevision: productos.reduce((t, p) => t + p.enRevision, 0), vencidas: productos.reduce((t, p) => t + p.vencido, 0), porVencer,
  }
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Busca por código (el nuestro o el del cliente), nombre, presentación o lote. Sin texto devuelve todo. */
export function filtrarProductos(productos: readonly ProductoStock[], texto: string): ProductoStock[] {
  const t = sinTildes(texto.trim())
  if (!t) return [...productos]
  return productos.filter((p) => [p.codigo, p.codigoCliente ?? '', p.descripcion, p.presentacion ?? '', ...p.lotes.map((l) => l.lote)].some((x) => sinTildes(x).includes(t)))
}

// ── Lo que vence ────────────────────────────────────────────────────────────

/** «3 meses», «6 meses», «12 meses»; lo corto en días («30 días»). */
export function textoPlazo(dias: number): string {
  if (dias < 60) return `${dias} ${dias === 1 ? 'día' : 'días'}`
  const meses = Math.round(dias / 30.4)
  return `${meses} meses`
}

/** El grupo de «lo que vence» al que pertenece un lote (el más cercano), o `null` si vence después del último tramo o no tiene fecha. */
export function claveVence(l: Pick<LoteStock, 'dias' | 'vencido'>, tramos: readonly number[]): GrupoVence['clave'] | null {
  if (l.vencido) return 'VENCIDO'
  if (l.dias === undefined) return null
  const d = [...tramos].filter((x) => x > 0).sort((a, b) => a - b).find((x) => (l.dias ?? Infinity) <= x)
  return d === undefined ? null : `HASTA_${d}`
}

export interface FilaVence { productoId: string; codigo: string; codigoCliente?: string; descripcion: string; lote: string; vence?: string; dias?: number; stock: number }
export interface GrupoVence { clave: 'VENCIDO' | `HASTA_${number}`; titulo: string; unidades: number; filas: FilaVence[] }

/**
 * «Lo que vence»: los lotes ya vencidos y los que vencen dentro de cada tramo (los de la configuración del almacén: 3, 6 y 12 meses por defecto). Cada lote en el grupo más cercano;
 * un grupo sin lotes no se muestra; los que vencen después del último tramo no aparecen (no hay nada que avisar).
 */
export function lotesQueVencen(productos: readonly ProductoStock[], tramos: readonly number[]): GrupoVence[] {
  const t = [...tramos].filter((x) => x > 0).sort((a, b) => a - b)
  const grupos: GrupoVence[] = [
    { clave: 'VENCIDO', titulo: 'Ya vencidos', unidades: 0, filas: [] },
    ...t.map((d, i): GrupoVence => ({ clave: `HASTA_${d}`, titulo: i === 0 ? `Vencen en menos de ${textoPlazo(d)}` : `Vencen entre ${textoPlazo(t[i - 1])} y ${textoPlazo(d)}`, unidades: 0, filas: [] })),
  ]
  for (const p of productos) for (const l of p.lotes) {
    if (l.dias === undefined && !l.vencido) continue
    const fila: FilaVence = { productoId: p.productoId, codigo: p.codigo, codigoCliente: p.codigoCliente, descripcion: p.descripcion, lote: l.lote, vence: l.vence, dias: l.dias, stock: l.stock }
    const clave = claveVence(l, t)
    const destino = clave ? grupos.find((g) => g.clave === clave) : undefined
    if (destino) { destino.filas.push(fila); destino.unidades += l.stock }
  }
  for (const g of grupos) g.filas.sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  return grupos.filter((g) => g.filas.length > 0)
}

/** «Vencido hace 10 días», «Vence hoy», «Vence en 45 días». */
export function textoDias(dias: number | undefined, vencido: boolean): string {
  if (dias === undefined) return 'Sin fecha de vencimiento'
  if (vencido || dias < 0) { const n = Math.abs(dias); return `Vencido hace ${n} ${n === 1 ? 'día' : 'días'}` }
  if (dias === 0) return 'Vence hoy'
  if (dias < 60) return `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`
  return `Vence en ${textoPlazo(dias)}`
}

/** Cómo se rotula el vencimiento de un lote: urgencia y texto (siempre con texto y símbolo, nunca solo color). */
export function urgenciaLote(l: Pick<LoteStock, 'dias' | 'vencido'>, tramos: readonly number[]): 'VENCIDO' | 'PRONTO' | 'VIGENTE' | 'SIN_FECHA' {
  if (l.vencido) return 'VENCIDO'
  if (l.dias === undefined) return 'SIN_FECHA'
  return l.dias <= (tramos[0] ?? 90) ? 'PRONTO' : 'VIGENTE'
}

export const fechaLote = (vence?: string) => (vence ? formatoFecha(vence) : '—')

// ── Kardex ──────────────────────────────────────────────────────────────────

const esFecha = (t: unknown): t is string => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`))
const esUuid = (t: unknown): t is string => typeof t === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)

/** Lo que se pide en el enlace de descarga: un producto (o todos), y un rango de fechas opcional. Lo inválido se ignora; si las fechas van al revés se ordenan. */
export function filtroKardexCliente(params: Record<string, string | undefined>): FiltroKardexCliente {
  const f: FiltroKardexCliente = {}
  if (esUuid(params.producto)) f.productoId = params.producto
  if (esFecha(params.desde)) f.desde = params.desde
  if (esFecha(params.hasta)) f.hasta = params.hasta
  if (f.desde && f.hasta && f.desde > f.hasta) [f.desde, f.hasta] = [f.hasta, f.desde]
  return f
}

/** El nombre del archivo que se descarga: «Kardex AJR_LABS 2026-11-13.xlsx», sin caracteres raros. */
export function nombreArchivoKardex(clienteCodigo: string, hoy: string, producto?: string): string {
  const limpio = (t: string) => t.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return `Kardex ${limpio(clienteCodigo)}${producto ? ` ${limpio(producto)}` : ''} ${hoy}.xlsx`
}

export const tramosDe = (texto: string | undefined): number[] => parsearTramos(texto ?? '')

// ── Los enlaces (lo ve el personal) ─────────────────────────────────────────

export type EstadoEnlaceStock = 'VIGENTE' | 'VENCIDO' | 'REVOCADO'
export interface EnlaceStockVista {
  id: string
  propietarioId: string
  /** Para quién es («Compras de AJR»): solo lo ve el personal. */
  etiqueta?: string
  creadoEn: string
  venceEn: string
  revocadoEn?: string
  ultimaVistaEn?: string
  estado: EstadoEnlaceStock
}

export const estadoDeEnlace = (e: { venceEn: string; revocadoEn?: string }, ahora: number = Date.now()): EstadoEnlaceStock =>
  e.revocadoEn ? 'REVOCADO' : Date.parse(e.venceEn) <= ahora ? 'VENCIDO' : 'VIGENTE'

export const ETIQUETA_ESTADO_ENLACE: Record<EstadoEnlaceStock, string> = { VIGENTE: 'Vigente', VENCIDO: 'Vencido', REVOCADO: 'Revocado' }
export const VIGENCIAS_ENLACE: readonly { dias: number; texto: string }[] = [
  { dias: 30, texto: '30 días' }, { dias: 90, texto: '3 meses' }, { dias: 180, texto: '6 meses' }, { dias: 365, texto: '1 año' },
]
/** La dirección completa que se le manda al cliente. */
export const direccionDeStockCliente = (origen: string, basePath: string, token: string) => `${origen.replace(/\/+$/, '')}${basePath}/stock/${token}`
