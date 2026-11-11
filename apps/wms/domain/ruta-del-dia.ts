// «Ruta del día»: la hoja interna que Roberto entrega al transportista para que sepa su ruta (columnas del formato RUTA DEL dd/mm/aaaa).
import type { RutaVista } from './rutas'
import { ETIQUETA_TIPO_SALIDA } from './salida-manual'

export interface FilaRutaDelDia {
  n: number
  cliente: string
  /** El teléfono del cliente (lo que Pedidos trae del contacto principal): «# CLIENTE» de la hoja. */
  telefono: string
  /** DESPACHO para una venta; para una muestra o una devolución al proveedor, su tipo. */
  condicion: string
  guia: string
  direccion: string
  destino: string
  transportista: string
  representante: string
  formaPago: string
  horario: string
}
export interface RutaDelDia { numero: string; fecha: string; vehiculo?: string; conductor?: string; auxiliar?: string; filas: FilaRutaDelDia[] }

/** La condición de la parada: DESPACHO si es una venta (de la bandeja o a mano), y el nombre del tipo en los demás casos. */
export const condicionDeParada = (tipo?: string): string => (!tipo || tipo === 'DISTRIBUCION' || tipo === 'CLIENTE' ? 'DESPACHO' : (ETIQUETA_TIPO_SALIDA as Record<string, string>)[tipo]?.toUpperCase() ?? tipo)

/** El serie-número de la guía de cada orden: la guía enviada manda sobre la pre-guía; una anulada o una pre-guía cancelada no cuentan. */
export function guiaPorSalida(guias: readonly { salidaId: string; numero: string; anulada?: boolean; preGuia?: string }[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const g of [...guias].sort((a, b) => Number(!!b.preGuia) - Number(!!a.preGuia))) if (!g.anulada && g.preGuia !== 'CANCELADA') m.set(g.salidaId, g.numero)
  return m
}

/** Arma la hoja de la ruta. `guiaPorSalida`: el serie-número de la guía o de la pre-guía de cada orden (la guía enviada manda sobre la pre-guía). Lo que no se sabe se escribe «—»: nunca se inventa. */
export function armarRutaDelDia(ruta: RutaVista, guiaPorSalida: ReadonlyMap<string, string>): RutaDelDia {
  const transportista = ruta.conductor?.nombre ?? '—'
  const filas = [...ruta.paradas].sort((a, b) => a.secuencia - b.secuencia).map((p, i): FilaRutaDelDia => ({
    n: i + 1, cliente: p.cliente || '—', telefono: p.telefono || '—', condicion: condicionDeParada(p.tipoOrden), guia: (p.salidaId && guiaPorSalida.get(p.salidaId)) || '—',
    direccion: p.direccion || '—', destino: p.distrito || '—', transportista, representante: p.vendedor || '—', formaPago: p.condicionPago || '—', horario: p.ventanaCita || '—',
  }))
  return { numero: ruta.numero, fecha: ruta.fecha, vehiculo: ruta.vehiculo?.placa, conductor: ruta.conductor?.nombre, auxiliar: ruta.auxiliar?.nombre, filas }
}
