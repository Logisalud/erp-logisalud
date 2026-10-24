// Guía de remisión electrónica (OS-3): lo que la guía toma del WMS, lo que completa el Jefe de Transporte, el mensaje a Nubefact y la anulación por casos.
// Espejo de la migración 0024 (la base de datos manda). Todo lo tributario que no está confirmado queda como PENDIENTE: no se inventa la regla.
import { puede } from './permisos'
import type { LineaGuia } from './documentacion'
import type { TipoSalida } from './salidas'
import type { DocumentoTipo } from './rutas'
import type { Rol } from './tipos'
import { MENSAJE_SIN_CORRELATIVO, type CausaNubefact } from './numeracion-guias'

export type ModoNubefact = 'SIMULADOR' | 'PRUEBA' | 'PRODUCCION'
export const ETIQUETA_MODO: Record<ModoNubefact, string> = {
  SIMULADOR: 'Simulador: la guía no existe ante SUNAT',
  PRUEBA: 'Entorno de pruebas de Nubefact: la guía no llega a SUNAT',
  PRODUCCION: 'Producción: la guía es real',
}
export type EstadoSunat = 'ACEPTADA' | 'PENDIENTE' | 'RECHAZADA'
export const ETIQUETA_ESTADO_SUNAT: Record<EstadoSunat, string> = { ACEPTADA: 'Aceptada por SUNAT', PENDIENTE: 'SUNAT todavía no responde', RECHAZADA: 'Rechazada por SUNAT' }

/** Peso bruto por defecto (Dirección Técnica, 2026-10); el peso por producto queda preparado en el maestro y se usará después. */
export const PESO_BRUTO_DEFECTO_KG = 12

export const puedeEmitirGuia = (roles: readonly Rol[]) => puede(roles, 'registrar_documentacion')
export const puedeAnularGuia = (roles: readonly Rol[]) => puede(roles, 'anular_guia')

export type OrigenGuia = 'MANUAL' | 'NUBEFACT' | 'CLIENTE'
export const ETIQUETA_ORIGEN: Record<OrigenGuia, string> = { NUBEFACT: 'Emitida con Nubefact', MANUAL: 'Registrada a mano', CLIENTE: 'GRE que trajo el cliente' }

/**
 * El motivo de traslado de la guía según el tipo de salida (Catálogo 20 de SUNAT). Una venta lleva 01; la devolución al proveedor, 06; la muestra sin venta, 13 (otros, anotando
 * «muestra sin valor comercial»). Confirmado por Sebas (D-121, D-165): estos son los valores POR DEFECTO; el código vigente se lee de los parámetros
 * `guia_motivo_codigo_venta`, `guia_motivo_codigo_devolucion` y `guia_motivo_codigo_muestra` (`DatosGuia.motivoCodigo`), así que se cambia sin tocar el código.
 * Una orden por cuenta de un cliente no lleva guía del WMS: usa la GRE del cliente.
 */
export const MOTIVO_TRASLADO_POR_TIPO: Record<TipoSalida, { codigo: '01' | '06' | '13'; texto: string }> = {
  DISTRIBUCION: { codigo: '01', texto: 'VENTA' },
  PROVEEDOR: { codigo: '06', texto: 'DEVOLUCION' },
  MUESTRA: { codigo: '13', texto: 'OTROS (MUESTRA SIN VALOR COMERCIAL)' },
  CLIENTE: { codigo: '01', texto: 'VENTA (la guía la trae el cliente)' },
}
export const motivoDeTraslado = (tipo: TipoSalida) => MOTIVO_TRASLADO_POR_TIPO[tipo]

