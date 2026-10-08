// Formas de datos que las pantallas de Entradas y Calidad leen. Las producen los dos
// adaptadores (demo y Supabase); no tienen lógica.

import type {
  Checklist, DatosOrganoleptica, Decision, EstadoActa, PasoIngreso, RolFirma, TipoAlerta, TipoDocumentoExpediente, TipoIngreso,
} from './entradas'
import type { Estado } from './tipos'

export interface RecepcionCompra {
  recepcionId: string
  ocCodigo: string
  proveedorNombre: string
  proveedorRuc: string
  fecha: string
  guias?: string
  lineas: { productoId: string; codigo: string; descripcion: string; cantidad: number }[]
  /** Si ya tiene su ingreso en el WMS. */
  ingresoId?: string
}

export interface LoteVista {
  id: string
  codigo: string
  vence: string
  venceTexto?: string
  cantidad: number
  posicionId: string
  posicionCodigo: string
}

export interface LineaVista {
  id: string
  productoId: string
  codigo: string
  descripcion: string
  registroSanitario?: string
  rsVence?: string
  cantidadReferencia: number
  lotes: LoteVista[]
}

export interface FirmaVista {
  rol: RolFirma
  nombre: string
  dni?: string
  placa?: string
  /** PNG en data URL (solo el transportista). */
  imagen?: string
  firmadoEn: string
  hash: string
}

export interface ContenidoActaRecepcion {
  numero: string
  ingreso: {
    tipo: TipoIngreso
    propietario: string
    contraparteNombre?: string
    contraparteRuc?: string
    ocCodigo?: string
    guiaNumero?: string
    facturaNumero?: string
    docOriginalTipo?: string
    docOriginalNumero?: string
    motivo?: string
    temperaturaC?: number
    bultos?: number
    paletas?: number
    placa?: string
    marcaVehiculo?: string
    tipoConteo?: string
    horaInicio?: string
    horaFin?: string
    observaciones?: string
    verificaciones: Record<string, boolean>
  }
  lineas: {
    codigo: string
    descripcion: string
    registroSanitario?: string
    cantidadEstablecida: number
    cantidadRecibida: number
    lotes: { lote: string; vence: string; venceTexto?: string; cantidad: number; posicion: string }[]
  }[]
}

export interface ActaRecepcionVista {
  id: string
  numero: string
  estado: EstadoActa
  hash: string
  generadaEn: string
  firmadaEn?: string
  reemplazaA?: string
  reemplazaANumero?: string
  reemplazadaPorNumero?: string
  anuladaEn?: string
  motivoAnulacion?: string
  contenido: ContenidoActaRecepcion
  firmas: FirmaVista[]
  faltan: RolFirma[]
}

export interface VersionSolicitud {
  version: number
  motivo?: string
  editadoPor: string
  editadoEn: string
  datos: Record<string, unknown>
}

export interface AlertaVista {
  id: string
  tipo: TipoAlerta
  destinatario: 'direccion_tecnica' | 'jefe_almacen'
  mensaje: string
  estado: 'ABIERTA' | 'ATENDIDA'
  creadaEn: string
  atendidaPor?: string
  atendidaEn?: string
  nota?: string
  ingresoId?: string
  productoId?: string
  /** Para llevar al mapa (búsqueda por lote). */
  loteCodigo?: string
}

export interface OrganolepticaVista {
  id: string
  numero: string
  estado: 'BORRADOR' | 'PENDIENTE_DT' | 'FIRMADA'
  ingresoId: string
  ingresoTipo: TipoIngreso
  ingresoLoteId: string
  productoId: string
  productoCodigo: string
  producto: string
  principioActivo?: string
  registroSanitario?: string
  rsVence?: string
  fabricante?: string
  formaPresentacion?: string
  lote: string
  vence: string
  propietario: string
  cantidadLote: number
  cantidadMuestra: number
  referencia?: string
  datos: DatosOrganoleptica
  decision?: Decision
  decididoPor?: string
  decididoEn?: string
  observacionDt?: string
  hash?: string
  actaRecepcion?: string
  creadaEn: string
}

