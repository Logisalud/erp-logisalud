// «Rótulos de caja saldo» (formato LS.ET.07, «STATUS DEL PRODUCTO (Cajas Saldo)»): el sistema llena lo que sabe (cliente, producto, R.S., lote, vencimiento y status) y deja en blanco lo que
// se hace a mano: la CANTIDAD de cada conteo y la FIRMA. La fecha de conteo viene con el día de hoy. Dos rótulos por hoja A4. Puro: lo usan la pantalla, la ruta y el PDF.
import { ETIQUETA_ESTADO } from './estados'
import type { Estado } from './tipos'
import { puede } from './permisos'
import type { Rol } from './tipos'

export const ROTULO_CODIGO = 'LS.ET.07'
export const ROTULO_TITULO = 'STATUS DEL PRODUCTO'
export const ROTULO_SUBTITULO = '(Cajas Saldo)'
export const ROTULO_ALMACENAMIENTO = 'Almacenar a una temperatura no mayor de 30ºC.'
export const ROTULOS_POR_HOJA = 2
export const MAXIMO_ROTULOS = 40

/** Los auxiliares, los jefes de almacén (Charlie y Jasury) y quien opera el almacén. */
export const puedeImprimirRotulos = (roles: readonly Rol[]) => puede(roles, 'ejecutar')

/** Una caja saldo que se puede rotular: un lote con stock en un estado sanitario. */
export interface CajaSaldo {
  /** loteId:estado */
  clave: string
  loteId: string
  estado: Estado
  productoId: string
  productoCodigo: string
  producto: string
  presentacion?: string
  registroSanitario?: string
  lote: string
  /** AAAA-MM-DD */
  vence?: string
  /** Lo que escribió la persona si el producto solo muestra mes y año («06/2028»). */
  venceTexto?: string
  propietario: string
  cantidad: number
}

export interface DatosRotulo {
  usuario: string
  producto: string
  registroSanitario?: string
  lote: string
  vencimiento: string
  status: StatusRotulo
  /** DD/MM/AAAA: la fecha del conteo (va en la primera casilla de «F.CONT.»; la cantidad y la firma quedan en blanco). */
  fechaConteo: string
}

export interface StatusRotulo { texto: string; color: string; textoColor: string }
/** El status que lleva el rótulo: verde «APROBADO» para el stock aprobado; los demás estados dicen cuál es y no van en verde. */
export function statusDeRotulo(estado: Estado): StatusRotulo {
  if (estado === 'APROBADO') return { texto: 'APROBADO', color: '#6aa84f', textoColor: '#111827' }
  if (estado === 'CUARENTENA') return { texto: 'CUARENTENA', color: '#f1c232', textoColor: '#111827' }
  return { texto: ETIQUETA_ESTADO[estado].toUpperCase(), color: '#cc4125', textoColor: '#ffffff' }
}

const dos = (n: number) => String(n).padStart(2, '0')
/** «2028-06-30» → «30/06/2028»; sin fecha, vacío. */
export const fechaDDMMAAAA = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
/** El vencimiento como lo muestra el sistema: el texto que escribió la persona («06/2028») o mes y año del día de vencimiento. */
export function textoVencimiento(c: Pick<CajaSaldo, 'vence' | 'venceTexto'>): string {
  if (c.venceTexto?.trim()) return c.venceTexto.trim()
  return c.vence ? `${c.vence.slice(5, 7)}/${c.vence.slice(0, 4)}` : ''
}

export function datosDeRotulo(c: CajaSaldo, hoy: string): DatosRotulo {
  return {
    usuario: c.propietario, producto: [c.producto, c.presentacion].filter(Boolean).join(' · '), registroSanitario: c.registroSanitario, lote: c.lote,
    vencimiento: textoVencimiento(c), status: statusDeRotulo(c.estado), fechaConteo: fechaDDMMAAAA(hoy) || `${dos(new Date().getDate())}/${dos(new Date().getMonth() + 1)}/${new Date().getFullYear()}`,
  }
}

/** Lo que se pide imprimir: cada caja con cuántos rótulos. */
export interface PedidoRotulo { clave: string; copias: number }
/** «loteId:ESTADO:copias,…» (la dirección del PDF) ↔ lista. */
export function codificarPedido(p: readonly PedidoRotulo[]): string { return p.map((x) => `${x.clave}:${x.copias}`).join(',') }
export function decodificarPedido(texto: string | null | undefined): PedidoRotulo[] {
  const out: PedidoRotulo[] = []
  for (const parte of (texto ?? '').split(',')) {
    const m = /^([0-9a-zA-Z_.-]+:[A-Z_]+):(\d{1,2})$/.exec(parte.trim())
    if (m) out.push({ clave: m[1], copias: Math.min(Math.max(Number(m[2]), 1), 20) })
  }
  return out
}
/** Errores para imprimir (vacío = vale). */
export function validarPedidoRotulos(p: readonly PedidoRotulo[]): string | null {
  if (p.length === 0) return 'Elige al menos una caja para rotular'
  const total = p.reduce((t, x) => t + x.copias, 0)
  if (total > MAXIMO_ROTULOS) return `Son demasiados rótulos de una vez (${total}); imprime hasta ${MAXIMO_ROTULOS}`
  return null
}
/** La fecha del conteo que se puede cambiar en pantalla: AAAA-MM-DD real y no posterior a hoy. Si no sirve, vale hoy. */
export function fechaDeConteo(texto: string | null | undefined, hoy: string): string {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return hoy
  const d = new Date(`${texto}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== texto || texto > hoy) return hoy
  return texto
}

export const totalRotulos = (p: readonly PedidoRotulo[]) => p.reduce((t, x) => t + x.copias, 0)
