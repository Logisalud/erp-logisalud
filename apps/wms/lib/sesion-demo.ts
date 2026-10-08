import type { Rol } from '@/domain/tipos'
import { ETIQUETA_ROL } from '@/domain/permisos'

/** Cookie de la "sesión" de demostración: solo guarda qué rol se está probando. */
export const COOKIE_ROL_DEMO = 'wms_demo_rol'

export const ROLES_DEMO: { rol: Rol; descripcion: string }[] = [
  { rol: 'direccion_tecnica', descripcion: 'Valida productos y decide los estados sanitarios.' },
  { rol: 'asistente_dt', descripcion: 'Da de alta productos y carga su registro sanitario.' },
  { rol: 'jefe_almacen', descripcion: 'Ve el almacén, busca y organiza ubicaciones.' },
  { rol: 'reemplazo_jefe', descripcion: 'Reemplaza al Jefe de Almacén: autoriza, mueve y verifica.' },
  { rol: 'auxiliar', descripcion: 'Prepara, mueve y cuenta; consulta ubicaciones y stock desde el celular.' },
  { rol: 'admin_wms', descripcion: 'Revisa propietarios, asignaciones y topología.' },
  { rol: 'auditoria_lectura', descripcion: 'Lee la auditoría: quién, qué, cuándo y por qué.' },
]

export function rolDemoDesdeCookie(valor: string | undefined): Rol | null {
  return ROLES_DEMO.find((r) => r.rol === valor)?.rol ?? null
}

export const nombreDemo = (rol: Rol) => `${ETIQUETA_ROL[rol]} (demo)`
