// «Ya no sale»: el vendedor avisa, con la orden ya hecha o ya pickeada, que el pedido ya no sale. Una sola acción del Jefe, con motivo (migración 0064). Espejo de `wms.ya_no_sale`.
import { puedePrepararSalidas } from './despacho'
import type { Rol } from './tipos'

export const puedeYaNoSale = (roles: readonly Rol[]) => puedePrepararSalidas(roles)
export const MINIMO_MOTIVO_YA_NO_SALE = 5

export interface ResultadoYaNoSale { cancelada: boolean; porDevolver: number; preGuia?: string }

/** Mismo texto que la base de datos. null = el motivo sirve. */
export const validarMotivoYaNoSale = (motivo: string): string | null => (motivo.trim().length < MINIMO_MOTIVO_YA_NO_SALE ? 'Cuenta por qué ya no sale (al menos 5 letras)' : null)

/** ¿Se ofrece el botón? Con guía registrada o enviada se anula primero la guía; con la orden cerrada o ya por cancelarse no hay nada que hacer. */
export function ofrecerYaNoSale(s: { estado: string; etapa: string; tipo?: string; ordenPickingId?: string; cancelacionPendiente?: boolean }, hayGuia: boolean): 'SI' | 'ANULAR_GUIA' | 'NO' {
  if (s.estado !== 'ABIERTA' || s.cancelacionPendiente || s.tipo === 'CLIENTE') return 'NO'
  if (!s.ordenPickingId) return 'NO'                       // sin picking se usa «Cancelar la orden»
  if (['CARGADA', 'CONFIRMADA', 'ENTREGADA_AL_TRANSPORTISTA', 'POR_DEVOLVER_PICKING', 'CANCELADA'].includes(s.etapa)) return 'NO'
  return hayGuia ? 'ANULAR_GUIA' : 'SI'
}

/** Lo que se le cuenta a quien lo hizo cuando termina. */
export function textoResultadoYaNoSale(r: ResultadoYaNoSale, rehacer: boolean): string {
  const preGuia = r.preGuia ? ` La pre-guía ${r.preGuia} se canceló y su número no se reutiliza.` : ''
  if (r.cancelada) return `Listo: la orden se canceló.${preGuia} ${rehacer ? 'El pedido volvió a la bandeja para crear una orden nueva.' : 'Se avisó al Jefe de Transporte para que el área comercial cancele el pedido en Pedidos.'}`
  return `La orden quedó por cancelarse: falta devolver ${r.porDevolver.toLocaleString('es-PE')} ${r.porDevolver === 1 ? 'unidad' : 'unidades'} a su ubicación. El auxiliar las devuelve y otra persona lo verifica; después la orden se cancela sola.${preGuia}`
}
