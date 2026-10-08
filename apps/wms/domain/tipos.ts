// Tipos del dominio del WMS. Sin dependencias de Next ni de Supabase.

export type Estado = 'CUARENTENA' | 'DEVOLUCIONES' | 'APROBADO' | 'BAJAS_RECHAZADOS'
export const ESTADOS: readonly Estado[] = ['CUARENTENA', 'DEVOLUCIONES', 'APROBADO', 'BAJAS_RECHAZADOS']

export type TipoArea =
  | 'RECEPCION'
  | 'CUARENTENA'
  | 'DEVOLUCIONES'
  | 'APROBADOS'
  | 'BAJAS_RECHAZADOS'
  | 'CONTRAMUESTRA'
  | 'EMBALAJE'
  | 'DESPACHO'

export type Origen =
  | 'COMPRA_LOCAL'
  | 'DEVOLUCION'
  | 'INGRESO_CLIENTE'
  | 'CARGA_INICIAL'
  | 'AJUSTE'

export type FormaPosicion = 'RACK' | 'PISO' | 'MESA' | 'SUBRACK'

export type Rol =
  | 'direccion_tecnica'
  | 'asistente_dt'
  | 'jefe_almacen'
  | 'reemplazo_jefe'
  | 'auxiliar'
  | 'auditoria_lectura'
  | 'admin_wms'

export type Accion =
  | 'ver'
  | 'ejecutar'
  | 'verificar'
  | 'aprobar'
  | 'ajustar'
  | 'configurar'
  | 'exportar'
  | 'auditar'

export interface Propietario {
  id: string
  codigo: string
  razonSocial: string
  ruc?: string
  esDuenoAlmacen: boolean
}

export interface DocumentoSustento {
  id: string
  codigo: string
  tipo: 'CONTRATO' | 'ADENDA' | 'PLANO' | 'OTRO'
  titulo: string
  vigenteDesde?: string
  archivoRef?: string
  estadoConfirmacion: 'CONFIRMADO' | 'POR_CONFIRMAR'
  nota?: string
}

export interface Posicion {
  id: string
  codigo: string
  rack: string
  posicion: number | null
  nivel: number | null
  subnivel: number | null
  forma: FormaPosicion
  tipoArea: TipoArea
  activa: boolean
  porVerificar: boolean
  notaVerificacion?: string
}

export interface Asignacion {
  id: string
  posicionId: string
  propietarioId: string
  desde: string // YYYY-MM-DD
  hasta?: string // exclusivo
  documentoId?: string
}

export interface Producto {
  id: string
  codigo: string
  descripcion: string
  presentacion?: string
  marca?: string
  principioActivo?: string
  unidadMedida: string
  estado: 'activo' | 'inactivo'
}

export type EstadoValidacion = 'PENDIENTE' | 'VALIDADO' | 'OBSERVADO'

export interface Regulatorio {
  productoId: string
  registroSanitario?: string
  rsVence?: string
  fabricante?: string
  formaPresentacion?: string
  estadoValidacion: EstadoValidacion
  observacion?: string
  creadoPor?: string
  validadoPor?: string
  validadoEn?: string
}

export interface Lote {
  id: string
  productoId: string
  codigo: string
  vence?: string
  propietarioId: string
}

/** Celda de stock: unidades de un lote, en una posición, con un estado y una procedencia. */
export interface Saldo {
  posicionId: string
  productoId: string
  loteId: string
  propietarioId: string
  estado: Estado
  procedenciaId: string
  cantidad: number
}

export interface EventoAuditoria {
  id: number
  ts: string
  actor: string
  evento: string
  entidad: string
  entidadId?: string
  motivo?: string
  detalle?: string
}
