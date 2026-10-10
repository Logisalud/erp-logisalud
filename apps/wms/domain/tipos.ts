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

/** Datos regulatorios (D-37): los edita Dirección Técnica (Katia o Sandra) sin segunda validación; cada cambio queda en el historial. */
export interface Regulatorio {
  productoId: string
  registroSanitario?: string
  rsVence?: string
  formaPresentacion?: string
  concentracion?: string
  fabricante?: string
  condicionAlmacenamiento?: string
  creadoPor?: string
}

/** Un cambio de un dato regulatorio: campo, valor anterior y nuevo, quién, cuándo y por qué. */
export interface CambioRegulatorio {
  id: string
  productoId: string
  campo: CampoRegulatorio
  antes?: string
  despues?: string
  usuario: string
  ts: string
  motivo: string
}

export type CampoRegulatorio = 'registro_sanitario' | 'rs_vence' | 'forma_presentacion' | 'concentracion' | 'fabricante' | 'condicion_almacenamiento' | CampoCatalogo

/** D-38: presentación y principio activo viven solo en catalogo.productos; Compras los llena al crear y después solo Dirección Técnica los edita. */
export type CampoCatalogo = 'presentacion' | 'principio_activo'
export const CAMPOS_CATALOGO: readonly { campo: CampoCatalogo; clave: 'presentacion' | 'principioActivo'; etiqueta: string }[] = [
  { campo: 'presentacion', clave: 'presentacion', etiqueta: 'Presentación' },
  { campo: 'principio_activo', clave: 'principioActivo', etiqueta: 'Principio activo' },
]

/** Etiqueta de cualquier campo editable del historial (regulatorio o del catálogo). */
export const etiquetaCampo = (campo: string): string =>
  CAMPOS_REGULATORIOS.find((x) => x.campo === campo)?.etiqueta ?? CAMPOS_CATALOGO.find((x) => x.campo === campo)?.etiqueta ?? campo

export const CAMPOS_REGULATORIOS: readonly { campo: CampoRegulatorio; clave: keyof Omit<Regulatorio, 'productoId' | 'creadoPor'>; etiqueta: string }[] = [
  { campo: 'registro_sanitario', clave: 'registroSanitario', etiqueta: 'Registro sanitario' },
  { campo: 'rs_vence', clave: 'rsVence', etiqueta: 'Vencimiento del registro' },
  { campo: 'forma_presentacion', clave: 'formaPresentacion', etiqueta: 'Forma farmacéutica' },
  { campo: 'concentracion', clave: 'concentracion', etiqueta: 'Concentración' },
  { campo: 'fabricante', clave: 'fabricante', etiqueta: 'Fabricante' },
  { campo: 'condicion_almacenamiento', clave: 'condicionAlmacenamiento', etiqueta: 'Condición de almacenamiento' },
]

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
