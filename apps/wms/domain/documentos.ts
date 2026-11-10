// Documentos regulatorios (S6a): COA por lote, registro sanitario por producto y BPM por fabricante, con vigencia, historial y el perfil
// documental del cliente. Puro (sin Next ni Supabase): lo usan la demo y las pantallas; la base de datos (`wms.subir_documento_regulatorio`,
// `wms.estado_documental`) aplica las mismas reglas y es la que manda.
import { normalizar } from './busqueda'
import { puede } from './permisos'
import type { Rol } from './tipos'

export type TipoDocumento = 'COA' | 'REGISTRO_SANITARIO' | 'BPM'
export const TIPOS_DOCUMENTO: readonly TipoDocumento[] = ['COA', 'REGISTRO_SANITARIO', 'BPM']
export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = { COA: 'COA', REGISTRO_SANITARIO: 'Registro sanitario', BPM: 'BPM' }
export const DE_QUE_ES: Record<TipoDocumento, string> = { COA: 'del lote', REGISTRO_SANITARIO: 'del producto', BPM: 'del fabricante' }

export interface DocumentoRegulatorio {
  id: string
  tipo: TipoDocumento
  /** El lote (COA), el producto (registro sanitario) o el fabricante (BPM). */
  alcanceId: string
  /** Código/nombre legible del alcance. */
  alcance: string
  nombreArchivo: string
  archivoRef: string
  hash: string
  bytes: number
  vigenteDesde: string
  vigenteHasta?: string
  subidoPor: string
  subidoEn: string
  reemplazaA?: string
  motivoReemplazo?: string
}

export type EstadoDocumento = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' | 'REEMPLAZADO'
export const ETIQUETA_ESTADO_DOCUMENTO: Record<EstadoDocumento, string> = {
  VIGENTE: 'Vigente', POR_VENCER: 'Por vencer', VENCIDO: 'Vencido', REEMPLAZADO: 'Reemplazado',
}
export const DIAS_AVISO_DOCUMENTO = 30

const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)

export function estadoDocumento(d: Pick<DocumentoRegulatorio, 'vigenteHasta'>, hoy: string, reemplazado = false, diasAviso = DIAS_AVISO_DOCUMENTO): EstadoDocumento {
  if (reemplazado) return 'REEMPLAZADO'
  if (!d.vigenteHasta) return 'VIGENTE'
  const f = dias(hoy, d.vigenteHasta)
  return f < 0 ? 'VENCIDO' : f <= diasAviso ? 'POR_VENCER' : 'VIGENTE'
}

/** ¿Puede esta persona subir (o reemplazar) este documento? Devuelve el motivo si no. Espejo de wms.subir_documento_regulatorio. */
export function motivoNoPuedeSubir(roles: readonly Rol[], tipo: TipoDocumento, hayVigente: boolean): string | null {
  const dt = puede(roles, 'gestionar_documentos_regulatorios') // Dirección Técnica y el Administrador (D-196)
  if (tipo !== 'COA') return dt ? null : 'Solo Dirección Técnica y el Administrador suben o reemplazan el registro sanitario y el BPM'
  if (hayVigente) return dt ? null : 'Este lote ya tiene un COA vigente: solo Dirección Técnica y el Administrador lo reemplazan'
  return dt || roles.some((r) => r === 'jefe_almacen' || r === 'auxiliar' || r === 'asistente_dt') ? null : 'No tienes permiso para adjuntar un COA'
}

export const puedeCargarCoaEnBloque = (roles: readonly Rol[]) => roles.some((r) => r === 'direccion_tecnica' || r === 'jefe_almacen' || r === 'asistente_dt')
export const puedeDefinirPerfiles = (roles: readonly Rol[]) => roles.some((r) => r === 'direccion_tecnica' || r === 'jefe_transporte')

// ── Perfil documental del cliente y estado documental ───────────────────────────────────────────────────────────────

export interface PerfilDocumental {
  ruc: string
  exigeCoa: boolean
  exigeRegistroSanitario: boolean
  exigeBpm: boolean
  copias: number
  nota?: string
}

/** Sin perfil del cliente se exigen COA y registro sanitario (D-82). */
export const PERFIL_POR_DEFECTO = { exigeCoa: true, exigeRegistroSanitario: true, exigeBpm: false, copias: 1 } as const

export const exigidos = (p?: Pick<PerfilDocumental, 'exigeCoa' | 'exigeRegistroSanitario' | 'exigeBpm'>): Record<TipoDocumento, boolean> => ({
  COA: p?.exigeCoa ?? PERFIL_POR_DEFECTO.exigeCoa,
  REGISTRO_SANITARIO: p?.exigeRegistroSanitario ?? PERFIL_POR_DEFECTO.exigeRegistroSanitario,
  BPM: p?.exigeBpm ?? PERFIL_POR_DEFECTO.exigeBpm,
})

