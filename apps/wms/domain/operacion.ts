// Operación diaria del almacén (Batch 3b): revisión diaria (INV-04) y programación de los inventarios cíclicos (INV-05).
// Reglas puras, sin dependencias de Next ni de Supabase; la base de datos (migración 0009) vuelve a comprobarlas.
import type { Rol } from './tipos'

// ── Revisión diaria (INV-04) ─────────────────────────────────────────────────

export type FocoRevision = 'ORDEN' | 'LIMPIEZA' | 'UBICACIONES' | 'ANORMAL'
export const FOCOS: { foco: FocoRevision; titulo: string; guia: string }[] = [
  { foco: 'ORDEN', titulo: 'Orden y circulación', guia: 'Pasillos libres, nada fuera de su lugar, cajas bien apiladas, rutas de paso despejadas.' },
  { foco: 'LIMPIEZA', titulo: 'Limpieza', guia: 'Pisos, racks y áreas de trabajo limpios; sin polvo ni residuos; sin derrames.' },
  { foco: 'UBICACIONES', titulo: 'Ubicaciones', guia: 'Cada producto en su ubicación, con etiquetas legibles y sin mezclas de lotes o propietarios.' },
  { foco: 'ANORMAL', titulo: 'Situaciones anormales', guia: 'Cajas dañadas, goteras, plagas, olores, temperatura fuera de rango o cualquier cosa fuera de lo normal.' },
]
export const ETIQUETA_FOCO: Record<FocoRevision, string> = Object.fromEntries(FOCOS.map((f) => [f.foco, f.titulo])) as Record<FocoRevision, string>

export type ResultadoFoco = 'SIN_PROBLEMAS' | 'CON_PENDIENTES'
export type EstadoPendiente = 'ABIERTO' | 'RESUELTO' | 'VERIFICADO'
export const ETIQUETA_ESTADO_PENDIENTE: Record<EstadoPendiente, string> = { ABIERTO: 'Abierto', RESUELTO: 'Resuelto, por verificar', VERIFICADO: 'Verificado' }

export interface PendienteVista {
  id: string
  revisionId: string
  /** RD-AAAAMMDD de la revisión en que nació. */
  revision: string
  fecha: string
  foco: FocoRevision
  descripcion: string
  responsableId: string
  responsable: string
  critico: boolean
  afectaProducto: boolean
  ubicacion?: string
  estado: EstadoPendiente
  creadoPor: string
  notaResolucion?: string
  resueltoPor?: string
  verificadoPor?: string
}

export interface RevisionDiaria {
  id: string
  numero: string
  fecha: string
  responsableId: string
  responsable: string
  estado: 'ABIERTA' | 'CERRADA'
  focos: { foco: FocoRevision; resultado: ResultadoFoco; revisadoPor: string }[]
  /** Los pendientes que nacieron en esta revisión. */
  pendientes: PendienteVista[]
  notaCierre?: string
}

export interface PersonaEquipo { id: string; nombre: string; rol: Rol }

export interface EntradaPendiente { foco: FocoRevision; descripcion: string; responsableId: string; critico: boolean; afectaProducto: boolean; ubicacion?: string }

/** Los focos que todavía no se marcaron (la revisión no se cierra hasta que no falte ninguno). */
export function focosFaltantes(r: Pick<RevisionDiaria, 'focos'>): FocoRevision[] {
  const hechos = new Set(r.focos.map((f) => f.foco))
  return FOCOS.map((f) => f.foco).filter((f) => !hechos.has(f))
}

export function puedeCerrarRevision(r: Pick<RevisionDiaria, 'focos' | 'estado'>): { puede: boolean; motivo?: string } {
  if (r.estado === 'CERRADA') return { puede: false, motivo: 'La revisión de hoy ya está cerrada.' }
  const f = focosFaltantes(r)
  if (f.length > 0) return { puede: false, motivo: `Falta revisar: ${f.map((x) => ETIQUETA_FOCO[x].toLowerCase()).join(', ')}.` }
  return { puede: true }
}

/** Un foco no puede quedar «sin problemas» si ya tiene pendientes abiertos en esta revisión. */
export function validarMarcaFoco(pendientes: Pick<PendienteVista, 'foco' | 'estado'>[], foco: FocoRevision, resultado: ResultadoFoco): string | null {
  if (resultado === 'SIN_PROBLEMAS' && pendientes.some((p) => p.foco === foco && p.estado === 'ABIERTO')) return 'Ese foco tiene pendientes abiertos: no puede quedar «sin problemas».'
  return null
}

export function validarPendiente(e: Partial<EntradaPendiente>, equipo: PersonaEquipo[]): Record<string, string> | null {
  const errores: Record<string, string> = {}
  if (!e.descripcion?.trim()) errores.descripcion = 'Cuenta qué pasó.'
  if (!e.responsableId) errores.responsableId = 'Todo pendiente necesita un responsable.'
  else if (!equipo.some((p) => p.id === e.responsableId)) errores.responsableId = 'El responsable debe ser una persona del equipo del WMS.'
  return Object.keys(errores).length ? errores : null
}

