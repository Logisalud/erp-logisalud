import type { Rol } from '@/domain/tipos'
import { ETIQUETA_ROL } from '@/domain/permisos'

/** Cookie de la "sesión" de demostración: solo guarda qué persona de prueba se está probando. */
export const COOKIE_ROL_DEMO = 'wms_demo_rol'

/**
 * Una persona de prueba: un usuario puede tener varios roles y su CARGO se muestra aparte de sus permisos (D-81).
 * La clave de las personas que ya existían es el nombre de su rol (así siguen sus ids `demo:<clave>`).
 */
export interface PersonaDemo {
  clave: string
  nombre: string
  cargo: string
  roles: Rol[]
  descripcion: string
}

export const PERSONAS_DEMO: PersonaDemo[] = [
  { clave: 'direccion_tecnica', nombre: 'Dirección Técnica (demo)', cargo: 'Dirección Técnica', roles: ['direccion_tecnica'], descripcion: 'Valida productos y decide los estados sanitarios.' },
  { clave: 'asistente_dt', nombre: 'Asistente de Dirección Técnica (demo)', cargo: 'Asistente de Dirección Técnica', roles: ['asistente_dt'], descripcion: 'Da de alta productos y carga su registro sanitario.' },
  { clave: 'jefe_almacen', nombre: 'Jefe de Almacén (demo)', cargo: 'Jefe de Almacén', roles: ['jefe_almacen', 'jefe_transporte'], descripcion: 'Como Charlie: ve el almacén, mueve, verifica y también planifica las salidas (roles Jefe de Almacén y Jefe de Transporte).' },
  { clave: 'jefe_transporte', nombre: 'Jefe de Transporte (demo)', cargo: 'Jefe de Transporte', roles: ['jefe_transporte', 'jefe_almacen'], descripcion: 'Como Roberto: planifica las salidas y la bandeja de pedidos, y también opera el almacén (roles Jefe de Transporte y Jefe de Almacén).' },
  { clave: 'reemplazante_jefe', nombre: 'Reemplazante del Jefe (demo)', cargo: 'Reemplazante del Jefe de Almacén', roles: ['jefe_almacen'], descripcion: 'Como Jasury: rol Jefe de Almacén con todos sus permisos. Sirve para probar que nadie verifica lo que hizo otra persona con el mismo rol.' },
  { clave: 'auxiliar', nombre: 'Auxiliar de almacén (demo)', cargo: 'Auxiliar de almacén', roles: ['auxiliar'], descripcion: 'Prepara, mueve y cuenta; consulta ubicaciones y stock desde el celular.' },
  { clave: 'admin_wms', nombre: 'Administración del WMS (demo)', cargo: 'Administración del WMS', roles: ['admin_wms'], descripcion: 'Revisa propietarios, asignaciones y topología.' },
  { clave: 'auditoria_lectura', nombre: 'Auditoría (demo)', cargo: 'Auditoría', roles: ['auditoria_lectura'], descripcion: 'Lee la auditoría: quién, qué, cuándo y por qué.' },
]

export function personaDemoDesdeCookie(valor: string | undefined): PersonaDemo | null {
  return PERSONAS_DEMO.find((p) => p.clave === valor) ?? null
}

/** Nombre de una persona de demostración a partir de su id (`demo:<clave>`); cualquier otro id se devuelve tal cual. */
export function nombrePersonaDemo(id: string): string {
  if (!id.startsWith('demo:')) return id
  const clave = id.slice(5)
  return PERSONAS_DEMO.find((p) => p.clave === clave)?.nombre ?? `${ETIQUETA_ROL[clave as Rol] ?? clave} (demo)`
}