export type EstadoRequisito = 'OK' | 'FALTA' | 'VENCIDO' | 'VENCE_ANTES_DE_ENTREGA' | 'NO_EXIGIDO'
export const ETIQUETA_REQUISITO: Record<EstadoRequisito, string> = {
  OK: 'Completo', FALTA: 'Falta', VENCIDO: 'Vencido', VENCE_ANTES_DE_ENTREGA: 'Vence antes de la entrega', NO_EXIGIDO: 'No lo exige el cliente',
}

export interface RequisitoDocumental { tipo: TipoDocumento; exigido: boolean; estado: EstadoRequisito; documentoId?: string; nombreArchivo?: string; vigenteHasta?: string }

/** Espejo de wms.estado_documental: qué falta, qué venció y qué vence antes de la entrega, dado lo vigente de cada tipo. */
export function evaluarRequisitos(
  perfil: Pick<PerfilDocumental, 'exigeCoa' | 'exigeRegistroSanitario' | 'exigeBpm'> | undefined,
  vigentes: Partial<Record<TipoDocumento, Pick<DocumentoRegulatorio, 'id' | 'nombreArchivo' | 'vigenteHasta'>>>,
  hoy: string, entrega: string = hoy,
): RequisitoDocumental[] {
  const ex = exigidos(perfil)
  return TIPOS_DOCUMENTO.map((tipo) => {
    const d = vigentes[tipo]
    const estado: EstadoRequisito = !d ? (ex[tipo] ? 'FALTA' : 'NO_EXIGIDO')
      : d.vigenteHasta && d.vigenteHasta < hoy ? 'VENCIDO'
      : d.vigenteHasta && d.vigenteHasta < entrega ? 'VENCE_ANTES_DE_ENTREGA' : 'OK'
    return { tipo, exigido: ex[tipo], estado, documentoId: d?.id, nombreArchivo: d?.nombreArchivo, vigenteHasta: d?.vigenteHasta }
  })
}

/** El paquete está completo si ningún documento exigido falta, venció o vence antes de la entrega. */
export const paqueteCompleto = (r: readonly RequisitoDocumental[]) => r.every((x) => !x.exigido || x.estado === 'OK')

export function validarVigencia(desde: string | undefined, hasta: string | undefined): string | null {
  if (desde && hasta && hasta < desde) return 'El documento no puede vencer antes de empezar a regir.'
  return null
}

// ── Carga masiva de COA: leer el nombre del archivo y relacionarlo con un lote ──────────────────────────────────────────

export interface LoteParaRelacionar { id: string; codigo: string; productoId: string; productoCodigo: string; productoDescripcion: string }
export interface CandidatoCoa { loteId: string; lote: string; producto: string }
export type ResultadoRelacion =
  | { estado: 'RELACIONADO'; loteId: string; lote: string; producto: string; candidatos: CandidatoCoa[] }
  | { estado: 'POR_REVISAR'; motivo: string; candidatos: CandidatoCoa[] }

const alfanum = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, '')
const palabras = (s: string) => normalizar(s).split(/[^a-z0-9]+/).filter(Boolean)

/**
 * Relaciona un archivo de COA con un lote por su nombre (p. ej. «COA_L2501_Lizinopril.pdf»). Es conservador: solo propone un lote si UNO solo
 * coincide por su código (palabra completa o código pegado) y, si el mismo código existe en varios productos, el nombre desempata por el
 * código o por una palabra de la descripción del producto. Todo lo demás queda por revisar, con sus candidatos y el motivo.
 */
export function relacionarCoa(nombreArchivo: string, lotes: readonly LoteParaRelacionar[]): ResultadoRelacion {
  const base = nombreArchivo.replace(/\.[a-z0-9]{2,4}$/i, '')
  const tokens = new Set(palabras(base))
  const pegado = alfanum(base)
  const cand = (l: LoteParaRelacionar): CandidatoCoa => ({ loteId: l.id, lote: l.codigo, producto: `${l.productoCodigo} · ${l.productoDescripcion}` })
  const coincide = lotes.filter((l) => {
    const c = alfanum(l.codigo)
    if (c.length < 3) return false
    const partes = palabras(l.codigo)
    return tokens.has(c) || (partes.length > 1 && partes.every((p) => tokens.has(p))) || (c.length >= 5 && pegado.includes(c))
  })
  // Un lote cuyo código es parte de otro («L25» dentro de «L2501»): gana el más largo
  const maximos = coincide.filter((a) => !coincide.some((b) => b.id !== a.id && alfanum(b.codigo).length > alfanum(a.codigo).length && alfanum(b.codigo).includes(alfanum(a.codigo))))
  if (maximos.length === 0) return { estado: 'POR_REVISAR', motivo: 'No encontramos en el nombre ningún lote conocido.', candidatos: [] }
  if (maximos.length === 1) return { estado: 'RELACIONADO', loteId: maximos[0].id, lote: maximos[0].codigo, producto: maximos[0].productoDescripcion, candidatos: [cand(maximos[0])] }
  // Mismo código en varios productos: el nombre desempata
  const desempate = maximos.filter((l) => tokens.has(alfanum(l.productoCodigo)) || palabras(l.productoDescripcion).some((p) => p.length >= 5 && tokens.has(p)))
  if (desempate.length === 1) return { estado: 'RELACIONADO', loteId: desempate[0].id, lote: desempate[0].codigo, producto: desempate[0].productoDescripcion, candidatos: maximos.map(cand) }
  return { estado: 'POR_REVISAR', motivo: `El nombre coincide con ${maximos.length} lotes: elige el correcto.`, candidatos: maximos.map(cand) }
}

