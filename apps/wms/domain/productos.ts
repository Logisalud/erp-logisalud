import type { Rol } from './tipos'
import { puedeCrearProducto, puedeValidarProducto } from './permisos'
import { parsearVencimiento } from './fechas'

export interface EntradaProducto {
  codigo: string
  descripcion: string
  presentacion?: string
  marca?: string
  principioActivo?: string
  unidadMedida?: string
  registroSanitario?: string
  /** Texto tal como lo escribe la persona: 2030-06-30, 30/06/2030 o 06/2030. */
  rsVence?: string
  fabricante?: string
  formaPresentacion?: string
}

export type ErroresProducto = Partial<Record<keyof EntradaProducto, string>>

/** Validación de la alta (el mismo criterio que la base de datos, pero con mensajes campo por campo). */
export function validarEntradaProducto(e: EntradaProducto): { ok: true; rsVence?: string } | { ok: false; errores: ErroresProducto } {
  const errores: ErroresProducto = {}
  if (!e.codigo?.trim()) errores.codigo = 'Escribe el código del producto.'
  if (!e.descripcion?.trim()) errores.descripcion = 'Escribe el nombre del producto.'
  let rsVence: string | undefined
  if (e.rsVence?.trim()) {
    const f = parsearVencimiento(e.rsVence)
    if (!f) errores.rsVence = 'No entiendo esa fecha. Usa 30/06/2030, 2030-06-30 o 06/2030.'
    else rsVence = f.fecha
  }
  if (e.registroSanitario?.trim() && !e.rsVence?.trim()) errores.rsVence = 'Falta el vencimiento del registro sanitario.'
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true, rsVence }
}

export function autorizarAltaProducto(roles: readonly Rol[]): string | null {
  return puedeCrearProducto(roles) ? null : 'Solo Dirección Técnica y su asistente dan de alta productos.'
}

export function autorizarValidacion(roles: readonly Rol[]): string | null {
  return puedeValidarProducto(roles) ? null : 'Solo Dirección Técnica valida productos.'
}
