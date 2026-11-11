// «Mis rutas» (Fase 4 · P4; S9 y S10): el conductor y el auxiliar de transporte ven sus rutas del día en el celular y marcan, por parada, llegué, entregado (con quién recibió y la
// foto), no entregado, rechazado e incidencia. Puro: lo usan la demo, las acciones y la pantalla. La base (`wms.registrar_evento_parada`, migración 0043) aplica las mismas reglas y manda.
import { puede } from './permisos'
import type { EstadoRuta } from './rutas'
import type { Rol } from './tipos'

export type EventoParada = 'LLEGUE' | 'ENTREGADO' | 'NO_ENTREGADO' | 'RECHAZADO' | 'INCIDENCIA'
export const EVENTOS_PARADA: readonly EventoParada[] = ['LLEGUE', 'ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO', 'INCIDENCIA']
export const ETIQUETA_EVENTO: Record<EventoParada, string> = { LLEGUE: 'Llegué', ENTREGADO: 'Entregado', NO_ENTREGADO: 'No entregado', RECHAZADO: 'Rechazado', INCIDENCIA: 'Incidencia' }
export type EstadoParadaMia = 'PENDIENTE' | 'LLEGUE' | 'ENTREGADO' | 'NO_ENTREGADO' | 'RECHAZADO'
export const ETIQUETA_ESTADO_PARADA: Record<EstadoParadaMia, string> = { PENDIENTE: 'Por visitar', LLEGUE: 'Llegué', ENTREGADO: 'Entregado', NO_ENTREGADO: 'No entregado', RECHAZADO: 'Rechazado' }

/** La conformidad del cliente en la entrega (formato CONFORMIDAD): si no quedó conforme, qué no coincidió. */
export type TipoDiferenciaEntrega = 'CANTIDAD' | 'DESCRIPCION' | 'LOTE' | 'DOCUMENTO'
export const TIPOS_DIFERENCIA_ENTREGA: readonly TipoDiferenciaEntrega[] = ['CANTIDAD', 'DESCRIPCION', 'LOTE', 'DOCUMENTO']
export const ETIQUETA_DIFERENCIA_ENTREGA: Record<TipoDiferenciaEntrega, string> = { CANTIDAD: 'Cantidad', DESCRIPCION: 'Descripción', LOTE: 'Lote', DOCUMENTO: 'Documento' }

export const puedeVerMisRutas = (roles: readonly Rol[]) => puede(roles, 'mis_rutas')
/** Quien solo tiene «Mis rutas» (conductor, auxiliar de transporte): no lee el inventario y su Inicio es esta pantalla. */
export const soloMisRutas = (roles: readonly Rol[]) => puedeVerMisRutas(roles) && !roles.some((r) => !['conductor', 'auxiliar_transporte'].includes(r))

export const TEXTO_PILOTO_MIS_RUTAS = 'PILOTO: esto no reemplaza el proceso actual. Sigue llenando el formato en papel y entregando con la guía firmada; lo que marques aquí es de prueba y se borra el 1 de diciembre.'

export interface EventoParadaVista { id: string; evento: EventoParada; motivo?: string; recibioNombre?: string; recibioDocumento?: string; fotoNombre?: string; hora: string; conforme?: boolean; tipoDiferencia?: TipoDiferenciaEntrega; detalleDiferencia?: string }
export interface ParadaMia {
  id: string; secuencia: number; cliente: string; direccion?: string; distrito?: string; ventanaCita?: string; pedidoNumero?: string; ordenNumero?: string; unidades: number
  eventos: EventoParadaVista[]
  estado: EstadoParadaMia
}
export interface RutaMia { id: string; numero: string; fecha: string; estado: EstadoRuta; vehiculo?: string; conductor?: string; auxiliar?: string; paradas: ParadaMia[]; puedeMarcar: boolean }

const TERMINALES: readonly EventoParada[] = ['ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO']
export const esTerminal = (e: EventoParada) => TERMINALES.includes(e)

/** El estado de una parada sale de sus eventos: el resultado (entregado, no entregado, rechazado) si lo hay; si no, «llegué» si ya llegó; si no, por visitar. */
export function estadoDeParada(eventos: readonly Pick<EventoParadaVista, 'evento'>[]): EstadoParadaMia {
  const t = eventos.find((e) => esTerminal(e.evento))
  if (t) return t.evento as EstadoParadaMia
  return eventos.some((e) => e.evento === 'LLEGUE') ? 'LLEGUE' : 'PENDIENTE'
}

/** Las entregas se registran con la ruta en camino. */
export const RUTA_PERMITE_MARCAR: readonly EstadoRuta[] = ['EN_RUTA', 'PENDIENTE_CIERRE']