/** Pendientes que siguen vivos (abiertos o resueltos sin verificar), los críticos y los más antiguos primero. */
export function pendientesVivos(todos: PendienteVista[]): PendienteVista[] {
  return todos.filter((p) => p.estado !== 'VERIFICADO').sort((a, b) => Number(b.critico) - Number(a.critico) || a.fecha.localeCompare(b.fecha) || a.descripcion.localeCompare(b.descripcion, 'es'))
}

export const puedeHacerRevision = (roles: readonly Rol[]) => roles.some((r) => r === 'jefe_almacen' || r === 'reemplazo_jefe')
export const puedeResolverPendiente = (roles: readonly Rol[], actorId: string, p: Pick<PendienteVista, 'responsableId'>) => puedeHacerRevision(roles) || p.responsableId === actorId

// ── Programación de los inventarios cíclicos (INV-05) ────────────────────────

export const CONTEOS_POR_SEMANA_DEFECTO = 3
export const UBICACIONES_POR_CONTEO_DEFECTO = 8

export type EstadoProgramacion = 'PROGRAMADO' | 'GENERADO' | 'CANCELADO'
export interface ProgramacionVista {
  id: string
  /** Lunes de la semana (AAAA-MM-DD). */
  semana: string
  tipo: 'ROTATIVO' | 'EXTRA'
  orden?: number
  posiciones: { id: string; codigo: string }[]
  nota?: string
  estado: EstadoProgramacion
  conteoId?: string
  conteoNumero?: string
  motivoCancelacion?: string
}

export interface Cobertura { posicionId: string; ultima?: string }

/** Lunes de la semana de una fecha AAAA-MM-DD (semana ISO). */
export function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  const dia = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dia)
  return d.toISOString().slice(0, 10)
}
export function sumarDiasISO(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Rotación: las ubicaciones con stock que hace más tiempo no se cuentan (o nunca) van primero, para que en pocas semanas se cubra todo el almacén.
 * Se salta lo que ya está programado esa semana y lo que está en conteo.
 */
export function sugerirRotacion(posiciones: { id: string; codigo: string }[], cobertura: Cobertura[], n: number, excluidas: ReadonlySet<string> = new Set()): { id: string; codigo: string; ultima?: string }[] {
  const ultima = new Map(cobertura.map((c) => [c.posicionId, c.ultima]))
  return posiciones
    .filter((p) => !excluidas.has(p.id))
    .map((p) => ({ ...p, ultima: ultima.get(p.id) }))
    .sort((a, b) => (a.ultima ?? '0000').localeCompare(b.ultima ?? '0000') || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
    .slice(0, Math.max(n, 0))
}

/** Qué conteos de la semana faltan por programar (1 a 3). */
export function conteosPorProgramar(programaciones: Pick<ProgramacionVista, 'tipo' | 'orden' | 'estado'>[], porSemana = CONTEOS_POR_SEMANA_DEFECTO): number[] {
  const hechos = new Set(programaciones.filter((p) => p.tipo === 'ROTATIVO' && p.estado !== 'CANCELADO').map((p) => p.orden))
  return Array.from({ length: porSemana }, (_, i) => i + 1).filter((o) => !hechos.has(o))
}

export function validarProgramacion(d: { orden: number; posiciones: string[]; yaEnSemana: ReadonlySet<string>; porSemana?: number; ocupados?: number[] }): string | null {
  const max = d.porSemana ?? CONTEOS_POR_SEMANA_DEFECTO
  if (!Number.isInteger(d.orden) || d.orden < 1 || d.orden > max) return `Son ${max === 3 ? 'tres' : max} conteos por semana: elige uno de ellos.`
  if (d.posiciones.length === 0) return 'Elige al menos una ubicación para contar.'
  if (d.ocupados?.includes(d.orden)) return `El conteo ${d.orden} de esa semana ya está programado.`
  if (d.posiciones.some((p) => d.yaEnSemana.has(p))) return 'Una de las ubicaciones ya está en otro conteo de esa semana.'
  return null
}

// ── Exactitud del inventario (reporte): solo conteos CERRADOS ────────────────

export interface FilaExactitud {
  conteo: string
  cerradoEn: string
  posicion: string
  producto: string
  lote: string
  propietario: string
  estado: string
  cantidadSistema: number
  cantidadContada: number
  /** Lo que se contó la primera vez (antes de cualquier reconteo). */
  primerConteo: number
  diferencia: number
  resultado: string
  causa?: string
}

/** Exactitud = líneas cuyo PRIMER conteo coincidió con el sistema ÷ líneas contadas (en conteos cerrados). */
export function exactitudDeFilas(filas: Pick<FilaExactitud, 'primerConteo' | 'cantidadSistema'>[]): { lineas: number; exactas: number; porcentaje: number | null } {
  const exactas = filas.filter((f) => f.primerConteo === f.cantidadSistema).length
  return { lineas: filas.length, exactas, porcentaje: filas.length ? Math.round((exactas / filas.length) * 1000) / 10 : null }
}