/** El código del Catálogo 20 de SUNAT: dos dígitos. Un parámetro mal escrito no llega a Nubefact: se usa el de la tabla. */
export const codigoMotivoValido = (c: string | undefined | null) => /^\d{2}$/.test((c ?? '').trim())
/** D-165: con el motivo 13 (OTROS) Nubefact pide `motivo_de_traslado_otros_descripcion`, máximo 70 caracteres. Confirmado por Sebas: devolución al proveedor = 06 DEVOLUCION; muestra sin venta y retorno de rechazo = 13 OTROS. */
export const MAXIMO_DESCRIPCION_OTROS = 70
/** D-190: espejo del trigger `validar_parametro` (0034). null = válido. */
export function errorDescripcionOtros(texto: string | undefined | null): string | null {
  const n = (texto ?? '').trim().length
  return n >= 1 && n <= MAXIMO_DESCRIPCION_OTROS ? null : `La descripción del motivo «otros» lleva entre 1 y ${MAXIMO_DESCRIPCION_OTROS} caracteres (Nubefact no acepta más)`
}
/** D-190: el código del motivo son 2 números (Catálogo 20 de SUNAT): 01 venta, 06 devolución, 13 otros. null = válido. */
export const errorCodigoMotivo = (c: string | undefined | null): string | null => (codigoMotivoValido(c) ? null : 'El código del motivo de traslado son 2 números (Catálogo 20 de SUNAT), por ejemplo 01, 06 o 13')
/** D-192: plazo informativo para anular una factura directo en Nubefact; pasado el plazo corresponde una nota de crédito. Lo decide Pedidos. */
export const FACTURA_ANULACION_DIRECTA_DIAS = 7
export const DESCRIPCION_OTROS_POR_DEFECTO = { MUESTRA: 'MUESTRA SIN VALOR COMERCIAL', RETORNO: 'RETORNO DE RECHAZO' } as const
export const parametroDescripcionOtros = (tipo: TipoSalida): string => (tipo === 'MUESTRA' ? 'guia_motivo_otros_descripcion_muestra' : 'guia_motivo_otros_descripcion_retorno')
/** La descripción de «otros» (solo cuando el código es 13): el parámetro si trae texto; si no, la de la tabla. Máximo 70 caracteres. */
export function descripcionOtrosDeGuia(d: Pick<DatosGuia, 'tipo' | 'motivoCodigo' | 'motivoOtrosDescripcion'>): string | undefined {
  if (codigoMotivoDeGuia(d) !== '13') return undefined
  const t = (d.motivoOtrosDescripcion ?? '').trim() || (d.tipo === 'MUESTRA' ? DESCRIPCION_OTROS_POR_DEFECTO.MUESTRA : DESCRIPCION_OTROS_POR_DEFECTO.RETORNO)
  return t.slice(0, MAXIMO_DESCRIPCION_OTROS)
}
export const parametroMotivoDeTipo = (tipo: TipoSalida): string => (tipo === 'PROVEEDOR' ? 'guia_motivo_codigo_devolucion' : tipo === 'MUESTRA' ? 'guia_motivo_codigo_muestra' : 'guia_motivo_codigo_venta')
/** El código que lleva la guía: el parámetro si es válido; si no, el de la tabla. */
export const codigoMotivoDeGuia = (d: Pick<DatosGuia, 'tipo' | 'motivoCodigo'>): string => (codigoMotivoValido(d.motivoCodigo) ? d.motivoCodigo!.trim() : motivoDeTraslado(d.tipo).codigo)