/** Qué botones se ofrecen ahora en una parada (los mismos órdenes que la base). */
export function eventosPosibles(estado: EstadoParadaMia, rutaPuedeMarcar: boolean): EventoParada[] {
  if (!rutaPuedeMarcar) return []
  if (estado === 'PENDIENTE') return ['LLEGUE', 'NO_ENTREGADO', 'INCIDENCIA']
  if (estado === 'LLEGUE') return ['ENTREGADO', 'RECHAZADO', 'NO_ENTREGADO', 'INCIDENCIA']
  return ['INCIDENCIA']   // con su resultado ya no cambia; una incidencia se puede anotar siempre
}

export const MAXIMO_FOTO_BYTES = 10 * 1024 * 1024
export function validarFoto(nombre: string, bytes: number, tipo?: string): string | null {
  if (!nombre.trim() || bytes <= 0) return 'Toma o elige la foto de la entrega.'
  if (!/\.(jpe?g|png|webp|heic)$/i.test(nombre) && !(tipo ?? '').startsWith('image/')) return 'La foto debe ser una imagen (JPG, PNG o WEBP).'
  if (bytes > MAXIMO_FOTO_BYTES) return 'La foto pesa más de 10 MB: toma otra con menos calidad.'
  return null
}

export interface DatosEvento { motivo?: string; recibioNombre?: string; recibioDocumento?: string; tieneFoto?: boolean; conforme?: boolean; tipoDiferencia?: string }
/** Errores por campo, con los mismos textos que la base. Vacío = vale. */
export function validarEventoParada(evento: EventoParada, d: DatosEvento): Record<string, string> {
  const e: Record<string, string> = {}
  if (evento === 'ENTREGADO') {
    if ((d.recibioNombre ?? '').trim().length < 3) e.recibioNombre = 'Escribe el nombre de quien recibió'
    if (!/^\d{8}$/.test((d.recibioDocumento ?? '').trim())) e.recibioDocumento = 'El DNI de quien recibió tiene 8 números'
    if (!d.tieneFoto) e.foto = 'Falta la foto de la entrega'
    if (d.conforme === false && !TIPOS_DIFERENCIA_ENTREGA.includes(d.tipoDiferencia as TipoDiferenciaEntrega)) e.tipoDiferencia = 'Elige qué no coincidió: cantidad, descripción, lote o documento'
  } else if (evento === 'NO_ENTREGADO' || evento === 'RECHAZADO' || evento === 'INCIDENCIA') {
    if ((d.motivo ?? '').trim().length < 5) e.motivo = 'Cuéntanos el motivo (al menos 5 letras)'
  }
  return e
}

/** Por qué un evento no se puede ahora (vacío = se puede). */
export function motivoNoSePuede(evento: EventoParada, estado: EstadoParadaMia, rutaPuedeMarcar: boolean): string | null {
  if (!rutaPuedeMarcar) return 'La ruta todavía no salió: las entregas se registran cuando está en ruta'
  if (evento === 'INCIDENCIA') return null
  if (esTerminal(estado as EventoParada)) return 'Esta parada ya tiene su resultado: no se cambia (si hubo un error, avisa al Jefe de Transporte)'
  if (evento === 'LLEGUE' && estado === 'LLEGUE') return 'Ya marcaste que llegaste a esta parada'
  if ((evento === 'ENTREGADO' || evento === 'RECHAZADO') && estado !== 'LLEGUE') return 'Primero marca «Llegué» en esta parada'
  return null
}

/** ¿Todas las paradas tienen su resultado? (la ruta pasa a «Pendiente de cierre»). */
export const todasResueltas = (paradas: readonly Pick<ParadaMia, 'estado'>[]) => paradas.length > 0 && paradas.every((p) => esTerminal(p.estado as EventoParada))

/** Lo que alimenta el LS-FR.43.03 por parada: hora de entrega y observaciones (quién recibió, o el motivo de lo que no se entregó). */
export function datosParaLsFr(eventos: readonly EventoParadaVista[]): { horaEntrega?: string; observaciones?: string } {
  const t = eventos.find((e) => esTerminal(e.evento))
  const incidencias = eventos.filter((e) => e.evento === 'INCIDENCIA').map((e) => `Incidencia: ${e.motivo}`)
  const partes: string[] = []
  if (t?.evento === 'ENTREGADO') partes.push(`Recibió ${t.recibioNombre} (DNI ${t.recibioDocumento})`)
  else if (t) partes.push(`${ETIQUETA_EVENTO[t.evento]}: ${t.motivo}`)
  partes.push(...incidencias)
  return { horaEntrega: t?.evento === 'ENTREGADO' ? t.hora : undefined, observaciones: partes.length ? partes.join(' · ') : undefined }
}

export const AVISO_RETORNO_POR_ORIGINAR = 'Avisamos al Jefe de Transporte para que registre el retorno de este pedido (Orden de Salida → Devoluciones). Tú no tienes que hacer nada más.'
