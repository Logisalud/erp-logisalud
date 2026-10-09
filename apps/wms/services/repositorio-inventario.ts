import type {
  AjusteVista, CargaInicialVista, ConteoVista, ErrorFilaCarga, FilaCargaInicial, FilaHistoriaLote, FilaKardex, FiltroKardex,
  LineaConteoVista, LineaPreparar, OrdenMovimiento, RevisionLinea,
} from '@/domain/inventario'
import type { Actor, ResultadoAccion } from './repositorio'

/** Batch 3: Kardex, movimientos internos (INV-02), conteos y ajustes (INV-05) y carga inicial. */
export interface RepositorioInventario {
  kardex(filtro: FiltroKardex): Promise<FilaKardex[]>
  historiaLote(loteId: string): Promise<FilaHistoriaLote[]>
  /** Parámetros que el reporte y el PDF necesitan: tramos de vencimiento (D-30) y código provisional del formato (D-29). */
  parametrosInventario(): Promise<{ tramosVencimiento: number[]; kardexCodigoFormato: string }>

  // ── Movimientos internos ────────────────────────────────────────────────
  listarMovimientos(): Promise<OrdenMovimiento[]>
  obtenerMovimiento(id: string): Promise<OrdenMovimiento | null>
  prepararMovimiento(lineas: LineaPreparar[], motivo: string, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>
  autorizarMovimiento(id: string, actor: Actor): Promise<ResultadoAccion>
  ejecutarMovimiento(id: string, actor: Actor): Promise<ResultadoAccion>
  /** «Todo coincide»: equivale a revisar todas las líneas por verificar como conformes. */
  confirmarMovimiento(id: string, actor: Actor): Promise<ResultadoAccion>
  /** Revisión línea por línea: las que coinciden se confirman juntas; cada diferencia deja abierta solo su línea. */
  revisarMovimiento(id: string, revision: RevisionLinea[], actor: Actor): Promise<ResultadoAccion<{ confirmadas: number; conDiferencia: number }>>
  /** El Jefe resuelve UNA línea con diferencia: volver a moverla o anularla. */
  resolverMovimiento(lineaId: string, accion: 'REINTENTAR' | 'ANULAR', nota: string, actor: Actor): Promise<ResultadoAccion>
  /** Ubicaciones que hoy no se pueden usar: en conteo o con un movimiento abierto (posición → motivo). */
  posicionesBloqueadas(): Promise<Record<string, string>>
  anularMovimiento(id: string, motivo: string, actor: Actor): Promise<ResultadoAccion>

  // ── Conteos cíclicos y ajustes ──────────────────────────────────────────
  listarConteos(): Promise<ConteoVista[]>
  /** Las líneas vienen según quién mira: el contador nunca ve el saldo del sistema. */
  obtenerConteo(id: string, actor: Actor): Promise<{ conteo: ConteoVista; lineas: LineaConteoVista[]; ajustes: AjusteVista[] } | null>
  programarConteo(posicionIds: string[], nota: string | undefined, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>
  registrarConteo(lineaId: string, cantidad: number, actor: Actor): Promise<ResultadoAccion<{ resultado: string }>>
  registrarCausaConteo(lineaId: string, causa: string, actor: Actor): Promise<ResultadoAccion>
  proponerAjuste(lineaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  decidirAjuste(ajusteId: string, decision: 'AUTORIZAR' | 'RECHAZAR', nota: string | undefined, actor: Actor): Promise<ResultadoAccion>
  escalarLineaConteo(lineaId: string, nota: string, actor: Actor): Promise<ResultadoAccion>
  cerrarConteo(id: string, causa: string | undefined, accion: string | undefined, actor: Actor): Promise<ResultadoAccion>
  listarAjustes(): Promise<AjusteVista[]>

  // ── Carga inicial ───────────────────────────────────────────────────────
  /** D-09: el estado del stock inicial que decidió Dirección Técnica ('' = todavía no). */
  estadoCargaInicial(): Promise<string>
  validarCargaInicial(filas: FilaCargaInicial[], actor: Actor): Promise<ErrorFilaCarga[]>
  crearCargaInicial(filas: FilaCargaInicial[], nota: string | undefined, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>
  decidirEstadoCargaInicial(estado: 'APROBADO' | 'CUARENTENA', actor: Actor): Promise<ResultadoAccion>
  confirmarCargaInicial(id: string, actor: Actor): Promise<ResultadoAccion>
  listarCargasIniciales(): Promise<CargaInicialVista[]>
}
