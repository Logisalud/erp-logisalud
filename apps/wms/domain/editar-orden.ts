// «Editar» la Orden de Salida (migración 0059): solo una orden MANUAL (la que viene de Pedidos se cambia en Pedidos); qué se puede cambiar según EN QUÉ ETAPA está. Puro: lo usan la demo, la pantalla y las acciones;
// la base (`wms.editar_orden_salida`) aplica las mismas reglas y manda.
import { puedePrepararSalidas, type SalidaVista } from './despacho'
import { validarUbigeo } from './salida-manual'
import type { Rol } from './tipos'

export const puedeEditarOrden = (roles: readonly Rol[]) => puedePrepararSalidas(roles)

export interface ReglasEdicion {
  /** La orden es manual, está abierta y la persona puede editar algo. Una orden que viene de Pedidos no se edita aquí. */
  editable: boolean
  /** La nota de una orden manual se puede cambiar mientras esté abierta. */
  nota: boolean
  /** El destinatario escrito a mano y las cantidades de las líneas: solo una orden manual, sin pedido unido, antes del picking y sin guía. */
  estructura: boolean
  /** Por qué no se pueden cambiar líneas ni destinatario (vacío si se puede). */
  motivoSinEstructura: string | null
}

export const MOTIVO_CON_PICKING = 'La orden ya empezó el picking: no se cambian sus líneas ni su destinatario desde aquí.'
export const MOTIVO_CON_GUIA = 'La orden ya tiene su guía: no se cambian sus líneas ni su destinatario.'

export function reglasDeEdicion(s: Pick<SalidaVista, 'estado' | 'creadaDesde' | 'origen' | 'conPedido' | 'ordenPickingId' | 'guia' | 'clienteManual' | 'sinPedido'>, roles: readonly Rol[]): ReglasEdicion {
  const abierta = s.estado === 'ABIERTA'
  // Una orden manual que ya recibió su pedido (conPedido) pasa a seguir a Pedidos: ya no se edita aquí.
  const deMano = s.creadaDesde === 'MANUAL' && !s.conPedido && !!s.clienteManual
  const puede = abierta && deMano && puedeEditarOrden(roles)
  const motivo = s.ordenPickingId ? MOTIVO_CON_PICKING : s.guia ? MOTIVO_CON_GUIA : null
  return { editable: puede, nota: puede, estructura: puede && motivo === null, motivoSinEstructura: puede ? motivo : null }
}

export interface CambiosOrden {
  nota?: string
  destinatario?: { ruc?: string; razonSocial?: string; direccion?: string; ubigeo?: string }
  lineas?: { lineaId: string; cantidad: number }[]
}
export const MAXIMO_NOTA = 500

/** Errores por campo (mismos textos que la base). Vacío = vale. */
export function validarCambiosOrden(c: CambiosOrden, motivo: string | undefined): Record<string, string> {
  const e: Record<string, string> = {}
  if ((c.nota ?? '').length > MAXIMO_NOTA) e.nota = `La nota es demasiado larga (máximo ${MAXIMO_NOTA} letras)`
  const d = c.destinatario
  if (d) {
    if (d.ruc !== undefined && !/^(\d{8}|\d{11})$/.test(d.ruc.trim())) e.ruc = 'El RUC tiene 11 números (o el DNI, 8)'
    if (d.ubigeo !== undefined) { const m = validarUbigeo(d.ubigeo); if (m) e.ubigeo = m }
    if (d.razonSocial !== undefined && !d.razonSocial.trim()) e.razonSocial = 'Escribe la razón social del cliente'
    if (d.direccion !== undefined && !d.direccion.trim()) e.direccion = 'Escribe la dirección de entrega'
  }
  for (const l of c.lineas ?? []) if (!Number.isInteger(l.cantidad) || l.cantidad < 1) e.lineas = 'La cantidad debe ser un número entero desde 1 (para quitar una línea, cancela la orden y crea otra)'
  if ((c.destinatario || (c.lineas && c.lineas.length)) && (motivo ?? '').trim().length < 5) e.motivo = 'Escribe por qué cambias la orden (al menos 5 letras)'
  return e
}