/** Todo lo que la guía toma del WMS (nada se vuelve a escribir). */
export interface DatosGuia {
  salidaId: string
  salidaNumero: string
  tipo: TipoSalida
  conforme: boolean
  pedidoNumero?: string
  /** `ruc` es el número del documento: el RUC o, en una muestra a nombre de un trabajador, su DNI (`tipoDocumento: 'DNI'`, D-165). */
  destinatario: { nombre?: string; ruc?: string; direccion?: string; ubigeo?: string; distrito?: string; tipoDocumento?: 'RUC' | 'DNI' }
  /** Lo confirmado en la conformidad, línea por lote. */
  lineas: LineaGuia[]
  bultos: number
  /**
   * `conductor*` es quien figura en la guía (D-155: puede no ser el conductor real mientras exista el parámetro temporal «conductor en documentos»);
   * `conductorReal` es el de la ruta, el que se guarda y se audita siempre.
   */
  ruta?: {
    id: string; numero: string; fecha: string; placa?: string; conductor?: string; conductorDni?: string; conductorDocumentoTipo?: DocumentoTipo; conductorLicencia?: string; auxiliar?: string
    conductorReal?: string
  }
  partida: { ubigeo: string; direccion: string }
  motivoTraslado: string
  modalidad: string
  serie: string
  /** El código del motivo de traslado que dice el parámetro de la base (vacío = el de la tabla). Confirmado por Sebas. */
  motivoCodigo?: string
  /** Texto de «otros» (motivo 13) del parámetro; vacío = el de la tabla. */
  motivoOtrosDescripcion?: string
  /** ¿Alguien confirmó el correlativo inicial de la serie? Sin eso no se emite una guía REAL (D-163). */
  correlativoConfirmado?: boolean
  /** Reglas de SUNAT para la baja: PENDIENTE hasta que Contabilidad y Nubefact las validen. */
  reglasBaja: { plazoHoras: string; trasInicioTraslado: string; soportadaPorApi: string }
}

/** Lo que completa o confirma el Jefe de Transporte al emitir. */
export interface TrasladoGuia {
  fechaInicio: string
  pesoKg: number
  /** Si el conductor ya tiene licencia guardada se usa esa; si no, se escribe aquí y vale solo para esta guía. */
  licenciaConductor?: string
}

/** Catálogo 06 de SUNAT para la persona que conduce: 1 = DNI, 4 = carné de extranjería, 7 = pasaporte. */
export const CODIGO_DOCUMENTO_SUNAT: Record<DocumentoTipo, '1' | '4' | '7'> = { DNI: '1', CE: '4', PASAPORTE: '7' }

/** La licencia que va en la guía: la que se escribió al emitir o, si no, la del conductor. */
export const licenciaDeGuia = (d: DatosGuia, t: TrasladoGuia) => (t.licenciaConductor?.trim() || d.ruta?.conductorLicencia?.trim() || '').toUpperCase()

