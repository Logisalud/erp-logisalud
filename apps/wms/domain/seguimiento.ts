// Seguimiento para el cliente (Fase 4 · P9, G.2): lo que ve quien escribe su número de pedido y su RUC (o abre su enlace). Dominio puro. Solo estados con fecha y hora:
// sin hora estimada, sin precios, lotes ni datos del personal. APAGADO en modo piloto. La base (`wms.seguimiento_consultar`, `wms.seguimiento_por_token`, migración 0047) aplica lo mismo y manda.
export type HitoSeguimiento = 'RECIBIDO' | 'EN_PREPARACION' | 'LISTO' | 'EN_RUTA' | 'ENTREGADO' | 'NO_ENTREGADO' | 'CANCELADO'
export const ETIQUETA_HITO: Record<HitoSeguimiento, string> = {
  RECIBIDO: 'Pedido recibido', EN_PREPARACION: 'En preparación', LISTO: 'Listo para salir', EN_RUTA: 'En ruta', ENTREGADO: 'Entregado', NO_ENTREGADO: 'No se pudo entregar', CANCELADO: 'Pedido cancelado',
}
export const ORDEN_HITOS: readonly HitoSeguimiento[] = ['RECIBIDO', 'EN_PREPARACION', 'LISTO', 'EN_RUTA', 'ENTREGADO']
export interface HitoVista { estado: HitoSeguimiento; en: string }

/** Un documento vencido del cliente (0068): su número, cuándo venció, cuántos días de atraso lleva y cuánto falta pagar. */
export interface DocumentoVencido { documento: string; vence: string; dias: number; saldo: number }
/** El estado de pagos del cliente que consulta (0068). Sin esta información (Cobranzas no lo conoce o está apagado) no se dice nada: nunca «al día» sin datos. */
export type EstadoDePagos =
  | { estado: 'AL_DIA'; al: string }
  | { estado: 'MOROSO'; al: string; total: number; maxDias: number; cantidad: number; documentos: DocumentoVencido[] }

export type RespuestaSeguimiento =
  | { estado: 'OK'; pedido: string; hitos: HitoVista[]; deuda?: EstadoDePagos | null }
  | { estado: 'NO_ENCONTRADO' }
  | { estado: 'ESPERA'; esperaSegundos: number }
  | { estado: 'NO_DISPONIBLE' }
  | { estado: 'LISTO' }   // solo al abrir la página sin datos: el seguimiento está disponible
  | { estado: 'ERROR' }

export const TEXTO_NO_DISPONIBLE = 'Seguimiento aún no disponible'
export const TEXTO_NO_ENCONTRADO = 'No encontramos un pedido con esos datos. Revisa el número de pedido y el RUC (11 números) y vuelve a intentar.'
export const TEXTO_ERROR = 'No pudimos consultar el seguimiento en este momento. Intenta de nuevo en unos minutos.'
export const TEXTO_ENLACE_INVALIDO = 'Este enlace no es válido o ya venció. Pide uno nuevo a tu vendedor, o consulta con tu número de pedido y tu RUC.'

/** «Espera 14 minutos» a partir de los segundos que dice la base. */
export function textoEspera(segundos: number): string {
  const min = Math.max(1, Math.ceil(segundos / 60))
  return `Hiciste demasiados intentos. Por seguridad, espera ${min} ${min === 1 ? 'minuto' : 'minutos'} y vuelve a intentar.`
}

export const normalizarPedido = (t: string) => t.trim().toUpperCase().replace(/\s+/g, '')
export const normalizarRuc = (t: string) => t.replace(/\s+/g, '')

/** Errores por campo de lo que se escribe (antes de preguntar). Vacío = vale. */
export function validarConsulta(pedido: string, ruc: string): { pedido?: string; ruc?: string } {
  const e: { pedido?: string; ruc?: string } = {}
  if (normalizarPedido(pedido).length < 3) e.pedido = 'Escribe el número de tu pedido.'
  if (!/^\d{11}$/.test(normalizarRuc(ruc))) e.ruc = 'El RUC tiene 11 números.'
  return e
}

/** La línea de tiempo completa: cada paso con su hora si ya ocurrió, o pendiente. Un pedido no entregado o cancelado cierra la línea con su estado. */
export interface PasoLinea { estado: HitoSeguimiento; etiqueta: string; en?: string; hecho: boolean; actual: boolean; problema?: boolean }
export function lineaDeTiempo(hitos: readonly HitoVista[]): PasoLinea[] {
  const por = new Map<HitoSeguimiento, string>()
  for (const h of hitos) if (!por.has(h.estado) || h.en < por.get(h.estado)!) por.set(h.estado, h.en)
  const cierre: HitoSeguimiento | undefined = por.has('CANCELADO') ? 'CANCELADO' : por.has('NO_ENTREGADO') && !por.has('ENTREGADO') ? 'NO_ENTREGADO' : undefined
  const pasos = (cierre ? ORDEN_HITOS.filter((h) => h !== 'ENTREGADO') : [...ORDEN_HITOS]) as HitoSeguimiento[]
  if (cierre) pasos.push(cierre)
  const ultimoHecho = [...pasos].reverse().find((p) => por.has(p))
  return pasos.map((estado) => ({ estado, etiqueta: ETIQUETA_HITO[estado], en: por.get(estado), hecho: por.has(estado), actual: estado === ultimoHecho, problema: estado === 'NO_ENTREGADO' || estado === 'CANCELADO' }))
}

/** La IP de quien consulta, tal como la ve el servidor detrás de Vercel (la primera de `x-forwarded-for`). Solo sirve para el límite de intentos. */
export const ipDe = (xForwardedFor: string | null | undefined, xRealIp?: string | null): string => (xForwardedFor?.split(',')[0] ?? xRealIp ?? '').trim()

// ── Estado de pagos (0068) ──────────────────────────────────────────────────

export const TITULO_AL_DIA = '¡Estás al día en tus pagos! 😊'
export const TEXTO_AL_DIA = 'Gracias por la confianza.'
export const TITULO_MOROSO = 'Tus pagos pendientes'
export const TEXTO_INTRO_MOROSO = 'Estos documentos ya pasaron su fecha de pago:'
export const TEXTO_MOROSO = 'Si ya pagaste, puede que aún no lo hayamos registrado: avísale a tu asesor comercial y lo actualizamos. Gracias por tu comprensión.'

/** «S/ 1,234.50» (los saldos vienen en soles). */
export const soles = (n: number) => `S/ ${new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`

/** «1 documento vencido», «3 documentos vencidos». */
export const textoCantidadVencidos = (n: number) => `${n} ${n === 1 ? 'documento vencido' : 'documentos vencidos'}`

/** «1 día», «95 días» (el atraso mínimo de un documento vencido es 1 día). */
export const textoAtraso = (dias: number) => `${dias} ${dias === 1 ? 'día' : 'días'}`
