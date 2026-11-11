// «Ruta del día»: la hoja interna que Roberto entrega al transportista para que sepa su ruta (columnas del formato RUTA DEL dd/mm/aaaa).
import type { RutaVista } from './rutas'
import { ETIQUETA_TIPO_SALIDA } from './salida-manual'

export interface FilaRutaDelDia {
  n: number
  cliente: string
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

/** Arma la hoja de la ruta. `guiaPorSalida`: el serie-número de la guía o de la pre-guía de cada orden (la guía enviada manda sobre la pre-guía). Lo que no se sabe se escribe «—»: nunca se inventa. */
export function armarRutaDelDia(ruta: RutaVista, guiaPorSalida: ReadonlyMap<string, string>): RutaDelDia {
  const transportista = ruta.conductor?.nombre ?? '—'
  const filas = [...ruta.paradas].sort((a, b) => a.secuencia - b.secuencia).map((p, i): FilaRutaDelDia => ({
    n: i + 1, cliente: p.cliente || '—', condicion: condicionDeParada(p.tipoOrden), guia: (p.salidaId && guiaPorSalida.get(p.salidaId)) || '—',
    direccion: p.direccion || '—', destino: p.distrito || '—', transportista, representante: p.vendedor || '—', formaPago: p.condicionPago || '—', horario: p.ventanaCita || '—',
  }))
  return { numero: ruta.numero, fecha: ruta.fecha, vehiculo: ruta.vehiculo?.placa, conductor: ruta.conductor?.nombre, auxiliar: ruta.auxiliar?.nombre, filas }
}
