import type { EventoAuditoria, Rol } from '@/domain/tipos'
import type { Panorama } from '@/domain/panorama'
import type { EntradaProducto } from '@/domain/productos'
import type { EntradaIngreso, EntradaLote } from '@/domain/entradas'
import type {
  AlertaVista, ColaDT, DatosEdicionIngreso, DatosOrganolepticaGuardar, ExpedienteVista, FirmaEntrada, IngresoDetalle,
  IngresoResumen, OrganolepticaVista, PosicionDestino, RecepcionCompra, ResumenExpediente,
} from '@/domain/entradas-vistas'
import type { Decision } from '@/domain/entradas'
import type { ResultadoBusqueda } from '@/domain/panorama'

export interface Actor {
  id: string
  nombre: string
  roles: Rol[]
}

export type ResultadoAccion<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; mensaje: string; errores?: Record<string, string> }

/**
 * Puerto de datos del WMS. Hay dos adaptadores con la MISMA interfaz:
 *  · demo     → datos de prueba en memoria (solo Preview / local con WMS_DEMO_LOCAL=1);
 *  · supabase → el schema `wms` del proyecto consolidado (RLS por persona).
 */
export interface Repositorio {
  panorama(): Promise<Panorama>
  auditoria(limite?: number): Promise<EventoAuditoria[]>
  crearProducto(entrada: EntradaProducto, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  decidirProducto(
    id: string,
    decision: 'VALIDADO' | 'OBSERVADO',
    observacion: string | undefined,
    actor: Actor,
  ): Promise<ResultadoAccion>

  // ── Entradas ────────────────────────────────────────────────────────────
  /** Recepciones de Compras que aún no tienen su ingreso en el WMS (y las que ya lo tienen, marcadas). */
  recepcionesDeCompra(): Promise<RecepcionCompra[]>
  posicionesDeCuarentena(): Promise<PosicionDestino[]>
  listarIngresos(): Promise<IngresoResumen[]>
  obtenerIngreso(id: string): Promise<IngresoDetalle | null>
  crearIngreso(entrada: EntradaIngreso, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  editarIngreso(id: string, datos: DatosEdicionIngreso, actor: Actor): Promise<ResultadoAccion>
  guardarLotes(id: string, lineaId: string, lotes: EntradaLote[], actor: Actor): Promise<ResultadoAccion>
  editarSolicitud(id: string, datos: Record<string, unknown>, motivo: string | undefined, actor: Actor): Promise<ResultadoAccion<{ version: number }>>
  generarActa(id: string, actor: Actor): Promise<ResultadoAccion<{ actaId: string }>>
  firmarActa(actaId: string, firma: FirmaEntrada, actor: Actor): Promise<ResultadoAccion<{ completa: boolean }>>
  anularActa(actaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  reemitirActa(actaId: string, actor: Actor): Promise<ResultadoAccion<{ actaId: string }>>
  confirmarIngreso(id: string, actor: Actor): Promise<ResultadoAccion>

  // ── Calidad ─────────────────────────────────────────────────────────────
  obtenerOrganoleptica(id: string): Promise<OrganolepticaVista | null>
  guardarOrganoleptica(id: string, datos: DatosOrganolepticaGuardar, enviar: boolean, actor: Actor): Promise<ResultadoAccion>
  decidirOrganoleptica(id: string, decision: Decision, observacion: string | undefined, actor: Actor): Promise<ResultadoAccion>
  colaDireccionTecnica(): Promise<ColaDT>

  // ── Alertas ─────────────────────────────────────────────────────────────
  /** Revisa divergencias con Compras y traslados vencidos, y devuelve las alertas. */
  listarAlertas(): Promise<AlertaVista[]>
  /** Cuántas alertas abiertas hay por destinatario (para la insignia del menú; no ejecuta las revisiones). */
  contarAlertasAbiertas(): Promise<{ direccion_tecnica: number; jefe_almacen: number }>
  atenderAlerta(id: string, nota: string | undefined, actor: Actor): Promise<ResultadoAccion>

  // ── Expediente ──────────────────────────────────────────────────────────
  listarExpedientes(): Promise<ResumenExpediente[]>
  obtenerExpediente(id: string): Promise<ExpedienteVista | null>
  agregarDocumento(expedienteId: string, tipo: string, descripcion: string, actor: Actor): Promise<ResultadoAccion>
  agregarFaltante(expedienteId: string, documento: string, responsable: string, actor: Actor): Promise<ResultadoAccion>
  resolverFaltante(faltanteId: string, nota: string | undefined, actor: Actor): Promise<ResultadoAccion>
  cerrarExpediente(expedienteId: string, actor: Actor): Promise<ResultadoAccion>

  /** OC y actas para la búsqueda universal. */
  buscarEntradas(consulta: string): Promise<ResultadoBusqueda[]>
}
