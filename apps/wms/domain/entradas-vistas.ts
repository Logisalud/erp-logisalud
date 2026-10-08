// Formas de datos que las pantallas de Entradas y Calidad leen. Las producen los dos
// adaptadores (demo y Supabase); no tienen lógica.

import type {
  CambioEntrada, Checklist, DatosOrganoleptica, DestinatarioAlerta, Decision, EstadoActa, EstadoLineaSolicitud, EstadoRegistroCompras,
  EstadoSolicitud, PasoSolicitud, RolFirma, TipoAlerta, TipoDocumentoExpediente, TipoIngreso, VerificacionLinea,
} from './entradas'
import type { Estado } from './tipos'

/** Una orden de compra de Compras (solo lectura) con sus líneas, desde la que se prepara una solicitud. */
export interface OcPendiente {
  ocId: string
  codigo: string
  proveedorNombre: string
  proveedorRuc: string
  estado?: string
  items: { ocItemId: string; productoId: string; codigo: string; descripcion: string; pedida: number; recibida: number; saldo: number; facturada: number }[]
}

export interface LineaSolicitudVista {
  id: string
  ocItemId?: string
  productoId: string
  codigo: string
  descripcion: string
  registroSanitario?: string
  rsVence?: string
  lote: string
  vence: string
  venceTexto?: string
  /** Lo que pedía la OC y su saldo cuando se preparó la solicitud. */
  ocPedida?: number
  ocSaldo?: number
  /** Lo que Compras tiene facturado hoy de esta línea de OC (solo lectura). */
  ocFacturada?: number
  /** Lo que Compras ya tenía recibido cuando se preparó la solicitud (base para la conciliación). */
  comprasRecibidaAntes?: number
  /** Lo anunciado al autorizar (inmutable). */
  inicial?: number
  /** Solicitud final (la vigente). 0 = ya no llega. */
  cantidad: number
  estadoLinea: EstadoLineaSolicitud
  /** null mientras no hay recepción física. */
  verificacion: VerificacionLinea | null
  posicionId?: string
  posicionCodigo?: string
  /** Lo físico confirmado (solo con el ingreso confirmado). */
  fisica?: number
}

export interface CambioVista {
  id: string
  lineaId?: string
  version: number
  campo: string
  antes?: string
  despues?: string
  motivo?: string
  usuario: string
  ts: string
  /** "Dapagliflozina 10 mg · lote L24071" para los cambios de línea. */
  etiqueta?: string
}

/** "Cantidad física confirmada": lo que Contabilidad/Compras debe copiar a mano a la recepción de la OC. */
export interface BloqueFisico {
  ocItemId: string
  productoId: string
  descripcion: string
  ocCodigo: string
  fisica: number
  /** Cuánto mostraba Compras antes y cuánto debería mostrar ahora. */
  base: number
  esperado: number
  registrado?: number
  estado: EstadoRegistroCompras
}

export interface RecepcionVista {
  id: string
  confirmado: boolean
  confirmadoEn?: string
  facturaNumero?: string
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
  solicitud?: { numero: string; version: number }
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
    lotes: { lote: string; vence: string; venceTexto?: string; cantidad: number; cantidadInicial?: number; posicion: string }[]
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
  destinatario: DestinatarioAlerta
  mensaje: string
  estado: 'ABIERTA' | 'ATENDIDA'
  creadaEn: string
  atendidaPor?: string
  atendidaEn?: string
  nota?: string
  /** La solicitud a la que se refiere (la pantalla /entradas/[id]). */
  solicitudId?: string
  productoId?: string
  /** Para llevar al mapa (búsqueda por lote). */
  loteCodigo?: string
}

export interface OrganolepticaVista {
  id: string
  numero: string
  estado: 'BORRADOR' | 'PENDIENTE_DT' | 'FIRMADA'
  solicitudId: string
  solicitudNumero: string
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
  ingresos: { id: string; numero: string; tipo: TipoIngreso; actaNumero?: string; unidades: number; confirmadoEn?: string }[]
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

export interface SolicitudResumen {
  id: string
  numero: string
  tipo: TipoIngreso
  estado: EstadoSolicitud
  paso: PasoSolicitud
  propietario: string
  contraparte?: string
  referencia?: string
  actaNumero?: string
  unidades: number
  productos: number
  fechaPrevista?: string
  creadoEn: string
  alertasAbiertas: number
  /** La solicitud final difiere de la inicial. */
  conDiferencias: boolean
  /** Solo compras cerradas: peor estado del registro en Compras entre sus líneas. */
  registroCompras?: EstadoRegistroCompras
}

export interface SolicitudDetalle {
  id: string
  numero: string
  tipo: TipoIngreso
  estado: EstadoSolicitud
  paso: PasoSolicitud
  version: number
  propietarioId: string
  propietario: string
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
  lineas: LineaSolicitudVista[]
  /** Datos propios de la recepción física (existe desde que empieza la recepción). */
  recepcion?: RecepcionVista
  /** Historial campo a campo, de lo más reciente a lo más antiguo. */
  cambios: CambioVista[]
  versiones: VersionSolicitud[]
  actas: ActaRecepcionVista[]
  organolepticas: OrganolepticaVista[]
  alertas: AlertaVista[]
  expedienteId?: string
  /** Hay firmas en el acta vigente: los datos y las cantidades ya no se editan. */
  bloqueadoPorFirmas: boolean
  conDiferencias: boolean
  /** Bloque "Cantidad física confirmada" (solo compras con ingreso confirmado). */
  cantidadFisica: BloqueFisico[]
  /** Estado de inventario con el que nacen las unidades de esta solicitud. */
  estadoInicial: Estado
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
  alertas: AlertaVista[]
}

/** Solo lo propio de la recepción física. La guía, el proveedor o el cliente y lo demás de la solicitud se cambian con un ajuste. */
export interface DatosEdicionRecepcion {
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
  facturaNumero?: string
}

/** Qué encontró quien verifica una línea. */
export interface DatosVerificacion {
  coincide: boolean
  /** Solo cuando hay una diferencia. */
  cantidad?: number
  lote?: string
  vence?: string
  venceTexto?: string
  motivo?: string
  posicionId?: string
}

export type { CambioEntrada }

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

export const ESTADO_UNIDADES: Estado[] = ['CUARENTENA', 'DEVOLUCIONES', 'APROBADO', 'BAJAS_RECHAZADOS']
