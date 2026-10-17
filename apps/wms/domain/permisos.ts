import type { Accion, Rol } from './tipos'

export const ETIQUETA_ROL: Record<Rol, string> = {
  direccion_tecnica: 'Dirección Técnica',
  asistente_dt: 'Asistente de Dirección Técnica',
  jefe_almacen: 'Jefe de Almacén',
  auxiliar: 'Auxiliar de almacén',
  auditoria_lectura: 'Auditoría (solo lectura)',
  admin_wms: 'Administración del WMS',
  jefe_transporte: 'Jefe de Transporte',
  conductor: 'Conductor',
  auxiliar_transporte: 'Auxiliar de transporte',
  conformidad_despacho: 'Conformidad de despacho',
  autoriza_salidas_sin_venta: 'Autoriza salidas sin venta',
  usuario_cliente: 'Usuario de cliente',
}

/** Espejo de wms.permisos_rol (la base de datos es la que manda; esto solo oculta botones). */
const PERMISOS_AUXILIAR: readonly Accion[] = ['ver', 'ejecutar', 'verificar', 'cambiar_lote_asignado', 'embalar', 'cargar_ruta']
/** Los jefes tienen TODO lo del auxiliar (DT, 2026-10-17) además de lo suyo. */
const conAuxiliar = (...propias: Accion[]): readonly Accion[] => [...new Set<Accion>([...PERMISOS_AUXILIAR, ...propias])]

const PERMISOS: Record<Rol, readonly Accion[]> = {
  direccion_tecnica: ['ver', 'aprobar', 'ajustar', 'verificar', 'exportar', 'auditar', 'gestionar_documentos_regulatorios', 'imprimir_paquete_documental', 'registrar_documentacion', 'reservar_lote'],
  asistente_dt: ['ver', 'ejecutar', 'exportar', 'registrar_documentacion'],
  jefe_almacen: conAuxiliar('exportar', 'preparar_salidas'),
  auxiliar: PERMISOS_AUXILIAR,
  auditoria_lectura: ['ver', 'exportar', 'auditar'],
  admin_wms: ['ver', 'configurar', 'exportar', 'auditar'],
  jefe_transporte: conAuxiliar('imprimir_paquete_documental', 'preparar_salidas', 'confirmar_salida', 'registrar_documentacion', 'liberar_unidad', 'reservar_lote', 'anular_guia'),
  conductor: [], // sus permisos llegan con «Mis rutas» (S9)
  auxiliar_transporte: [],
  conformidad_despacho: ['ver', 'dar_conformidad'],
  autoriza_salidas_sin_venta: ['ver', 'autorizar_salida_sin_venta'],
  usuario_cliente: [], // lo suyo (crear órdenes de salida) llega en B2, con validación de propietario en la base
}

/**
 * Roles que cuentan como personal (espejo de wms.es_usuario(): lista cerrada). El usuario de cliente y los roles de campo
 * (conductor, auxiliar de transporte) NO leen el inventario; sus pantallas y políticas llegan en B3 y S9.
 */
export const ROLES_DE_PERSONAL: readonly Rol[] = [
  'direccion_tecnica', 'asistente_dt', 'jefe_almacen', 'auxiliar', 'auditoria_lectura', 'admin_wms',
  'jefe_transporte', 'conformidad_despacho', 'autoriza_salidas_sin_venta',
]
export const esPersonal = (roles: readonly Rol[]) => roles.some((r) => ROLES_DE_PERSONAL.includes(r))

export function puede(roles: readonly Rol[], accion: Accion): boolean {
  return roles.some((r) => PERMISOS[r]?.includes(accion))
}

/** Quién da de alta un producto y quién lo valida (Sandra crea, Katia valida). */
export const puedeCrearProducto = (roles: readonly Rol[]) =>
  roles.includes('asistente_dt') || roles.includes('direccion_tecnica')
/** D-37: Katia (direccion_tecnica) y Sandra (asistente_dt) tienen la misma autoridad sobre los datos regulatorios. */
export const puedeEditarRegulatorio = (roles: readonly Rol[]) => roles.includes('direccion_tecnica') || roles.includes('asistente_dt')

export function rolesDesdeTexto(valor: string | undefined | null): Rol[] {
  if (!valor) return []
  return valor
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is Rol => s in ETIQUETA_ROL)
}
