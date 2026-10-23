// Tipo B (por cuenta de un cliente de almacenamiento), SA-6: la orden NO va en una ruta de Logisalud ni lleva guía del WMS; se ENTREGA AL TRANSPORTISTA DEL CLIENTE.
// Al registrar la entrega la orden pasa a «Entregada al transportista» y la salida se confirma (el stock baja, igual que al confirmar la salida de una ruta).
// Espejo de `wms.registrar_entrega_transportista_cliente` (migración 0030): la base de datos manda y dice lo mismo con las mismas palabras.
import { puede } from './permisos'
import type { Rol } from './tipos'

export const puedeEntregarAlTransportistaCliente = (roles: readonly Rol[]) => puede(roles, 'entregar_al_transportista_cliente')
export const MENSAJE_SIN_PERMISO_ENTREGA = 'Solo el Jefe de Transporte o el Jefe de Almacén entregan la mercadería al transportista del cliente'

export interface EntregaTransportistaVista {
  id: string
  transportista: string
  placa?: string
  documentoRecoge?: string
  entregadoEn: string
  entregaAlmacen: string
  cargoArchivo?: string
  cargoNombre?: string
  nota?: string
  registradaPor: string
  registradaEn: string
}

export interface EntradaEntrega {
  salidaId: string
  /** Nombre del transportista o de quien recoge. */
  transportista: string
  placa?: string
  /** DNI de quien recoge (8 números). */
  documento?: string
  /** Hora real de la entrega (ISO). */
  hora: string
  /** Quién entrega por parte del almacén. */
  entregaAlmacen: string
  /** Referencia del cargo (foto o PDF) ya guardado, si se adjuntó. */
  cargoRef?: string
  cargoNombre?: string
  nota?: string
}

export const MAXIMO_CARGO_BYTES = 10 * 1024 * 1024
/** El cargo firmado por el transportista: foto (JPG o PNG) o PDF, hasta 10 MB. Opcional. */
export function validarArchivoCargo(nombre: string, bytes: number): string | null {
  if (!/\.(pdf|jpe?g|png)$/i.test(nombre)) return 'El cargo se adjunta como foto (JPG o PNG) o PDF.'
  if (bytes <= 0) return 'El archivo está vacío.'
  if (bytes > MAXIMO_CARGO_BYTES) return 'El archivo pesa más de 10 MB. Reduce su tamaño y vuelve a subirlo.'
  return null
}
export const tipoContenidoCargo = (nombre: string) => (/\.pdf$/i.test(nombre) ? 'application/pdf' : /\.png$/i.test(nombre) ? 'image/png' : 'image/jpeg')

/** Errores por campo (vacío = vale). `ahora` en ISO. Mismos mensajes que la base. */
export function validarEntrega(e: EntradaEntrega, ahora: string): Record<string, string> {
  const err: Record<string, string> = {}
  if (!e.transportista.trim()) err.transportista = 'Escribe el nombre del transportista (o de quien recoge)'
  const placa = (e.placa ?? '').trim(); const dni = (e.documento ?? '').trim()
  if (!placa && !dni) err.placa = 'Escribe la placa del vehículo o el DNI de quien recoge'
  else if (dni && !/^\d{8}$/.test(dni)) err.documento = 'El DNI tiene 8 números'
  const t = Date.parse(e.hora)
  if (!e.hora || Number.isNaN(t)) err.hora = 'Indica la hora de la entrega'
  else if (t > Date.parse(ahora) + 5 * 60_000) err.hora = 'La hora de la entrega no puede ser futura'
  if (!e.entregaAlmacen.trim()) err.entregaAlmacen = 'Escribe quién entrega por parte del almacén'
  return err
}
