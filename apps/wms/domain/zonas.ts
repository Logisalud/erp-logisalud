import type { Asignacion, Estado, Origen, Posicion, TipoArea } from './tipos'
import { ETIQUETA_ESTADO } from './estados'

export const ETIQUETA_AREA: Record<TipoArea, string> = {
  RECEPCION: 'Recepción',
  CUARENTENA: 'Cuarentena',
  DEVOLUCIONES: 'Devoluciones',
  APROBADOS: 'Aprobados',
  BAJAS_RECHAZADOS: 'Bajas/Rechazados',
  CONTRAMUESTRA: 'Contramuestra',
  DESPACHO: 'Despacho',
}

/** Áreas donde varios propietarios pueden tener stock a la vez. */
export const AREAS_COMPARTIDAS: ReadonlySet<TipoArea> = new Set<TipoArea>(['RECEPCION', 'CUARENTENA', 'DESPACHO'])

/**
 * Áreas retiradas (DT, 2026-10-17): «Pendiente de conformidad», «Observado», «Retorno reservado» y «Embalaje» ya no existen como zonas; la mesa K-M2 es parte
 * de Despacho. Quedan en la base, fuera de alcance. El conjunto de áreas habilitadas es el tipo `TipoArea`.
 */
export const AREAS_RETIRADAS: readonly string[] = ['EMBALAJE', 'PENDIENTE_CONFORMIDAD', 'OBSERVADO', 'RETORNO_RESERVADO']

/** Sin áreas apagadas pendientes de definir: todas las áreas habilitadas funcionan (se conserva el nombre por compatibilidad con la matriz). */
export const AREAS_FUERA_DE_ALCANCE: ReadonlySet<TipoArea> = new Set<TipoArea>([])

/**
 * Zonas que solo alimenta el flujo de salidas (conformidad, carga). Un movimiento interno manual (Mover) no las elige como destino,
 * aunque la base de datos admita Aprobado en ellas. El stock que pasa la conformidad queda en Despacho y la salida sale de ahí.
 */
export const AREAS_DE_SALIDA: ReadonlySet<TipoArea> = new Set<TipoArea>(['DESPACHO'])

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
  DESPACHO: [{ estado: 'APROBADO' }],
}

export function areaAdmite(area: TipoArea, estado: Estado, origen: Origen): boolean {
  const reglas = MATRIZ[area]
  if (!reglas) return false
  return reglas.some((r) => r.estado === estado && (!r.origenRequerido || r.origenRequerido === origen))
}

export function mensajeZonaNoAdmite(area: TipoArea, estado: Estado): string {
  const a = ETIQUETA_AREA[area]
  if (AREAS_DE_SALIDA.has(area) && estado === 'APROBADO') return `${a} se usa solo en las salidas.`
  if (area === 'RECEPCION' || area === 'CONTRAMUESTRA') {
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
