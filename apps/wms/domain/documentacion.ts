// Documentación final de una salida (S6b): guía de remisión registrada a mano y paquete documental de los lotes que salen.
// Espejo de las funciones de la migración 0019 (la base de datos manda): wms.registrar_gre, wms.anular_gre, wms.paquete_documental.
import { puede } from './permisos'
import { ETIQUETA_TIPO_DOCUMENTO, paqueteCompleto, type RequisitoDocumental, type TipoDocumento } from './documentos'
import type { Rol } from './tipos'

export const puedeRegistrarDocumentacion = (roles: readonly Rol[]) => puede(roles, 'registrar_documentacion')
export const puedeImprimirPaquete = (roles: readonly Rol[]) => puede(roles, 'imprimir_paquete_documental')

/** T001-00001234, EG07-00002031: serie de 4 caracteres (empieza con letra), guion y correlativo. */
export const FORMATO_GRE = /^[A-Z][A-Z0-9]{3}-[0-9]{1,8}$/
export const normalizarNumeroGre = (n: string) => n.trim().toUpperCase()
export function validarNumeroGre(n: string): string | null {
  return FORMATO_GRE.test(normalizarNumeroGre(n)) ? null : 'El número de la guía se escribe como T001-00001234 (serie, guion y número)'
}

export interface LineaGuia { productoCodigo: string; producto: string; lote: string; vence: string | null; cantidad: number }
export interface GuiaVista {
  id: string
  numero: string
  estado: 'VIGENTE' | 'ANULADA'
  /** Lo confirmado en la conformidad (no se vuelve a escribir). */
  lineas: LineaGuia[]
  placa?: string
  fechaTraslado?: string
  nota?: string
  registradaPor: string
  registradaEn: string
  anuladaMotivo?: string
  anuladaEn?: string
}

/** Un lote que sale y los documentos que pide el cliente para él. */
export interface ItemPaquete {
  lineaId: string
  productoId: string
  productoCodigo: string
  producto: string
  loteId: string
  lote: string
  cantidad: number
  requisitos: RequisitoDocumental[]
}

export interface PaqueteSalida {
  salidaId: string
  salidaNumero: string
  pedidoNumero?: string
  cliente?: string
  ruc?: string
  /** Todo el pedido tiene la conformidad: desde ahí se puede registrar la guía. */
  conforme: boolean
  guia?: GuiaVista
  guiasAnuladas: GuiaVista[]
  items: ItemPaquete[]
  completo: boolean
  /** En palabras: «COA del lote L2515 (falta)». */
  faltantes: string[]
  copias: number
}

export const ETIQUETA_REQUISITO_CORTA = { OK: 'Listo', FALTA: 'Falta', VENCIDO: 'Vencido', VENCE_ANTES_DE_ENTREGA: 'Vence antes de la entrega', NO_EXIGIDO: 'No lo pide el cliente' } as const

const de = (tipo: TipoDocumento, i: Pick<ItemPaquete, 'lote' | 'productoCodigo' | 'producto'>) =>
  tipo === 'COA' ? `COA del lote ${i.lote}` : tipo === 'BPM' ? `BPM de ${i.productoCodigo}` : `registro sanitario de ${i.productoCodigo}`

/** Los documentos exigidos que faltan o están vencidos, con el mismo texto que la alerta de la base de datos. */
export function faltantesDelPaquete(items: readonly ItemPaquete[]): string[] {
  const out: string[] = []
  for (const i of items) for (const r of i.requisitos) {
    if (!r.exigido || r.estado === 'OK') continue
    out.push(`${de(r.tipo, i)} (${r.estado === 'FALTA' ? 'falta' : r.estado === 'VENCIDO' ? 'vencido' : 'vence antes de la entrega'})`)
  }
  return out
}

export const paqueteDeItemsCompleto = (items: readonly ItemPaquete[]) => items.every((i) => paqueteCompleto(i.requisitos))

/** Por qué no se puede registrar la guía todavía (null = se puede). */
export function motivoNoPuedeRegistrarGuia(roles: readonly Rol[], p: Pick<PaqueteSalida, 'conforme' | 'guia'>): string | null {
  if (!puedeRegistrarDocumentacion(roles)) return 'No tienes permiso para registrar la guía de remisión'
  if (p.guia) return 'Este pedido ya tiene una guía registrada. Para cambiarla, anúlala con el motivo y registra la nueva'
  if (!p.conforme) return 'La guía se registra cuando todo el pedido tiene la conformidad: sus lotes salen de lo confirmado'
  return null
}

/** Documentos únicos del paquete, en el orden en que se imprimen: por producto (registro sanitario, BPM) y por lote (COA). */
export interface DocumentoDePaquete { documentoId: string; tipo: TipoDocumento; titulo: string; nombreArchivo: string; archivoRef?: string }
export function documentosDelPaquete(items: readonly ItemPaquete[]): DocumentoDePaquete[] {
  const vistos = new Set<string>(); const out: DocumentoDePaquete[] = []
  for (const i of items) {
    const orden: TipoDocumento[] = ['REGISTRO_SANITARIO', 'BPM', 'COA']
    for (const t of orden) {
      const r = i.requisitos.find((x) => x.tipo === t)
      if (!r?.documentoId || !r.exigido || r.estado === 'VENCIDO' || vistos.has(r.documentoId)) continue
      vistos.add(r.documentoId)
      out.push({ documentoId: r.documentoId, tipo: t, titulo: `${ETIQUETA_TIPO_DOCUMENTO[t]} · ${t === 'COA' ? `lote ${i.lote}` : `${i.productoCodigo} ${i.producto}`}`, nombreArchivo: r.nombreArchivo ?? 'documento.pdf' })
    }
  }
  return out
}
