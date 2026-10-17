// Guía de remisión electrónica (OS-3): lo que la guía toma del WMS, lo que completa el Jefe de Transporte, el mensaje a Nubefact y la anulación por casos.
// Espejo de la migración 0024 (la base de datos manda). Todo lo tributario que no está confirmado queda como PENDIENTE: no se inventa la regla.
import { puede } from './permisos'
import type { LineaGuia } from './documentacion'
import type { Rol } from './tipos'

export type ModoNubefact = 'SIMULADOR' | 'PRUEBA' | 'PRODUCCION'
export const ETIQUETA_MODO: Record<ModoNubefact, string> = {
  SIMULADOR: 'Simulador: la guía no existe ante SUNAT',
  PRUEBA: 'Entorno de pruebas de Nubefact',
  PRODUCCION: 'Producción: la guía es real',
}
export type EstadoSunat = 'ACEPTADA' | 'PENDIENTE'
export const ETIQUETA_ESTADO_SUNAT: Record<EstadoSunat, string> = { ACEPTADA: 'Aceptada por SUNAT', PENDIENTE: 'SUNAT todavía no responde' }

/** Peso bruto por defecto (Dirección Técnica, 2026-10); el peso por producto queda preparado en el maestro y se usará después. */
export const PESO_BRUTO_DEFECTO_KG = 12

export const puedeEmitirGuia = (roles: readonly Rol[]) => puede(roles, 'registrar_documentacion')
export const puedeAnularGuia = (roles: readonly Rol[]) => puede(roles, 'anular_guia')

export type OrigenGuia = 'MANUAL' | 'NUBEFACT' | 'CLIENTE'
export const ETIQUETA_ORIGEN: Record<OrigenGuia, string> = { NUBEFACT: 'Emitida con Nubefact', MANUAL: 'Registrada a mano', CLIENTE: 'GRE que trajo el cliente' }

/** Todo lo que la guía toma del WMS (nada se vuelve a escribir). */
export interface DatosGuia {
  salidaId: string
  salidaNumero: string
  tipo: 'DISTRIBUCION' | 'CLIENTE' | 'MUESTRA'
  conforme: boolean
  pedidoNumero?: string
  destinatario: { nombre?: string; ruc?: string; direccion?: string; ubigeo?: string; distrito?: string }
  /** Lo confirmado en la conformidad, línea por lote. */
  lineas: LineaGuia[]
  bultos: number
  ruta?: { id: string; numero: string; fecha: string; placa?: string; conductor?: string; conductorDni?: string; auxiliar?: string }
  partida: { ubigeo: string; direccion: string }
  motivoTraslado: string
  modalidad: string
  serie: string
  /** Reglas de SUNAT para la baja: PENDIENTE hasta que Contabilidad y Nubefact las validen. */
  reglasBaja: { plazoHoras: string; trasInicioTraslado: string; soportadaPorApi: string }
}

/** Lo que completa o confirma el Jefe de Transporte al emitir. */
export interface TrasladoGuia {
  fechaInicio: string
  pesoKg: number
  /** Solo hace falta para el entorno de pruebas y producción. */
  licenciaConductor?: string
}

const PENDIENTE = 'PENDIENTE'
const faltaTexto = (v: string | undefined) => !v || v.trim() === '' || v.trim().toUpperCase() === PENDIENTE

/** Por qué todavía no se puede emitir, en palabras (vacío = se puede). Primero lo del flujo; luego lo que falta en los datos. */
export function faltantesDeGuia(d: DatosGuia, t: TrasladoGuia, modo: ModoNubefact): string[] {
  const f: string[] = []
  if (d.tipo !== 'DISTRIBUCION') return ['La guía de una orden de un cliente de almacenamiento la trae el cliente: el WMS no la emite']
  if (!d.conforme) f.push('Falta la conformidad de toda la Orden de Salida')
  if (!d.ruta) f.push('Asigna el pedido a una ruta: la guía toma el vehículo, el conductor y la fecha de la ruta')
  else {
    if (!d.ruta.placa) f.push('La ruta no tiene vehículo')
    if (!d.ruta.conductor) f.push('La ruta no tiene conductor')
    else if (!d.ruta.conductorDni) f.push('Falta el DNI del conductor')
  }
  if (faltaTexto(d.destinatario.nombre)) f.push('Falta el nombre del cliente')
  if (faltaTexto(d.destinatario.ruc)) f.push('Falta el RUC del cliente')
  if (faltaTexto(d.destinatario.direccion)) f.push('Falta la dirección de entrega')
  if (faltaTexto(d.destinatario.ubigeo)) f.push('Falta el ubigeo de la dirección de entrega: lo trae el pedido')
  if (faltaTexto(d.partida.direccion)) f.push('Falta la dirección del almacén de Lurín (punto de partida): la confirma Charlie o Katia')
  if (d.lineas.length === 0) f.push('La guía no tiene productos')
  if (!d.bultos || d.bultos < 1) f.push('Falta el número de bultos')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.fechaInicio)) f.push('Indica la fecha de inicio del traslado')
  if (!(t.pesoKg > 0)) f.push('El peso bruto tiene que ser mayor que cero')
  if (modo !== 'SIMULADOR' && faltaTexto(t.licenciaConductor)) f.push('Falta la licencia de conducir del conductor')
  return f
}

