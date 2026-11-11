// Buscador de guías de remisión: una fila por guía (vigente o anulada) con lo que se necesita para encontrarla y saber en qué va.
import { normalizar } from './busqueda'
import type { EstadoSunat, ModoNubefact, OrigenGuia } from './guia-electronica'

/** El estado que se muestra, en una sola palabra: lo que importa de la guía hoy. */
export type EstadoGuiaBusqueda = 'PRE_GUIA' | 'LISTA_PARA_ENVIAR' | 'ACEPTADA' | 'ENVIADA' | 'RECHAZADA' | 'ANULADA' | 'REGISTRADA' | 'DECLARADA' | 'CANCELADA'
export const ETIQUETA_ESTADO_GUIA: Record<EstadoGuiaBusqueda, string> = {
  PRE_GUIA: 'Pre-guía (sin enviar)', LISTA_PARA_ENVIAR: 'Lista para enviar', CANCELADA: 'Pre-guía cancelada',
  ACEPTADA: 'Aceptada por SUNAT', ENVIADA: 'Enviada (esperando a SUNAT)', RECHAZADA: 'Rechazada por SUNAT', ANULADA: 'Anulada', REGISTRADA: 'Registrada (sin consulta a SUNAT)', DECLARADA: 'Registrada a mano: «aceptada» lo dijo quien la registró (sin verificar)',
}
export const ESTADOS_GUIA_BUSQUEDA = Object.keys(ETIQUETA_ESTADO_GUIA) as EstadoGuiaBusqueda[]

/** A quién va la guía: un cliente (venta, muestra, por cuenta de un cliente) o un proveedor (devolución al proveedor). */
export type RolDestinatario = 'CLIENTE' | 'PROVEEDOR'

export interface GuiaFila {
  id: string
  /** Serie-número: TTT1-00000007. */
  numero: string
  salidaId: string
  salidaNumero: string
  pedidoNumero?: string
  tipoOrden?: string
  rolDestinatario: RolDestinatario
  /** Cliente o proveedor al que va la guía. */
  destinatario?: string
  ruc?: string
  rutaNumero?: string
  placa?: string
  conductor?: string
  /** Fecha de emisión (la del panel de Nubefact si la guía se registró desde el panel) o, si no hay, el día en que se registró. */
  fecha: string
  fechaTraslado?: string
  bultos?: number
  pesoKg?: number
  unidades?: number
  origen: OrigenGuia
  entorno?: ModoNubefact
  estadoSunat?: EstadoSunat
  anulada: boolean
  /** Pre-guía todavía sin enviar a Nubefact (su estado). Una guía enviada no lleva este campo. */
  preGuia?: 'PRE_GUIA' | 'LISTA_PARA_ENVIAR' | 'CANCELADA'
  motivoAnulacion?: string
  enlace?: string
  registradaPor?: string
}

export function estadoDeGuia(g: Pick<GuiaFila, 'anulada' | 'estadoSunat' | 'origen'> & { preGuia?: GuiaFila['preGuia'] }): EstadoGuiaBusqueda {
  if (g.preGuia) return g.preGuia
  if (g.anulada) return 'ANULADA'
  if (g.estadoSunat === 'RECHAZADA') return 'RECHAZADA'
  // Una guía registrada a mano (emitida en el panel o en Odoo) trae «aceptada» de quien la registró: el WMS no la verificó con Nubefact ni con SUNAT.
  if (g.estadoSunat === 'ACEPTADA') return g.origen === 'PANEL' ? 'DECLARADA' : 'ACEPTADA'
  if (g.estadoSunat === 'PENDIENTE') return 'ENVIADA'
  return 'REGISTRADA'
}

export interface FiltroGuias {
  q: string
  estado: '' | EstadoGuiaBusqueda
  rol: '' | RolDestinatario
  /** AAAA-MM-DD, ambos extremos incluidos. */
  desde: string
  hasta: string
}
export const FILTRO_GUIAS_VACIO: FiltroGuias = { q: '', estado: '', rol: '', desde: '', hasta: '' }

export type ColumnaOrdenGuias = 'fecha' | 'numero' | 'destinatario' | 'estado'
export interface OrdenGuias { columna: ColumnaOrdenGuias; sentido: 'asc' | 'desc' }

/** El texto en el que busca la caja de búsqueda: número, orden, pedido, destinatario, RUC, ruta, placa, conductor. */
export const textoDeGuia = (g: GuiaFila) => `${g.numero} ${g.salidaNumero} ${g.pedidoNumero ?? ''} ${g.destinatario ?? ''} ${g.ruc ?? ''} ${g.rutaNumero ?? ''} ${g.placa ?? ''} ${g.conductor ?? ''}`

export function filtrarGuias(guias: readonly GuiaFila[], f: FiltroGuias): GuiaFila[] {
  const t = normalizar(f.q.trim())
  const palabras = t ? t.split(/\s+/) : []
  return guias.filter((g) => {
    if (f.estado && estadoDeGuia(g) !== f.estado) return false
    if (f.rol && g.rolDestinatario !== f.rol) return false
    if (f.desde && g.fecha < f.desde) return false
    if (f.hasta && g.fecha > f.hasta) return false
    if (palabras.length) { const x = normalizar(textoDeGuia(g)); return palabras.every((p) => x.includes(p)) }
    return true
  })
}

/** Ordena sin alterar la lista de entrada; el empate lo resuelve el número de guía (de modo que el orden es siempre el mismo). */
export function ordenarGuias(guias: readonly GuiaFila[], o: OrdenGuias): GuiaFila[] {
  const signo = o.sentido === 'asc' ? 1 : -1
  const clave = (g: GuiaFila): string => o.columna === 'fecha' ? g.fecha : o.columna === 'numero' ? g.numero : o.columna === 'destinatario' ? normalizar(g.destinatario ?? '') : estadoDeGuia(g)
  return [...guias].sort((a, b) => signo * clave(a).localeCompare(clave(b)) || b.numero.localeCompare(a.numero))
}