export interface DocumentoExpediente {
  id: string
  tipo: TipoDocumentoExpediente | string
  descripcion: string
  agregadoEn: string
  referenciaTipo?: string
  referenciaId?: string
}

export interface FaltanteExpediente {
  id: string
  tipo: string
  documento: string
  responsable: string
  estado: 'ABIERTO' | 'RESUELTO'
  resueltoEn?: string
  nota?: string
}

export interface ExpedienteVista {
  id: string
  clave: string
  tipo: 'OC' | 'ACTA'
  estado: 'ABIERTO' | 'CERRADO'
  cerradoEn?: string
  documentos: DocumentoExpediente[]
  faltantes: FaltanteExpediente[]
  ingresos: { id: string; tipo: TipoIngreso; actaNumero?: string; unidades: number; confirmadoEn?: string }[]
}

export interface ResumenExpediente {
  id: string
  clave: string
  tipo: 'OC' | 'ACTA'
  estado: 'ABIERTO' | 'CERRADO'
  faltantesAbiertos: number
  documentos: number
  ingresos: number
}

export interface IngresoResumen {
  id: string
  tipo: TipoIngreso
  propietario: string
  contraparte?: string
  referencia?: string
  paso: PasoIngreso
  actaNumero?: string
  unidades: number
  productos: number
  creadoEn: string
  alertasAbiertas: number
  confirmado: boolean
}

export interface IngresoDetalle {
  id: string
  tipo: TipoIngreso
  propietarioId: string
  propietario: string
  confirmado: boolean
  confirmadoEn?: string
  ocCodigo?: string
  contraparteNombre?: string
  contraparteRuc?: string
  guiaNumero?: string
  facturaNumero?: string
  docOriginalTipo?: 'FACTURA' | 'BOLETA'
  docOriginalNumero?: string
  motivo?: string
  temperaturaC?: number
  alertaTemperatura: boolean
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
  paso: PasoIngreso
  lineas: LineaVista[]
  cuadra: boolean
  solicitudVersion: number
  versiones: VersionSolicitud[]
  actas: ActaRecepcionVista[]
  organolepticas: OrganolepticaVista[]
  alertas: AlertaVista[]
  expedienteId?: string
  /** Hay firmas en el acta vigente: los datos y lotes ya no se editan. */
  bloqueadoPorFirmas: boolean
}

export interface PosicionDestino {
  id: string
  codigo: string
  area: string
  ocupadas: number
}

export interface ColaDT {
  /** Llenas y enviadas: esperan la decisión de Dirección Técnica. */
  organolepticas: OrganolepticaVista[]
  /** Todavía sin llenar (las llena Sandra). */
  borradores: OrganolepticaVista[]
  /** Ya decididas (las más recientes). */
  decididas: OrganolepticaVista[]
  productosPorValidar: { id: string; codigo: string; descripcion: string; estado: string }[]
  alertas: AlertaVista[]
}

export interface DatosEdicionIngreso {
  temperaturaC?: number | null
  bultos?: number | null
  paletas?: number | null
  placa?: string
  marcaVehiculo?: string
  tipoConteo?: 'MUESTREO' | 'TOTAL' | 'OTROS' | ''
  horaInicio?: string
  horaFin?: string
  verificaciones?: Record<string, boolean>
  observaciones?: string
  guiaNumero?: string
  facturaNumero?: string
  contraparteNombre?: string
  contraparteRuc?: string
  motivo?: string
}

export interface DatosOrganolepticaGuardar {
  certAnalisis?: boolean | null
  checklist?: Checklist
  observacion?: string
  destinoSugerido?: 'APROBADO' | 'DEVOLUCION' | 'BAJA' | null
  conclusion?: 'CONFORME' | 'NO_CONFORME' | null
}

export interface FirmaEntrada {
  rol: RolFirma
  /** Transportista. */
  nombre?: string
  dni?: string
  placa?: string
  imagen?: string
}

export const ESTADO_UNIDADES: Estado[] = ['CUARENTENA', 'APROBADO', 'BAJAS_RECHAZADOS']
