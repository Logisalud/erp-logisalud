import type { CambioRegulatorio, EventoAuditoria, Rol } from '@/domain/tipos'
import type { Panorama } from '@/domain/panorama'
import type { DatosRegulatorios, EntradaProducto } from '@/domain/productos'
import type { CambioEntrada, Decision, EntradaSolicitud, TipoIngreso } from '@/domain/entradas'
import type {
  AlertaVista, ColaDT, DatosEdicionRecepcion, DatosOrganolepticaGuardar, DatosVerificacion, ExpedienteVista, FirmaEntrada,
  OcPendiente, OrganolepticaVista, PosicionDestino, ResumenExpediente, SolicitudDetalle, SolicitudResumen,
} from '@/domain/entradas-vistas'
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
  /** D-37: Katia o Sandra editan los datos regulatorios; rige de inmediato y cada cambio queda con su motivo. Devuelve cuántos campos cambiaron. */
  editarRegulatorio(id: string, datos: DatosRegulatorios, motivo: string, actor: Actor): Promise<ResultadoAccion<{ cambios: number }>>
  /** Historial de cambios regulatorios de un producto, del más reciente al más antiguo. */
  historialRegulatorio(id: string): Promise<CambioRegulatorio[]>

  // ── Entradas: la solicitud es la entidad primaria (su id es el de /entradas/[id]) ───────────────
  /** Órdenes de compra de Compras (solo lectura) con saldo por recibir, para preparar una solicitud. */
  ocsPendientes(): Promise<OcPendiente[]>
  /** Dónde se puede dejar lo que llega: Cuarentena (compras y clientes) o Devoluciones (devoluciones). */
  posicionesDestino(tipo: TipoIngreso): Promise<PosicionDestino[]>
  listarSolicitudes(): Promise<SolicitudResumen[]>
  obtenerSolicitud(id: string): Promise<SolicitudDetalle | null>
  crearSolicitud(entrada: EntradaSolicitud, autorizar: boolean, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>>
  autorizarSolicitud(id: string, actor: Actor): Promise<ResultadoAccion>
  /** Corrige la solicitud en el MISMO correlativo (sin límite de vueltas); después de autorizada exige motivo. */
  ajustarSolicitud(id: string, cambios: CambioEntrada[], motivo: string | undefined, actor: Actor): Promise<ResultadoAccion<{ version: number }>>
  anularSolicitud(id: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  iniciarRecepcion(id: string, actor: Actor): Promise<ResultadoAccion>
  /** "Esto es lo que esperamos": coincide, o hay una diferencia que actualiza la solicitud con su motivo. */
  verificarLinea(solicitudId: string, lineaId: string, datos: DatosVerificacion, actor: Actor): Promise<ResultadoAccion<{ verificadas: number; total: number }>>
  editarRecepcion(solicitudId: string, datos: DatosEdicionRecepcion, actor: Actor): Promise<ResultadoAccion>
  generarActa(solicitudId: string, actor: Actor): Promise<ResultadoAccion<{ actaId: string }>>
  firmarActa(actaId: string, firma: FirmaEntrada, actor: Actor): Promise<ResultadoAccion<{ completa: boolean }>>
  anularActa(actaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  reemitirActa(actaId: string, actor: Actor): Promise<ResultadoAccion<{ actaId: string }>>
  confirmarIngreso(solicitudId: string, actor: Actor): Promise<ResultadoAccion>

  // ── Calidad ─────────────────────────────────────────────────────────────
  obtenerOrganoleptica(id: string): Promise<OrganolepticaVista | null>
  guardarOrganoleptica(id: string, datos: DatosOrganolepticaGuardar, enviar: boolean, actor: Actor): Promise<ResultadoAccion>
  decidirOrganoleptica(id: string, decision: Decision, observacion: string | undefined, actor: Actor): Promise<ResultadoAccion>
  colaDireccionTecnica(): Promise<ColaDT>

  // ── Alertas ─────────────────────────────────────────────────────────────
  /** Revisa la conciliación con Compras, los traslados vencidos y los vencimientos, y devuelve las alertas. */
  listarAlertas(): Promise<AlertaVista[]>
  /** Cuántas alertas abiertas hay por destinatario (para la insignia del menú; no ejecuta las revisiones). */
  contarAlertasAbiertas(): Promise<{ direccion_tecnica: number; jefe_almacen: number; asistente_dt: number }>
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
