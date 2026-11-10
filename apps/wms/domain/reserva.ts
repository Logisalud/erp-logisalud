// Reserva de un lote (DT, 2026-10-17): es un ESTADO, no un área. El lote sigue Aprobado, pero no se puede asignar a pedidos ni pickear.
// La aplican y la quitan el Jefe de Transporte y Dirección Técnica, con motivo; la historia completa queda (nada se borra).
import { puede } from './permisos'
import type { Rol } from './tipos'

export interface ReservaLoteVista {
  id: string
  loteId: string
  lote: string
  productoCodigo: string
  producto: string
  motivo: string
  aplicadaPor: string
  aplicadaEn: string
  /** Solo las que ya se quitaron. */
  quitadaPor?: string
  quitadaEn?: string
  motivoQuita?: string
}

export const reservaVigente = (r: ReservaLoteVista) => !r.quitadaEn

export const puedeReservarLote = (roles: readonly Rol[]) => puede(roles, 'reservar_lote')

export const AYUDA_RESERVA = 'En Reserva el lote sigue Aprobado, pero no se puede asignar a pedidos ni pickear hasta que se quite la Reserva.'

export const mensajeLoteEnReserva = (lote: string) => `El lote ${lote} está en Reserva: no se puede pickear. Cambia el lote en la Orden de Salida.`
