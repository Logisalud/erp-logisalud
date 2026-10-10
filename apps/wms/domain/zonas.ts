import type { Asignacion, Estado, Origen, Posicion, TipoArea } from './tipos'
import { ETIQUETA_ESTADO } from './estados'

export const ETIQUETA_AREA: Record<TipoArea, string> = {
  RECEPCION: 'Recepción',
  CUARENTENA: 'Cuarentena',
  DEVOLUCIONES: 'Devoluciones',
  APROBADOS: 'Aprobados',
  BAJAS_RECHAZADOS: 'Bajas/Rechazados',
  CONTRAMUESTRA: 'Contramuestra',
  EMBALAJE: 'Embalaje',
  DESPACHO: 'Despacho',
}

/** Áreas donde varios propietarios pueden tener stock a la vez. */
export const AREAS_COMPARTIDAS: ReadonlySet<TipoArea> = new Set<TipoArea>([
  'RECEPCION', 'CUARENTENA', 'EMBALAJE', 'DESPACHO',
])

/** Áreas fuera del alcance actual (se crean, pero no operan). */
export const AREAS_FUERA_DE_ALCANCE: ReadonlySet<TipoArea> = new Set<TipoArea>(['EMBALAJE', 'DESPACHO'])

interface ReglaArea {
  estado: Estado
  origenRequerido?: Origen
}

/** Matriz "Zonas BPA y compatibilidad" (reglas-negocio.md). */
const MATRIZ: Partial<Record<TipoArea, ReglaArea[]>> = {
  CUARENTENA: [{ estado: 'CUARENTENA' }],
  DEVOLUCIONES: [{ estado: 'DEVOLUCIONES', origenRequerido: 'DEVOLUCION' }],
  APROBADOS: [{ estado: 'APROBADO' }],
  BAJAS_RECHAZADOS: [{ estado: 'BAJAS_RECHAZADOS' }],
}

export function areaAdmite(area: TipoArea, estado: Estado, origen: Origen): boolean {
  const reglas = MATRIZ[area]
  if (!reglas) return false
  return reglas.some((r) => r.estado === estado && (!r.origenRequerido || r.origenRequerido === origen))
}

export function mensajeZonaNoAdmite(area: TipoArea, estado: Estado): string {
  const a = ETIQUETA_AREA[area]
  if (area === 'RECEPCION' || area === 'CONTRAMUESTRA' || area === 'EMBALAJE' || area === 'DESPACHO') {
    return `${a} no recibe stock en este momento.`
  }
  // Mensajes humanos para los casos de todos los días.
  if (area === 'CUARENTENA' && estado === 'APROBADO') return 'Ya está aprobado: no vuelve a Cuarentena.'
  if (area === 'BAJAS_RECHAZADOS' && estado !== 'BAJAS_RECHAZADOS') return 'Solo para lotes dados de baja.'
  if (estado === 'CUARENTENA') return 'Sigue en Cuarentena: no puede ir a un rack.'
  return `${a} no admite unidades en ${ETIQUETA_ESTADO[estado]}.`
}

/** ¿La asignación está vigente en esa fecha? `hasta` es exclusivo. */
export function asignacionVigente(a: Pick<Asignacion, 'desde' | 'hasta'>, fecha: string): boolean {
  return a.desde <= fecha && (!a.hasta || fecha < a.hasta)
}

/**
 * ¿Acepta la posición stock de este propietario en esa fecha?
 *  · área compartida → cualquier propietario;
 *  · área exclusiva  → solo con una asignación vigente a su nombre.
 * Una asignación vencida NO mueve stock: solo deja de aceptar nuevo.
 */
export function posicionAcepta(
  posicion: Pick<Posicion, 'id' | 'tipoArea' | 'activa'>,
  propietarioId: string,
  asignaciones: Asignacion[],
  fecha: string,
): boolean {
  if (!posicion.activa) return false
  if (AREAS_COMPARTIDAS.has(posicion.tipoArea)) return true
  return asignaciones.some(
    (a) => a.posicionId === posicion.id && a.propietarioId === propietarioId && asignacionVigente(a, fecha),
  )
}

/** Propietario vigente de una posición exclusiva (o undefined si está libre). */
export function propietarioVigente(posicionId: string, asignaciones: Asignacion[], fecha: string): string | undefined {
  return asignaciones.find((a) => a.posicionId === posicionId && asignacionVigente(a, fecha))?.propietarioId
}

/** Dos asignaciones de la misma posición exclusiva no pueden solaparse. */
export function asignacionesSolapan(
  a: Pick<Asignacion, 'desde' | 'hasta'>,
  b: Pick<Asignacion, 'desde' | 'hasta'>,
): boolean {
  const finA = a.hasta ?? '9999-12-31'
  const finB = b.hasta ?? '9999-12-31'
  return a.desde < finB && b.desde < finA
}