/** Placa como la pide SUNAT: mayúsculas, sin guiones ni espacios. */
export const placaParaSunat = (p: string | undefined) => (p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Nubefact pide nombre y apellidos por separado: la primera palabra es el nombre y el resto los apellidos (el Jefe de Transporte lo corrige si no coincide). */
export function separarNombre(completo: string | undefined): { nombre: string; apellidos: string } {
  const partes = (completo ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 1) return { nombre: partes[0] ?? '', apellidos: partes[0] ?? '' }
  if (partes.length === 2) return { nombre: partes[0], apellidos: partes[1] }
  const mitad = Math.ceil(partes.length / 2)
  return { nombre: partes.slice(0, mitad).join(' '), apellidos: partes.slice(mitad).join(' ') }
}

const PENDIENTE = 'PENDIENTE'
const faltaTexto = (v: string | undefined) => !v || v.trim() === '' || v.trim().toUpperCase() === PENDIENTE

/** Por qué todavía no se puede emitir, en palabras (vacío = se puede). Primero lo del flujo; luego lo que falta en los datos. */
export function faltantesDeGuia(d: DatosGuia, t: TrasladoGuia, modo?: ModoNubefact): string[] {
  const f: string[] = []
  if (d.tipo === 'CLIENTE') return ['La guía de una orden de un cliente de almacenamiento la trae el cliente: el WMS no la emite']
  // D-163: una guía REAL no se emite hasta que alguien confirme con qué número empieza la serie (la base lo exige igual)
  if (modo === 'PRODUCCION' && d.correlativoConfirmado !== true) f.push(MENSAJE_SIN_CORRELATIVO(d.serie))
  if (!d.conforme) f.push('Falta la conformidad de toda la Orden de Salida')
  if (!d.ruta) f.push('Asigna el pedido a una ruta: la guía toma el vehículo, el conductor y la fecha de la ruta')
  else {
    if (!d.ruta.placa) f.push('La ruta no tiene vehículo')
    if (!d.ruta.conductor) f.push('La ruta no tiene conductor')
    else if (!d.ruta.conductorDni) f.push(`Falta el documento de identidad de ${d.ruta.conductor} (DNI o carné de extranjería): se completa en Rutas, Conductores`)
  }
  if (faltaTexto(d.destinatario.nombre)) f.push('Falta el nombre del cliente')
  if (faltaTexto(d.destinatario.ruc)) f.push(d.destinatario.tipoDocumento === 'DNI' ? 'Falta el DNI de quien recibe' : 'Falta el RUC del cliente')
  if (faltaTexto(d.destinatario.direccion)) f.push('Falta la dirección de entrega')
  if (faltaTexto(d.destinatario.ubigeo)) f.push('Falta el ubigeo de la dirección de entrega: lo trae el pedido')
  if (faltaTexto(d.partida.direccion)) f.push('Falta la dirección del almacén de Lurín (punto de partida): la confirma Charlie o Katia')
  if (d.lineas.length === 0) f.push('La guía no tiene productos')
  if (!d.bultos || d.bultos < 1) f.push('Falta el número de bultos')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.fechaInicio)) f.push('Indica la fecha de inicio del traslado')
  if (!(t.pesoKg > 0)) f.push('El peso bruto tiene que ser mayor que cero')
  if (d.ruta?.conductor && !/^[A-Z0-9]{9,10}$/.test(licenciaDeGuia(d, t))) f.push('Falta la licencia de conducir del conductor (9 o 10 letras y números)')
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
  /** Entero sin ceros a la izquierda: Nubefact no lo asigna, lo lleva el WMS (tabla guia_correlativos). */
  numero: number
  /** 6 = RUC; 1 = DNI (una muestra a nombre de un trabajador). */
  cliente_tipo_de_documento: 1 | 6
  cliente_numero_de_documento: string
  cliente_denominacion: string
  cliente_direccion: string
  fecha_de_emision: string
  observaciones: string
  /** Catálogo 20 de SUNAT (dos dígitos): sale del parámetro de la base (confirmado por Sebas). */
  motivo_de_traslado: string
  /** Solo con el motivo 13 (OTROS): máximo 70 caracteres. */
  motivo_de_traslado_otros_descripcion?: string
  peso_bruto_total: string
  peso_bruto_unidad_de_medida: 'KGM'
  numero_de_bultos: string
  tipo_de_transporte: '02'
  fecha_de_inicio_de_traslado: string
  transportista_placa_numero: string
  conductor_documento_tipo: '1' | '4' | '7'
  conductor_documento_numero: string
  conductor_nombre: string
  conductor_apellidos: string
  conductor_numero_licencia: string
  punto_de_partida_ubigeo: string
  punto_de_partida_direccion: string
  punto_de_partida_codigo_establecimiento_sunat: '0000'
  punto_de_llegada_ubigeo: string
  punto_de_llegada_direccion: string
  punto_de_llegada_codigo_establecimiento_sunat: '0000'
  enviar_automaticamente_al_cliente: 'false'
  items: { unidad_de_medida: 'NIU'; codigo: string; descripcion: string; cantidad: string }[]
}

/** Segundo paso de Nubefact: con serie y número se consulta si SUNAT ya aceptó la guía (y recién entonces trae PDF, XML y CDR). */
export interface PayloadConsulta { operacion: 'consultar_guia'; tipo_de_comprobante: 7; serie: string; numero: number }

