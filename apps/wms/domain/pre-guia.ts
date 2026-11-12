// Pre-guía: el borrador de la guía de remisión que el WMS arma al dar la conformidad. Reserva el número de la serie (T…) pero NO existe ante SUNAT: al enviar, Nubefact la genera con ese mismo número.
import { numeroConSerie } from './numeracion-guias'

export type EstadoPreGuia = 'PRE_GUIA' | 'LISTA_PARA_ENVIAR' | 'ENVIADA' | 'CANCELADA'
export const ETIQUETA_ESTADO_PRE_GUIA: Record<EstadoPreGuia, string> = {
  PRE_GUIA: 'Pre-guía', LISTA_PARA_ENVIAR: 'Lista para enviar', ENVIADA: 'Enviada a Nubefact', CANCELADA: 'Pre-guía cancelada',
}

export interface PreGuiaVista {
  salidaId: string
  serie: string
  numero: number
  /** Serie-número, con ocho dígitos: TTT1-00000007. */
  numeroCompleto: string
  estado: EstadoPreGuia
  /** Del que sea el vehículo y el conductor de la ruta de la orden; en blanco hasta que haya ruta. */
  rutaNumero?: string
  placa?: string
  conductor?: string
  entorno?: string
  motivoCancelacion?: string
}

/** El estado de la pre-guía: lo decide lo que ya existe (guía enviada, cancelación, ruta con vehículo y conductor). No se guarda aparte: así nunca se desactualiza. */
export function estadoDePreGuia(d: { cancelada?: boolean; guiaEnviada?: boolean; placa?: string | null; conductor?: string | null }): EstadoPreGuia {
  if (d.guiaEnviada) return 'ENVIADA'
  if (d.cancelada) return 'CANCELADA'
  return d.placa && d.conductor ? 'LISTA_PARA_ENVIAR' : 'PRE_GUIA'
}

/**
 * La constancia de recepción del transportista (T° de salida, quién alistó, quién atendió, la firma y el DNI del transportista, «Recibí conforme»): va en la pre-guía que se imprime
 * DESPUÉS del ruteo, cuando ya hay vehículo y conductor y la hoja viaja con el pedido. Antes del ruteo no hay transportista a quien hacérsela firmar.
 */
export const mostrarConstanciaDeRecepcion = (p: Pick<PreGuiaVista, 'placa' | 'conductor'>) => !!p.placa && !!p.conductor

/** «Responsable de alistar pedido» de la constancia: quien hizo el picking, que el sistema ya sabe (la orden y sus líneas); si fueron varios, todos, sin repetir. */
export function quienAlisto(orden: { picker?: string; lineasDetalle?: readonly { picker?: string }[] } | null | undefined): string | undefined {
  if (!orden) return undefined
  const nombres = new Set<string>()
  if (orden.picker?.trim()) nombres.add(orden.picker.trim())
  for (const l of orden.lineasDetalle ?? []) if (l.picker?.trim()) nombres.add(l.picker.trim())
  return nombres.size ? [...nombres].join(', ') : undefined
}

export const numeroDePreGuia = (serie: string, numero: number) => numeroConSerie(serie, numero)

/** Lo que falta para poder enviarla; vacío si ya se puede. */
export function faltaParaEnviar(p: Pick<PreGuiaVista, 'estado' | 'placa' | 'conductor' | 'rutaNumero'>): string | null {
  if (p.estado === 'ENVIADA') return 'Esta guía ya se envió a Nubefact.'
  if (p.estado === 'CANCELADA') return 'La pre-guía está cancelada.'
  if (!p.rutaNumero) return 'Todavía no hay ruta: asigna este pedido a una ruta con vehículo y conductor para poder enviar la guía.'
  if (!p.placa || !p.conductor) return 'La ruta todavía no tiene vehículo y conductor: complétalos para poder enviar la guía.'
  return null
}

/** Aviso para quien lleva las cuentas: el número queda reservado, y en el piloto no se factura. */
export const textoAvisoContabilidad = (numero: string, piloto: boolean) => `Pre-guía ${numero} reservada.${piloto ? ' PRUEBA, NO FACTURAR.' : ''}`