const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`
const sinEspacios = (v: string | undefined) => (v ?? '').trim()

/** Mensaje al API de Nubefact (guía de remisión remitente). Los códigos son los del catálogo de SUNAT; el simulador usa este mismo contrato.
 *  Los nombres de los campos se validan contra el entorno de pruebas de Nubefact antes de producción (pendiente, ver docs/wms/nubefact.md). */
export interface PayloadNubefact {
  operacion: 'generar_guia'
  tipo_de_comprobante: 7
  serie: string
  numero: ''
  cliente_tipo_de_documento: '6'
  cliente_numero_de_documento: string
  cliente_denominacion: string
  cliente_direccion: string
  fecha_de_emision: string
  observaciones: string
  motivo_de_traslado: '01'
  peso_bruto_total: string
  numero_de_bultos: string
  tipo_de_transporte: '02'
  fecha_de_inicio_de_traslado: string
  transportista_placa_numero: string
  conductor_documento_tipo: '1'
  conductor_documento_numero: string
  conductor_nombre: string
  conductor_numero_licencia: string
  punto_de_partida_ubigeo: string
  punto_de_partida_direccion: string
  punto_de_llegada_ubigeo: string
  punto_de_llegada_direccion: string
  enviar_automaticamente_a_la_sunat: 'true'
  enviar_automaticamente_al_cliente: 'false'
  items: { unidad_de_medida: 'NIU'; codigo: string; descripcion: string; cantidad: string }[]
}

/** Observación de almacenamiento: el pedido, la Orden de Salida y los lotes con su vencimiento (línea por lote en BX). */
export function observacionDeGuia(d: DatosGuia): string {
  const lotes = d.lineas.map((l) => `${l.productoCodigo} lote ${l.lote}${l.vence ? ` vence ${ddmmaaaa(l.vence).slice(3)}` : ''}`).join('; ')
  return `Almacenamiento y distribución. ${d.pedidoNumero ? `Pedido ${d.pedidoNumero}. ` : ''}Orden de Salida ${d.salidaNumero}. ${lotes}`.slice(0, 500)
}

export function construirPayloadNubefact(d: DatosGuia, t: TrasladoGuia, hoy: string): PayloadNubefact {
  return {
    operacion: 'generar_guia', tipo_de_comprobante: 7, serie: d.serie, numero: '',
    cliente_tipo_de_documento: '6', cliente_numero_de_documento: sinEspacios(d.destinatario.ruc), cliente_denominacion: sinEspacios(d.destinatario.nombre),
    cliente_direccion: sinEspacios(d.destinatario.direccion), fecha_de_emision: ddmmaaaa(hoy), observaciones: observacionDeGuia(d),
    motivo_de_traslado: '01', peso_bruto_total: t.pesoKg.toFixed(2), numero_de_bultos: String(d.bultos), tipo_de_transporte: '02',
    fecha_de_inicio_de_traslado: ddmmaaaa(t.fechaInicio),
    transportista_placa_numero: sinEspacios(d.ruta?.placa), conductor_documento_tipo: '1', conductor_documento_numero: sinEspacios(d.ruta?.conductorDni),
    conductor_nombre: sinEspacios(d.ruta?.conductor), conductor_numero_licencia: sinEspacios(t.licenciaConductor),
    punto_de_partida_ubigeo: d.partida.ubigeo, punto_de_partida_direccion: d.partida.direccion,
    punto_de_llegada_ubigeo: sinEspacios(d.destinatario.ubigeo), punto_de_llegada_direccion: sinEspacios(d.destinatario.direccion),
    enviar_automaticamente_a_la_sunat: 'true', enviar_automaticamente_al_cliente: 'false',
    items: d.lineas.map((l) => ({ unidad_de_medida: 'NIU', codigo: l.productoCodigo, descripcion: `${l.producto} · lote ${l.lote}`, cantidad: String(l.cantidad) })),
  }
}

/** Respuesta de Nubefact ya normalizada. `ok` = la guía existe; si SUNAT la rechazó, `error` va en lenguaje humano y no se registra nada. */
export type RespuestaEmision =
  | { ok: true; numero: string; enlace: string; enlaceXml?: string; hash: string; estadoSunat: EstadoSunat; entorno: ModoNubefact; cruda: unknown }
  | { ok: false; error: string; reintentable: boolean }

/** Los errores de SUNAT/Nubefact más comunes, dichos para quien emite (el texto original se conserva en el detalle). */
export function mensajeHumanoSunat(codigo: string | number | undefined, textoOriginal: string): string {
  const c = String(codigo ?? '')
  const tabla: Record<string, string> = {
    '1033': 'SUNAT ya tiene una guía con ese número: pide a Nubefact el siguiente correlativo y vuelve a enviar',
    '2325': 'El RUC del cliente no es válido o no está activo en SUNAT: corrígelo en el pedido',
    '2329': 'La placa del vehículo no tiene el formato que pide SUNAT: corrígela en el vehículo de la ruta',
    '2338': 'Falta la licencia de conducir del conductor',
    '2643': 'El ubigeo de llegada no es válido: corrígelo en el pedido',
    '2780': 'El peso bruto no es válido: tiene que ser mayor que cero',
  }
  return tabla[c] ?? `SUNAT o Nubefact no aceptaron la guía: ${textoOriginal.trim() || 'sin detalle'}. Corrige lo indicado y vuelve a enviar`
}

// ── Anulación por casos (D-90) ────────────────────────────────────────────────────────────────────────────────────

export type CasoAnulacion = 1 | 2 | 3
export interface DescripcionCaso { caso: CasoAnulacion; titulo: string; detalle: string; sigue: string }
export const CASOS_ANULACION: readonly DescripcionCaso[] = [
  { caso: 1, titulo: 'Me equivoqué en los datos del traslado', detalle: 'Placa, conductor, fecha o peso, antes de que el vehículo salga.',
    sigue: 'La Orden de Salida no cambia. Corrige el dato y emite otra guía.' },
  { caso: 2, titulo: 'Me equivoqué en el contenido', detalle: 'Un lote o una cantidad, antes de que el vehículo salga.',
    sigue: 'La Orden vuelve a conformidad: el stock regresa de Despacho a su ubicación, otra persona confirma de nuevo y emites otra guía.' },
  { caso: 3, titulo: 'La guía ya salió', detalle: 'Después de la salida confirmada.',
    sigue: 'No se anula desde el WMS: el retorno entra como devolución y se crea una nueva Orden de Salida con su guía.' },
]
export const MENSAJE_CASO_3 = 'Después de la salida confirmada la guía no se anula desde el WMS: se corrige con el retorno como devolución y una nueva Orden de Salida con su guía'

/** Por qué no se puede anular con ese caso (null = se puede). Espejo de wms.anular_guia. */
export function motivoNoPuedeAnular(roles: readonly Rol[], caso: CasoAnulacion | null, o: { salidaAbierta: boolean; guiaVigente: boolean; motivo: string }): string | null {
  if (!puedeAnularGuia(roles)) return 'Solo el Jefe de Transporte puede anular una guía'
  if (!o.guiaVigente) return 'Esa guía ya está anulada'
  if (caso === null) return 'Elige qué se equivocó: los datos del traslado, el contenido, o la guía ya salió'
  if (caso === 3 || !o.salidaAbierta) return MENSAJE_CASO_3
  if (!o.motivo.trim()) return 'Cuenta por qué se anula la guía'
  return null
}

/** Las reglas de SUNAT para la baja siguen sin validar: mientras estén PENDIENTE el WMS anula en su sistema y deja la baja marcada para hacerla a mano. */
export const bajaSunatDefinida = (r: DatosGuia['reglasBaja']) => ![r.plazoHoras, r.trasInicioTraslado, r.soportadaPorApi].some((v) => faltaTexto(v))
export const TEXTO_BAJA_PENDIENTE = 'La baja de la guía ante SUNAT queda pendiente: las reglas (plazo y medio) se validan con Contabilidad y Nubefact. Se anotó para hacerla a mano.'

// ── Eventos hacia Pedidos ─────────────────────────────────────────────────────────────────────────────────────────

export type TipoEventoPedidos = 'GUIA_EMITIDA' | 'GUIA_ANULADA'
export interface EventoPedidos {
  id: string
  tipo: TipoEventoPedidos
  estado: 'PENDIENTE' | 'ENVIADO'
  intentos: number
  ultimoError?: string
  creadoEn: string
  salidaId: string
  guiaId: string
  /** Lo que recibe Pedidos: número de guía, líneas conformadas con lote, vencimiento y cantidad; o el caso y el motivo de la anulación. */
  payload: Record<string, unknown>
}