/** Observación de almacenamiento: el pedido, la Orden de Salida y los lotes con su vencimiento (línea por lote en BX). */
export function observacionDeGuia(d: DatosGuia): string {
  const lotes = d.lineas.map((l) => `${l.productoCodigo} lote ${l.lote}${l.vence ? ` vence ${ddmmaaaa(l.vence).slice(3)}` : ''}`).join('; ')
  const clase = d.tipo === 'MUESTRA' ? 'Muestra sin valor comercial. ' : d.tipo === 'PROVEEDOR' ? 'Devolución al proveedor. ' : ''
  return `Almacenamiento y distribución. ${clase}${d.pedidoNumero ? `Pedido ${d.pedidoNumero}. ` : ''}Orden de Salida ${d.salidaNumero}. ${lotes}`.slice(0, 500)
}

export function construirPayloadNubefact(d: DatosGuia, t: TrasladoGuia, hoy: string, numero: number): PayloadNubefact {
  const { nombre, apellidos } = separarNombre(d.ruta?.conductor)
  return {
    operacion: 'generar_guia', tipo_de_comprobante: 7, serie: d.serie, numero,
    cliente_tipo_de_documento: d.destinatario.tipoDocumento === 'DNI' ? 1 : 6, cliente_numero_de_documento: sinEspacios(d.destinatario.ruc), cliente_denominacion: sinEspacios(d.destinatario.nombre).slice(0, 100),
    cliente_direccion: sinEspacios(d.destinatario.direccion).slice(0, 100), fecha_de_emision: ddmmaaaa(hoy), observaciones: observacionDeGuia(d),
    motivo_de_traslado: codigoMotivoDeGuia(d), ...(descripcionOtrosDeGuia(d) ? { motivo_de_traslado_otros_descripcion: descripcionOtrosDeGuia(d) } : {}), peso_bruto_total: t.pesoKg.toFixed(2), peso_bruto_unidad_de_medida: 'KGM', numero_de_bultos: String(d.bultos), tipo_de_transporte: '02',
    fecha_de_inicio_de_traslado: ddmmaaaa(t.fechaInicio),
    transportista_placa_numero: placaParaSunat(d.ruta?.placa), conductor_documento_tipo: CODIGO_DOCUMENTO_SUNAT[d.ruta?.conductorDocumentoTipo ?? 'DNI'], conductor_documento_numero: sinEspacios(d.ruta?.conductorDni),
    conductor_nombre: nombre, conductor_apellidos: apellidos, conductor_numero_licencia: licenciaDeGuia(d, t),
    punto_de_partida_ubigeo: d.partida.ubigeo, punto_de_partida_direccion: d.partida.direccion.slice(0, 150), punto_de_partida_codigo_establecimiento_sunat: '0000',
    punto_de_llegada_ubigeo: sinEspacios(d.destinatario.ubigeo), punto_de_llegada_direccion: sinEspacios(d.destinatario.direccion).slice(0, 150), punto_de_llegada_codigo_establecimiento_sunat: '0000',
    enviar_automaticamente_al_cliente: 'false',
    items: d.lineas.map((l) => ({ unidad_de_medida: 'NIU', codigo: l.productoCodigo, descripcion: `${l.producto} · lote ${l.lote}`.slice(0, 250), cantidad: String(l.cantidad) })),
  }
}

export const construirConsulta = (serie: string, numero: number): PayloadConsulta => ({ operacion: 'consultar_guia', tipo_de_comprobante: 7, serie, numero })

/** «TTT1-00000057» → { serie, numero: 57 }. */
export function partirNumeroGuia(n: string): { serie: string; numero: number } {
  const [serie, num] = n.split('-')
  return { serie, numero: Number(num) }
}
export const formatoNumeroGuia = (serie: string, numero: number) => `${serie}-${String(numero).padStart(8, '0')}`

/** Respuesta del paso 1 («generar_guia»): Nubefact recibió la guía y la mandó a SUNAT. El PDF y el XML llegan recién con el paso 2.
 *  Si Nubefact ya la devuelve aceptada, trae los enlaces; si no, quedan PENDIENTES hasta consultar. */
