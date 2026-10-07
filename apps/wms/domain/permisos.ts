import type { Accion, Rol } from './tipos'

export const ETIQUETA_ROL: Record<Rol, string> = {
  direccion_tecnica: 'Dirección Técnica',
  asistente_dt: 'Asistente de Dirección Técnica',
  jefe_almacen: 'Jefe de Almacén',
  reemplazo_jefe: 'Reemplazo del Jefe de Almacén',
  auxiliar: 'Auxiliar de almacén',
  auditoria_lectura: 'Auditoría (solo lectura)',
  admin_wms: 'Administración del WMS',
}

/** Espejo de wms.permisos_rol (la base de datos es la que manda; esto solo oculta botones). */
const PERMISOS: Record<Rol, readonly Accion[]> = {
  direccion_tecnica: ['ver', 'aprobar', 'ajustar', 'verificar', 'exportar', 'auditar'],
  asistente_dt: ['ver', 'ejecutar', 'exportar'],
  jefe_almacen: ['ver', 'ejecutar', 'verificar', 'exportar'],
  reemplazo_jefe: ['ver', 'ejecutar', 'verificar'],
  auxiliar: ['ver', 'ejecutar', 'verificar'],
  auditoria_lectura: ['ver', 'exportar', 'auditar'],
  admin_wms: ['ver', 'configurar', 'exportar', 'auditar'],
}

export function puede(roles: readonly Rol[], accion: Accion): boolean {
  return roles.some((r) => PERMISOS[r]?.includes(accion))
}

/** Quién da de alta un producto y quién lo valida (Sandra crea, Katia valida). */
export const puedeCrearProducto = (roles: readonly Rol[]) =>
  roles.includes('asistente_dt') || roles.includes('direccion_tecnica')
export const puedeValidarProducto = (roles: readonly Rol[]) => roles.includes('direccion_tecnica')

export function rolesDesdeTexto(valor: string | undefined | null): Rol[] {
  if (!valor) return []
  return valor
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is Rol => s in ETIQUETA_ROL)
}