export const MAX_BYTES_DOCUMENTO = 15 * 1024 * 1024
export const EXTENSIONES_DOCUMENTO = ['pdf'] as const
export function validarArchivo(nombre: string, bytes: number): string | null {
  if (!/\.pdf$/i.test(nombre)) return 'Solo se aceptan archivos PDF.'
  if (bytes <= 0) return 'El archivo está vacío.'
  if (bytes > MAX_BYTES_DOCUMENTO) return 'El archivo pesa más de 15 MB.'
  return null
}

// ── Vistas ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DocumentoVista extends DocumentoRegulatorio {
  estado: EstadoDocumento
  /** La versión que lo reemplazó, si la hay (entonces este ya no rige). */
  reemplazadoPor?: string
  subidoPorNombre: string
}

export interface FabricanteVista { id: string; nombre: string }
export interface LoteSinCoa { loteId: string; lote: string; productoId: string; producto: string; unidades: number; vence?: string }
export interface OpcionAlcance { id: string; etiqueta: string; detalle?: string }

export type EstadoItemCoa = 'IMPORTADO' | 'POR_REVISAR' | 'DESCARTADO' | 'DUPLICADO'
export interface ItemCoaVista {
  id: string
  nombreArchivo: string
  estado: EstadoItemCoa
  loteId?: string
  lote?: string
  motivo?: string
  candidatos: CandidatoCoa[]
  cargadoEn: string
}

export interface ResumenDocumentos { vigentes: number; porVencer: number; vencidos: number; lotesSinCoa: number; porRevisar: number }

export interface PanoramaDocumentos {
  hoy: string
  documentos: DocumentoVista[]
  fabricantes: FabricanteVista[]
  perfiles: PerfilDocumental[]
  lotesSinCoa: LoteSinCoa[]
  itemsCoa: ItemCoaVista[]
  resumen: ResumenDocumentos
}

export interface EntradaSubida {
  tipo: TipoDocumento
  alcanceId: string
  nombreArchivo: string
  archivoRef: string
  hash: string
  bytes: number
  vigenteDesde?: string
  vigenteHasta?: string
  reemplazaA?: string
  motivo?: string
}

export interface ArchivoCarga { nombre: string; hash: string; bytes: number; ref: string }
export interface ResumenCargaCoa { total: number; importados: number; porRevisar: number; duplicados: number }

export function resumirDocumentos(docs: readonly DocumentoVista[], lotesSinCoa: number, porRevisar: number): ResumenDocumentos {
  const vivos = docs.filter((d) => d.estado !== 'REEMPLAZADO')
  return {
    vigentes: vivos.filter((d) => d.estado === 'VIGENTE').length,
    porVencer: vivos.filter((d) => d.estado === 'POR_VENCER').length,
    vencidos: vivos.filter((d) => d.estado === 'VENCIDO').length,
    lotesSinCoa, porRevisar,
  }
}

/** La lista del repositorio: texto, tipo y estado. Lo que venció o está por vencer va primero. */
export function filtrarDocumentos(docs: readonly DocumentoVista[], f: { q: string; tipo: '' | TipoDocumento; estado: '' | EstadoDocumento; historial: boolean }): DocumentoVista[] {
  const q = normalizar(f.q.trim())
  const orden: Record<EstadoDocumento, number> = { VENCIDO: 0, POR_VENCER: 1, VIGENTE: 2, REEMPLAZADO: 3 }
  return docs
    .filter((d) => (f.historial || d.estado !== 'REEMPLAZADO') && (!f.tipo || d.tipo === f.tipo) && (!f.estado || d.estado === f.estado)
      && (!q || q.split(/\s+/).every((t) => normalizar(`${d.alcance} ${d.nombreArchivo} ${ETIQUETA_TIPO_DOCUMENTO[d.tipo]}`).includes(t))))
    .sort((a, b) => orden[a.estado] - orden[b.estado] || (a.vigenteHasta ?? '9999').localeCompare(b.vigenteHasta ?? '9999') || a.alcance.localeCompare(b.alcance))
}
