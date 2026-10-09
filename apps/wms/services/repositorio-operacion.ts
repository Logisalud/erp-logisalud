import type {
  Cobertura, EntradaPendiente, FilaExactitud, FocoRevision, PendienteVista, PersonaEquipo, ProgramacionVista, ResultadoFoco, RevisionDiaria,
} from '@/domain/operacion'
import type { Saldo } from '@/domain/tipos'
import type { Actor, ResultadoAccion } from './repositorio'

/** Batch 3b: revisión diaria del almacén (INV-04), programación de los inventarios cíclicos (INV-05) y exactitud del inventario. */
export interface RepositorioOperacion {
  // ── Revisión diaria ─────────────────────────────────────────────────────
  /** La revisión de hoy (hora de Lima), si ya se empezó. */
  revisionDeHoy(): Promise<RevisionDiaria | null>
  /** Las últimas revisiones, de la más reciente a la más antigua. */
  listarRevisiones(limite?: number): Promise<RevisionDiaria[]>
  /** Los pendientes de TODAS las revisiones que siguen vivos (abiertos o resueltos sin verificar). */
  pendientesVivos(): Promise<PendienteVista[]>
  personasDelEquipo(): Promise<PersonaEquipo[]>
  iniciarRevision(actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  marcarFoco(revisionId: string, foco: FocoRevision, resultado: ResultadoFoco, actor: Actor): Promise<ResultadoAccion>
  registrarPendiente(revisionId: string, datos: EntradaPendiente, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  resolverPendiente(id: string, nota: string | undefined, actor: Actor): Promise<ResultadoAccion>
  verificarPendiente(id: string, conforme: boolean, nota: string | undefined, actor: Actor): Promise<ResultadoAccion>
  cerrarRevision(id: string, nota: string | undefined, actor: Actor): Promise<ResultadoAccion>

  // ── Programación de los inventarios cíclicos ────────────────────────────
  /** Programaciones de la semana (lunes AAAA-MM-DD), incluidos los conteos extra. */
  programacionDeSemana(lunes: string): Promise<ProgramacionVista[]>
  ultimaCobertura(): Promise<Cobertura[]>
  programarConteoSemanal(lunes: string, orden: number, posicionIds: string[], nota: string | undefined, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  programarConteoExtra(posicionIds: string[], incidencia: string, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  cancelarProgramacion(id: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  generarConteoProgramado(id: string, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>

  // ── Reportes e indicadores ──────────────────────────────────────────────
  /** Cómo era el stock al final de un día (AAAA-MM-DD, hora de Lima), sumando el libro mayor. Solo quien gestiona el inventario. */
  saldosAl(fecha: string, actor: Actor): Promise<Saldo[]>
  exactitudConteos(desde: string | undefined, hasta: string | undefined, actor: Actor): Promise<FilaExactitud[]>
}
