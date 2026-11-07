import type { Rol } from './tipos'
import { puedeCrearProducto, puedeEditarRegulatorio } from './permisos'
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
  concentracion?: string
  condicionAlmacenamiento?: string
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
  return puedeCrearProducto(roles) ? null : 'Solo Dirección Técnica, su asistente y el Administrador dan de alta productos.'
}

/** «Sin material de envase» lo marca solo Dirección Técnica (F3). Devuelve el mensaje de error o null. */
export function autorizarMarcaSinMaterialEnvase(roles: readonly Rol[]): string | null {
  return roles.includes('direccion_tecnica') ? null : 'Solo Dirección Técnica marca un producto como «sin material de envase».'
}

export const esSi = (v: string | undefined) => ['si', 'sí', 'true', '1'].includes((v ?? '').trim().toLowerCase())

export function autorizarEdicionRegulatoria(roles: readonly Rol[]): string | null {
  return puedeEditarRegulatorio(roles) ? null : 'Solo Dirección Técnica (Katia o Sandra) y el Administrador editan los datos regulatorios.'
}

/** Todo cambio regulatorio lleva su motivo. Devuelve el mensaje de error o null. */
export function validarMotivoRegulatorio(motivo: string | undefined): string | null {
  return motivo?.trim() ? null : 'Cuéntanos por qué cambia: el motivo es obligatorio.'
}

/** Los datos regulatorios que se envían a editar (texto tal como lo escribe la persona; vacío = quitar el dato). */
export type DatosRegulatorios = Partial<Record<'registroSanitario' | 'rsVence' | 'formaPresentacion' | 'concentracion' | 'fabricante' | 'condicionAlmacenamiento' | 'presentacion' | 'principioActivo' | 'sinMaterialEnvase', string>>

/** Valida y normaliza una edición: la fecha se convierte a ISO y no se deja un registro sin su vencimiento. */
export function validarEdicionRegulatoria(
  datos: DatosRegulatorios, actual: { registroSanitario?: string; rsVence?: string } | undefined,
): { ok: true; datos: DatosRegulatorios } | { ok: false; errores: Partial<Record<keyof DatosRegulatorios, string>> } {
  const errores: Partial<Record<keyof DatosRegulatorios, string>> = {}
  const out: DatosRegulatorios = { ...datos }
  if (datos.rsVence !== undefined && datos.rsVence.trim()) {
    const f = parsearVencimiento(datos.rsVence)
    if (!f) errores.rsVence = 'No entiendo esa fecha. Usa 30/06/2030, 2030-06-30 o 06/2030.'
    else out.rsVence = f.fecha
  }
  const registro = datos.registroSanitario !== undefined ? datos.registroSanitario.trim() : actual?.registroSanitario
  const vence = datos.rsVence !== undefined ? datos.rsVence.trim() : actual?.rsVence
  if (registro && !vence) errores.rsVence = 'Falta el vencimiento del registro sanitario.'
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true, datos: out }
}

/** PIL-8: en el piloto los productos se crean en Compras; el WMS no escribe en el catálogo (ni crea productos ni edita presentación o principio activo). */
export const MENSAJE_CATALOGO_EN_COMPRAS = 'En el piloto los productos se crean y se corrigen en Compras: el WMS no escribe en el catálogo. Aquí solo completas sus datos regulatorios.'
export function autorizarEscrituraCatalogo(modoPiloto: boolean): string | null {
  return modoPiloto ? MENSAJE_CATALOGO_EN_COMPRAS : null
}
