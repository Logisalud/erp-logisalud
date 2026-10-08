import type { EventoAuditoria } from '@/domain/tipos'
import type { Panorama } from '@/domain/panorama'
import type { ActaRecepcionVista, AlertaVista, ExpedienteVista, FirmaVista, OrganolepticaVista, RecepcionCompra, VersionSolicitud } from '@/domain/entradas-vistas'
import type { TipoIngreso } from '@/domain/entradas'
import { construirPanoramaDemo, sumarDias } from './datos'
import type { Actor } from '../repositorio'

export interface IngresoDemo {
  id: string
  tipo: TipoIngreso
  propietarioId: string
  confirmado: boolean
  confirmadoEn?: string
  compraRecepcionId?: string
  ocCodigo?: string
  contraparteNombre?: string
  contraparteRuc?: string
  guiaNumero?: string
  facturaNumero?: string
  docOriginalTipo?: 'FACTURA' | 'BOLETA'
  docOriginalNumero?: string
  motivo?: string
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
  creadoEn: string
  creadoPor?: string
  lineas: { id: string; productoId: string; cantidadReferencia: number }[]
  lotes: { id: string; lineaId: string; loteId: string; codigo: string; vence: string; venceTexto?: string; cantidad: number; posicionId: string }[]
  versiones: VersionSolicitud[]
  expedienteId?: string
  /** Copia de lo que Compras dijo al crear el ingreso (producto → cantidad). */
  copiaCompras?: Record<string, number>
}

export interface ActaDemo extends Omit<ActaRecepcionVista, 'faltan' | 'reemplazaANumero' | 'reemplazadaPorNumero'> {
  ingresoId: string
}

export interface EstadoDemo {
  panorama: Panorama
  auditoria: EventoAuditoria[]
  contador: number
  ingresos: IngresoDemo[]
  actas: ActaDemo[]
  organolepticas: OrganolepticaVista[]
  alertas: AlertaVista[]
  expedientes: (Omit<ExpedienteVista, 'ingresos'> & { clave: string })[]
  compras: (RecepcionCompra & { cantidadActual?: Record<string, number> })[]
  correlativos: Record<string, number>
  /** Desde cuándo está Aprobado cada entrega (para el plazo de "por trasladar"). */
  aprobadoEn: Record<string, string>
  plazoPorTrasladarHoras: number
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
      ingresos: [], actas: [], organolepticas: [], alertas: [], expedientes: [], compras: [], correlativos: {},
      aprobadoEn: {}, plazoPorTrasladarHoras: 24, diasAlertaVencimiento: 90,
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