export type RespuestaEmision =
  | { ok: true; numero: string; enlace?: string; enlaceXml?: string; enlaceCdr?: string; hash: string; estadoSunat: EstadoSunat; entorno: ModoNubefact; cruda: unknown }
  /** `causa`: si el error es de la numeración (el número ya existe o no sigue al último), el WMS lo reconcilia en vez de solo mostrarlo (D-164). `numeroEsperado`: si Nubefact lo dice. */
  | { ok: false; error: string; reintentable: boolean; causa?: CausaNubefact; numeroEsperado?: number }

/** Respuesta del paso 2 («consultar_guia»). RECHAZADA trae el motivo en lenguaje humano. */
export type RespuestaConsulta =
  /** `anuladaEnNubefact`: la guía se dio de baja en el panel de Nubefact (D-166): el WMS la anula también y la orden vuelve a necesitar guía. */
  | { ok: true; estadoSunat: EstadoSunat; enlace?: string; enlaceXml?: string; enlaceCdr?: string; hash?: string; error?: string; anuladaEnNubefact?: boolean; cruda: unknown }
  | { ok: false; error: string; reintentable: boolean; causa?: CausaNubefact }

/** Los errores de SUNAT/Nubefact más comunes, dichos para quien emite (el texto original se conserva en el detalle). */
export function mensajeHumanoSunat(codigo: string | number | undefined, textoOriginal: string): string {
  const c = String(codigo ?? '')
  const tabla: Record<string, string> = {
    '1033': 'SUNAT ya tiene una guía con ese número (el número ya estaba usado)',
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
  { caso: 3, titulo: 'La guía ya salió', detalle: 'Después de la salida confirmada. No hay plazo para darla de baja (a confirmar con Contabilidad).',
    sigue: 'El stock NO se toca: la salida sigue confirmada. La orden queda «guía anulada, falta guía vigente» y emites una guía nueva. Si la mercadería vuelve al almacén, entra como una devolución.' },
]
/** Un caso solo vale antes (1 y 2) o solo después (3) de la salida confirmada. */
export const MENSAJE_CASO_3_ANTES_DE_SALIR = 'La orden todavía no salió: elige «me equivoqué en los datos» o «me equivoqué en el contenido»'
export const MENSAJE_CASO_1_2_DESPUES_DE_SALIR = 'La orden ya salió: elige «la guía ya salió». El stock no se toca y se emite una guía nueva'
/** @deprecated D-191: la baja después de la salida ya no se bloquea; se mantiene el nombre para quien lo importe. */
export const MENSAJE_CASO_3 = MENSAJE_CASO_3_ANTES_DE_SALIR
/** Texto de «Qué pasa con la baja» ante SUNAT (D-191). */
export const TEXTO_BAJA_EN_NUBEFACT = 'Dala de baja también en el panel de Nubefact: SUNAT no fija un plazo (se confirma con Contabilidad). Si ya la diste de baja allá, usa «Verificar en Nubefact».'

/** Por qué no se puede anular con ese caso (null = se puede). Espejo de wms.anular_guia (0034). */
export function motivoNoPuedeAnular(roles: readonly Rol[], caso: CasoAnulacion | null, o: { salidaAbierta: boolean; guiaVigente: boolean; motivo: string; salidaConfirmada?: boolean }): string | null {
  if (!puedeAnularGuia(roles)) return 'Solo el Jefe de Transporte puede anular una guía'
  if (!o.guiaVigente) return 'Esa guía ya está anulada'
  if (caso === null) return 'Elige qué se equivocó: los datos del traslado, el contenido, o la guía ya salió'
  const confirmada = o.salidaConfirmada ?? !o.salidaAbierta
  if (caso === 3 && !confirmada) return MENSAJE_CASO_3_ANTES_DE_SALIR
  if (caso !== 3 && !o.salidaAbierta) return confirmada ? MENSAJE_CASO_1_2_DESPUES_DE_SALIR : 'La orden está cancelada: no hay nada que anular'
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
