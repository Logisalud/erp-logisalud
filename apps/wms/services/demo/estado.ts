import type { EventoAuditoria } from '@/domain/tipos'
import type { Panorama } from '@/domain/panorama'
import type {
  ActaRecepcionVista, AlertaVista, CambioVista, ExpedienteVista, FirmaVista, OcPendiente, OrganolepticaVista, VersionSolicitud,
} from '@/domain/entradas-vistas'
import type { EstadoLineaSolicitud, EstadoSolicitud, TipoIngreso, VerificacionLinea } from '@/domain/entradas'
import { construirPanoramaDemo, sumarDias } from './datos'
import type { Actor } from '../repositorio'

export interface LineaSolicitudDemo {
  id: string
  ocItemId?: string
  productoId: string
  lote: string
  vence: string
  venceTexto?: string
  ocPedida?: number
  ocSaldo?: number
  comprasRecibidaAntes?: number
  inicial?: number
  cantidad: number
  estadoLinea: EstadoLineaSolicitud
}

/** Una fila por línea de solicitud con cantidad > 0 (la "mercadería que llegó"): refleja la solicitud y se verifica. */
export interface LoteRecepcionDemo {
  id: string
  lineaId: string
  verificacion: VerificacionLinea
  posicionId?: string
  /** Lo que tenía la línea cuando se verificó: si cambia, vuelve a "por verificar". */
  foto: { cantidad: number; lote: string; vence: string }
}

export interface RecepcionDemo {
  id: string
  confirmado: boolean
  confirmadoEn?: string
  facturaNumero?: string
  temperaturaC?: number
  bultos?: number
  paletas?: number
  placa?: string
  marcaVehiculo?: string
  tipoConteo?: 'MUESTREO' | 'TOTAL' | 'OTROS'
  horaInicio?: string
  horaFin?: string
  verificaciones: Record<string, boolean>
  observaciones?: string
  lotes: LoteRecepcionDemo[]
}

export interface SolicitudDemo {
  id: string
  numero: string
  tipo: TipoIngreso
  estado: EstadoSolicitud
  propietarioId: string
  ocId?: string
  ocCodigo?: string
  contraparteNombre?: string
  contraparteRuc?: string
  guiaNumero?: string
  docOriginalTipo?: 'FACTURA' | 'BOLETA'
  docOriginalNumero?: string
  motivo?: string
  observaciones?: string
  fechaPrevista?: string
  origenCreacion: 'INTERNO' | 'CLIENTE'
  creadoEn: string
  creadoPor?: string
  autorizadoPor?: string
  autorizadoEn?: string
  cerradaEn?: string
  lineas: LineaSolicitudDemo[]
  versiones: VersionSolicitud[]
  cambios: CambioVista[]
  recepcion?: RecepcionDemo
  expedienteId?: string
}

export interface ActaDemo extends Omit<ActaRecepcionVista, 'faltan' | 'reemplazaANumero' | 'reemplazadaPorNumero'> {
  solicitudId: string
}

/** Una OC de Compras (solo lectura en el WMS). `recibida` = lo que Compras tiene registrado hoy; se copia a mano. */
export interface OcDemo extends Omit<OcPendiente, 'items'> {
  items: { ocItemId: string; productoId: string; pedida: number; recibida: number }[]
}

export interface EstadoDemo {
  panorama: Panorama
  auditoria: EventoAuditoria[]
  contador: number
  solicitudes: SolicitudDemo[]
  actas: ActaDemo[]
  organolepticas: OrganolepticaVista[]
  alertas: AlertaVista[]
  expedientes: (Omit<ExpedienteVista, 'ingresos'> & { clave: string })[]
  compras: OcDemo[]
  correlativos: Record<string, number>
  /** Desde cuándo está Aprobado cada entrega (para el plazo de "por trasladar"). */
  aprobadoEn: Record<string, string>
  plazoPorTrasladarHoras: number
  /** Horas desde el cierre de una solicitud para ver su cantidad física registrada en Compras. */
  plazoRegistroComprasHoras: number
  /** Días antes del vencimiento de un lote en que se alerta (D-30). */
  diasAlertaVencimiento: number
  sembrado?: boolean
}

export type { FirmaVista }

/** Estado en memoria, por instancia del servidor. En Vercel puede reiniciarse: es una DEMO. */
const g = globalThis as unknown as { __wmsDemo?: EstadoDemo }

export function estado(): EstadoDemo {
  const hoy = new Date().toISOString().slice(0, 10)
  if (!g.__wmsDemo || g.__wmsDemo.panorama.hoy !== hoy) {
    const panorama = construirPanoramaDemo(hoy)
    const ts = (dias: number, h: string) => `${sumarDias(hoy, dias)}T${h}:00Z`
    g.__wmsDemo = {
      panorama,
      contador: 6,
      solicitudes: [], actas: [], organolepticas: [], alertas: [], expedientes: [], compras: [], correlativos: {},
      aprobadoEn: {}, plazoPorTrasladarHoras: 24, plazoRegistroComprasHoras: 24, diasAlertaVencimiento: 90,
      auditoria: [
        { id: 6, ts: ts(0, '08:12'), actor: 'Dirección Técnica (demo)', evento: 'producto_validado', entidad: 'producto_regulatorio', entidadId: 'DEMO-019', detalle: 'Registro sanitario validado' },
        { id: 5, ts: ts(0, '07:40'), actor: 'Asistente DT (demo)', evento: 'producto_creado', entidad: 'productos', entidadId: 'DEMO-020', detalle: 'Alta de producto' },
        { id: 4, ts: ts(-1, '16:05'), actor: 'Administración (demo)', evento: 'update', entidad: 'asignaciones_posicion', entidadId: 'G-7.1', detalle: 'Asignación de AJR Labs registrada desde la adenda (por confirmar firma)' },
        { id: 3, ts: ts(-1, '15:50'), actor: 'Administración (demo)', evento: 'insert', entidad: 'posiciones', entidadId: 'A-27.1', detalle: 'Posición creada: el rack A llega a A-27' },
        { id: 2, ts: ts(-2, '11:20'), actor: 'Administración (demo)', evento: 'insert', entidad: 'propietarios', entidadId: 'AJR_LABS', detalle: 'Propietario creado' },
        { id: 1, ts: ts(-2, '11:00'), actor: 'Administración (demo)', evento: 'insert', entidad: 'usuario_roles', entidadId: 'direccion_tecnica', detalle: 'Rol asignado' },
      ],
    }
  }
  return g.__wmsDemo
}

export function registrar(e: EstadoDemo, actor: Actor, evento: string, entidad: string, entidadId: string, detalle: string, motivo?: string) {
  e.contador += 1
  e.auditoria.unshift({ id: e.contador, ts: new Date().toISOString(), actor: actor.nombre, evento, entidad, entidadId, detalle, motivo })
}

