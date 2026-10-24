// Bajas con sustento por motivo y la Orden de Baja LS-FR.56.01 (OS-6, integrada en BJ1). Reglas puras, sin Next ni Supabase.
// Espejo de la migración 0026: la base de datos es la que manda; esto adelanta el mensaje y oculta botones.
import { puede } from './permisos'
import { itemsPendientes, type Checklist } from './entradas'
import type { Rol } from './tipos'

// ── Motivos y su sustento (aprobado por Katia, DT 2026-10-17 §8) ────────────

export type MotivoBaja = 'VENCIDO' | 'DETERIORO_DANO' | 'ALERTA_DIGEMID' | 'OBSERVACION_PROVEEDOR'
export const MOTIVOS_BAJA: readonly MotivoBaja[] = ['VENCIDO', 'DETERIORO_DANO', 'ALERTA_DIGEMID', 'OBSERVACION_PROVEEDOR']

export const ETIQUETA_MOTIVO_BAJA: Record<MotivoBaja, string> = {
  VENCIDO: 'Vencido',
  DETERIORO_DANO: 'Deterioro o daño',
  ALERTA_DIGEMID: 'Alerta o retiro de DIGEMID',
  OBSERVACION_PROVEEDOR: 'Observación del proveedor o fabricante',
}

/** Qué sustento pide cada motivo, en palabras de personas. */
export const SUSTENTO_DE_MOTIVO: Record<MotivoBaja, string> = {
  VENCIDO: 'La fecha de vencimiento: el sistema la toma del lote y Dirección Técnica la confirma.',
  DETERIORO_DANO: 'Una evaluación como la del acta organoléptica, que concluya no conforme.',
  ALERTA_DIGEMID: 'La alerta o el retiro de DIGEMID, adjunto (PDF o imagen).',
  OBSERVACION_PROVEEDOR: 'La comunicación del proveedor o fabricante, adjunta (PDF o imagen).',
}

export type TipoSustentoBaja = 'ALERTA_DIGEMID' | 'COMUNICACION_PROVEEDOR'
export const TIPO_SUSTENTO_DE_MOTIVO: Partial<Record<MotivoBaja, TipoSustentoBaja>> = { ALERTA_DIGEMID: 'ALERTA_DIGEMID', OBSERVACION_PROVEEDOR: 'COMUNICACION_PROVEEDOR' }
export const ETIQUETA_SUSTENTO: Record<TipoSustentoBaja, string> = { ALERTA_DIGEMID: 'Alerta o retiro de DIGEMID', COMUNICACION_PROVEEDOR: 'Comunicación del proveedor o fabricante' }

/** Estados desde los que se puede pedir una baja. Lo que ya está en Bajas/Rechazados no se vuelve a dar de baja. */
export type EstadoBajable = 'APROBADO' | 'CUARENTENA' | 'DEVOLUCIONES'
export const ESTADOS_BAJABLES: readonly EstadoBajable[] = ['APROBADO', 'CUARENTENA', 'DEVOLUCIONES']
export const ETIQUETA_ESTADO_BAJABLE: Record<EstadoBajable, string> = { APROBADO: 'Aprobado', CUARENTENA: 'Cuarentena', DEVOLUCIONES: 'Devoluciones' }

// ── Estados de la Orden de Baja ─────────────────────────────────────────────

export type EstadoOrdenBaja = 'SOLICITADA' | 'EMITIDA' | 'RECHAZADA' | 'CANCELADA' | 'ANULADA'
export const ETIQUETA_ESTADO_BAJA: Record<EstadoOrdenBaja, string> = {
  SOLICITADA: 'Por autorizar', EMITIDA: 'Emitida', RECHAZADA: 'Rechazada', CANCELADA: 'Retirada', ANULADA: 'Anulada',
}

// ── Permisos (espejo de wms.permisos_rol) ───────────────────────────────────

export const puedeSolicitarBaja = (roles: readonly Rol[]) => puede(roles, 'solicitar_baja')
export const puedeAutorizarBaja = (roles: readonly Rol[]) => puede(roles, 'autorizar_baja') && roles.includes('direccion_tecnica')
/** La evaluación del daño la registran la asistente de Dirección Técnica y Dirección Técnica. */
export const puedeEvaluarBaja = (roles: readonly Rol[]) => roles.includes('asistente_dt') || roles.includes('direccion_tecnica')
/** Llevar las unidades al área de Bajas es un movimiento interno: lo registra quien tiene el permiso de ejecutar. */
export const puedeTrasladarBaja = (roles: readonly Rol[]) => puede(roles, 'ejecutar')

// ── Vistas ──────────────────────────────────────────────────────────────────

export interface SustentoBajaVista {
  id: string
  tipo: TipoSustentoBaja
  nombreArchivo: string
  archivoRef: string
  referencia?: string
  bytes?: number
  agregadoPor: string
  agregadoEn: string
}

export interface EvaluacionBajaVista {
  id: string
  version: number
  checklist: Checklist
  certAnalisis: boolean | null
  observacion: string
  conclusion: 'CONFORME' | 'NO_CONFORME'
  evaluadaPor: string
  evaluadaEn: string
}

export interface LineaBajaVista {
  id: string
  n: number
  productoId: string
  productoCodigo: string
  producto: string
  presentacion?: string
  registroSanitario?: string
  loteId: string
  lote: string
  /** Vencimiento actual del lote. */
  vence?: string
  posicionId: string
  posicion: string
  estadoOrigen: EstadoBajable
  cantidad: number
  motivo: MotivoBaja
  detalle?: string
  vencePropuesta?: string
  venceConfirmada?: string
  venceConfirmadaPor?: string
  sustentos: SustentoBajaVista[]
  /** La última versión. */
  evaluacion?: EvaluacionBajaVista
  evaluaciones: number
  /** Lo que falta de su sustento (nulo si está completo). */
  faltante: string | null
}

export interface TrasladoBajaVista {
  ordenMovimientoId: string
  numero: string
  estado: string
  destino?: string
}

export interface OrdenBajaVista {
  id: string
  numero: string
  estado: EstadoOrdenBaja
  propietarioId: string
  propietarioCodigo: string
  propietario: string
  nota?: string
  solicitadaPor: string
  solicitadaPorId: string
  solicitadaEn: string
  cerradaPor?: string
  cerradaEn?: string
  motivoCierre?: string
  emitidaPor?: string
  emitidaEn?: string
  fechaDocumento?: string
  hash?: string
  anuladaPor?: string
  anuladaEn?: string
  motivoAnulacion?: string
  reemiteDe?: { id: string; numero: string }
  reemitidaPor?: { id: string; numero: string }
  traslado?: TrasladoBajaVista
  lineas: LineaBajaVista[]
  unidades: number
}

export interface OrdenBajaResumen {
  id: string
  numero: string
  estado: EstadoOrdenBaja
  propietario: string
  propietarioCodigo: string
  lineas: number
  unidades: number
  motivos: MotivoBaja[]
  productos: string[]
  solicitadaPor: string
  solicitadaEn: string
  /** Líneas a las que todavía les falta sustento. */
  conFaltantes: number
  /** Emitida y todavía sin traslado a Bajas. */
  porTrasladar: boolean
}

/** Una fila de stock que se puede pedir de baja (la búsqueda de «Nueva baja»). */
export interface StockParaBaja {
  posicionId: string
  posicion: string
  loteId: string
  lote: string
  vence?: string
  vencido: boolean
  productoId: string
  productoCodigo: string
  producto: string
  estado: EstadoBajable
  /** Saldo menos lo comprometido en pedidos o movimientos y lo ya pedido en otras solicitudes. */
  disponible: number
}

/** Stock en estado Bajas/Rechazados por propietario, lote y ubicación (la vista `wms.v_stock_en_bajas`). Contrato para la salida por destrucción (OS-2). */
export interface StockEnBajasVista {
  propietarioId: string
  propietarioCodigo: string
  propietario: string
  productoId: string
  productoCodigo: string
  producto: string
  loteId: string
  lote: string
  vence?: string
  vencido: boolean
  posicionId: string
  posicion: string
  /** Ya está físicamente en el área de Bajas (lo que espera su traslado todavía no se destruye). */
  enAreaBajas: boolean
  cantidad: number
  ordenesBaja: string[]
  motivos: MotivoBaja[]
}

export interface EntradaLineaBaja {
  loteId: string
  posicionId: string
  estado: EstadoBajable
  cantidad: number
  motivo: MotivoBaja
  detalle?: string
}
export interface EntradaBaja { propietarioId: string; nota?: string; lineas: EntradaLineaBaja[] }

export interface DatosEvaluacionBaja {
  checklist: Checklist
  certAnalisis: boolean | null
  observacion: string
  conclusion: 'CONFORME' | 'NO_CONFORME' | null
}

// ── Reglas ──────────────────────────────────────────────────────────────────

/** Mismos mensajes que `wms.solicitar_baja`. `stock` es la fila elegida; `loteDe` el propietario del lote. */
export function validarLineaBaja(
  n: number,
  l: EntradaLineaBaja,
  ctx: { lote: string; vence?: string; propietarioDelLote: string; propietarioDeLaBaja: string; areaPosicion: string; disponible: number; comprometido?: number; posicion: string },
  hoy: string,
): string | null {
  const pref = `Línea ${n} (lote ${ctx.lote}): `
  if (ctx.propietarioDelLote !== ctx.propietarioDeLaBaja) return `${pref}el lote es de otro propietario; una baja es de un solo propietario`
  if ((l.estado as string) === 'BAJAS_RECHAZADOS' || ctx.areaPosicion === 'BAJAS_RECHAZADOS') return `${pref}eso ya está en Bajas; lo que está en Bajas no se vuelve a dar de baja`
  if (!ESTADOS_BAJABLES.includes(l.estado)) return `${pref}elige el estado del stock`
  if (ctx.areaPosicion === 'DESPACHO') return `${pref}esas unidades están en Despacho dentro de una salida; se resuelven en la salida`
  if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) return `${pref}la cantidad debe ser mayor que cero`
  if (!MOTIVOS_BAJA.includes(l.motivo)) return `${pref}elige el motivo de la baja`
  if (l.motivo === 'VENCIDO' && (!ctx.vence || ctx.vence >= hoy)) return `${pref}el lote no está vencido (vence el ${ctx.vence ? fechaCorta(ctx.vence) : 'sin fecha'}); elige otro motivo`
  if (l.cantidad > ctx.disponible) {
    const comp = ctx.comprometido ?? 0
    return `${pref}no se puede dar de baja más de lo que hay. Disponible en ${ctx.posicion} (${l.estado}): ${ctx.disponible} unidades${comp > 0 ? ` (otras ${comp} están comprometidas en pedidos o movimientos)` : ''}`
  }
  return null
}

/** dd/mm/aaaa */
export const fechaCorta = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }

/** Lo que le falta a una línea para tener su sustento (o nulo). Mismos mensajes que la base. */
export function sustentoFaltante(
  l: Pick<LineaBajaVista, 'n' | 'lote' | 'motivo' | 'vence' | 'venceConfirmada' | 'sustentos' | 'evaluacion'>,
  hoy: string,
): string | null {
  const pref = `Línea ${l.n} (lote ${l.lote}): `
  switch (l.motivo) {
    case 'VENCIDO':
      if (!l.vence || l.vence >= hoy) return `${pref}el lote no está vencido`
      if (!l.venceConfirmada) return `${pref}Dirección Técnica debe confirmar la fecha de vencimiento`
      if (l.venceConfirmada !== l.vence) return `${pref}el vencimiento del lote cambió: Dirección Técnica debe confirmarlo otra vez`
      return null
    case 'DETERIORO_DANO': {
      const e = l.evaluacion
      if (!e) return `${pref}falta la evaluación del deterioro o daño`
      if (e.conclusion !== 'NO_CONFORME') return `${pref}la evaluación concluye CONFORME: no sustenta una baja`
      if (!Object.values(e.checklist).includes('NC')) return `${pref}la evaluación no marca ningún punto no conforme`
      return null
    }
    case 'ALERTA_DIGEMID':
      return l.sustentos.some((s) => s.tipo === 'ALERTA_DIGEMID') ? null : `${pref}falta adjuntar la alerta o el retiro de DIGEMID`
    case 'OBSERVACION_PROVEEDOR':
      return l.sustentos.some((s) => s.tipo === 'COMUNICACION_PROVEEDOR') ? null : `${pref}falta adjuntar la comunicación del proveedor o fabricante`
  }
}

/** El texto corto del sustento de una línea para la tabla: «Completo» o lo que falta, sin el prefijo de línea. */
export function resumenSustento(l: LineaBajaVista): { completo: boolean; texto: string } {
  if (!l.faltante) return { completo: true, texto: 'Sustento completo' }
  return { completo: false, texto: l.faltante.replace(/^Línea \d+ \(lote [^)]*\): /, '').replace(/^./, (c) => c.toUpperCase()) }
}

/** ¿Se puede autorizar? Devuelve el primer faltante (el mismo mensaje que la base) o nulo. */
export function primerFaltante(o: Pick<OrdenBajaVista, 'lineas'>): string | null {
  for (const l of o.lineas) if (l.faltante) return `Sin sustento no se da de baja. ${l.faltante}`
  return null
}

/** Una evaluación completa para guardarla: lo que falta, en palabras de personas. */
export function faltantesEvaluacion(d: DatosEvaluacionBaja): string[] {
  const f: string[] = []
  const pend = itemsPendientes(d.checklist)
  if (pend.includes('material')) f.push('Marca el material del envase (vidrio, plástico, tubo, blíster u otro).')
  const sin = pend.filter((p) => p !== 'material').length
  if (sin > 0) f.push(`Faltan ${sin} puntos del checklist por responder.`)
  if (!d.observacion.trim()) f.push('Describe lo que viste en la observación.')
  if (!d.conclusion) f.push('Elige la conclusión (conforme o no conforme).')
  else if (d.conclusion === 'NO_CONFORME' && !Object.values(d.checklist).includes('NC')) f.push('Marca al menos un punto como no conforme.')
  return f
}

// ── Archivos adjuntos (alerta de DIGEMID, comunicación del proveedor) ────────

export const EXTENSIONES_SUSTENTO = ['pdf', 'png', 'jpg', 'jpeg', 'webp'] as const
export const MAXIMO_SUSTENTO_BYTES = 10 * 1024 * 1024
export function validarArchivoSustento(nombre: string, bytes: number): string | null {
  const ext = nombre.toLowerCase().split('.').pop() ?? ''
  if (!(EXTENSIONES_SUSTENTO as readonly string[]).includes(ext)) return 'El archivo debe ser un PDF o una imagen (PNG, JPG o WEBP).'
  if (bytes <= 0) return 'El archivo está vacío.'
  if (bytes > MAXIMO_SUSTENTO_BYTES) return 'El archivo pesa más de 10 MB. Reduce su tamaño y vuelve a subirlo.'
  return null
}
export const contentTypeSustento = (nombre: string) => {
  const ext = nombre.toLowerCase().split('.').pop() ?? ''
  return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
}

// ── Siguiente paso (quién y qué) ────────────────────────────────────────────

export interface PasoBaja { quien: string; texto: string; tono: 'espera' | 'accion' | 'listo' | 'cerrada' }

export function siguientePasoBaja(o: Pick<OrdenBajaVista | OrdenBajaResumen, 'estado'> & { lineas: LineaBajaVista[] | number; traslado?: TrasladoBajaVista; porTrasladar?: boolean; conFaltantes?: number }): PasoBaja {
  switch (o.estado) {
    case 'SOLICITADA': {
      const faltan = typeof o.lineas === 'number' ? (o.conFaltantes ?? 0) : o.lineas.filter((l) => l.faltante).length
      return faltan > 0
        ? { quien: 'Quien pidió la baja', texto: `Completar el sustento de ${faltan === 1 ? '1 línea' : `${faltan} líneas`}`, tono: 'accion' }
        : { quien: 'Dirección Técnica (Katia)', texto: 'Revisar el sustento y autorizar', tono: 'accion' }
    }
    case 'EMITIDA':
      return (o.traslado || (typeof o.porTrasladar === 'boolean' && !o.porTrasladar))
        ? { quien: 'Otra persona del almacén', texto: 'Verificar el traslado a Bajas', tono: 'listo' }
        : { quien: 'Jefe de Almacén o auxiliar', texto: 'Llevar las unidades al área de Bajas y registrarlo', tono: 'accion' }
    case 'RECHAZADA': return { quien: '—', texto: 'Rechazada por Dirección Técnica', tono: 'cerrada' }
    case 'CANCELADA': return { quien: '—', texto: 'Solicitud retirada', tono: 'cerrada' }
    case 'ANULADA': return { quien: 'Dirección Técnica', texto: 'Anulada; se puede reemitir', tono: 'cerrada' }
  }
}

// ── Mensajes después de cada acción: qué pasó y qué sigue ───────────────────

export const MENSAJE_BAJA = {
  solicitada: (numero: string) => `Baja ${numero} solicitada. Siguiente: completa el sustento de cada línea y Katia lo revisa para autorizar.`,
  vencimientoConfirmado: 'Vencimiento confirmado. Siguiente: si ya no falta nada, autoriza la baja.',
  evaluacionGuardada: 'Evaluación guardada. Siguiente: si concluye no conforme, queda como sustento y Katia puede autorizar.',
  sustentoAdjuntado: 'Archivo adjuntado. Siguiente: Katia revisa el sustento y autoriza.',
  autorizada: (numero: string) => `Baja ${numero} autorizada y Orden de Baja emitida. Siguiente: el Jefe de Almacén lleva las unidades al área de Bajas y lo registra aquí.`,
  rechazada: 'Baja rechazada. Quien la pidió ve tu motivo y puede hacer otra solicitud.',
  retirada: 'Solicitud retirada. Si hace falta, haz otra.',
  anulada: 'Orden anulada. El stock sigue en Bajas. Siguiente: si el documento tenía un error, reemítela.',
  reemitida: (numero: string) => `Orden reemitida como ${numero}. Descárgala y sustituye la anulada.`,
  trasladada: (numero: string) => `Traslado registrado (${numero}). Siguiente: otra persona del almacén lo verifica en Movimientos.`,
}

// ── Contenido del documento LS-FR.56.01 ─────────────────────────────────────

export interface LineaContenidoBaja {
  n: number
  productoCodigo: string
  producto: string
  presentacion?: string
  registroSanitario?: string
  lote: string
  vence?: string
  cantidad: number
  motivo: MotivoBaja
  motivoTexto: string
  detalle?: string
  estadoOrigen: EstadoBajable
  ubicacion: string
  sustento?: string
}

export interface ContenidoOrdenBaja {
  formato: string
  poe: string
  vigencia: string
  numero: string
  fecha: string
  reemite?: string
  solicitante: { nombre: string; cargo: string }
  /** Quien firma el V°/B° (DT 2026-10-23, D-170): Katia Zapata, Dirección Técnica. */
  vistoBueno: { nombre: string; cargo: string }
  motivoTraslado: string
  propietario: { codigo: string; razonSocial: string }
  lineas: LineaContenidoBaja[]
}

export interface ParametrosFormatoBaja {
  formato: string
  poe: string
  vigencia: string
  solicitanteNombre: string
  solicitanteCargo: string
  vistoBuenoNombre: string
  vistoBuenoCargo: string
  motivoTraslado: string
}

/** Lo mismo que los parámetros de las migraciones 0026 y 0033 (código oficial LS-FR.56.01; Katia Zapata firma el V°/B°): quedan aquí, no en el código del PDF. */
export const PARAMETROS_FORMATO_BAJA: ParametrosFormatoBaja = {
  formato: 'LS-FR.56.01', poe: 'LS-POE.11.01', vigencia: 'Desde 01.09.2026 hasta 01.09.2028',
  solicitanteNombre: 'Katia Zapata', solicitanteCargo: 'Dirección Técnica', vistoBuenoNombre: 'Katia Zapata', vistoBuenoCargo: 'Dirección Técnica', motivoTraslado: 'Traslado al área de baja',
}

export function textoSustentoLinea(l: LineaBajaVista): string | undefined {
  switch (l.motivo) {
    case 'VENCIDO': return l.venceConfirmada ? `Venció el ${fechaCorta(l.venceConfirmada)} (fecha confirmada por Dirección Técnica)` : undefined
    case 'DETERIORO_DANO': return l.evaluacion ? `Evaluación organoléptica NO CONFORME (versión ${l.evaluacion.version})` : undefined
    default: return l.sustentos.length ? l.sustentos.map((s) => s.nombreArchivo + (s.referencia ? ` · ${s.referencia}` : '')).join('; ') : undefined
  }
}

export function contenidoDeOrden(o: OrdenBajaVista, fecha: string, params: ParametrosFormatoBaja = PARAMETROS_FORMATO_BAJA): ContenidoOrdenBaja {
  return {
    formato: params.formato, poe: params.poe, vigencia: params.vigencia, numero: o.numero, fecha, reemite: o.reemiteDe?.numero,
    solicitante: { nombre: params.solicitanteNombre, cargo: params.solicitanteCargo }, vistoBueno: { nombre: params.vistoBuenoNombre, cargo: params.vistoBuenoCargo }, motivoTraslado: params.motivoTraslado,
    propietario: { codigo: o.propietarioCodigo, razonSocial: o.propietario },
    lineas: o.lineas.map((l): LineaContenidoBaja => ({
      n: l.n, productoCodigo: l.productoCodigo, producto: l.producto, presentacion: l.presentacion, registroSanitario: l.registroSanitario, lote: l.lote, vence: l.vence,
      cantidad: l.cantidad, motivo: l.motivo, motivoTexto: ETIQUETA_MOTIVO_BAJA[l.motivo], detalle: l.detalle, estadoOrigen: l.estadoOrigen, ubicacion: l.posicion, sustento: textoSustentoLinea(l),
    })),
  }
}

/** «Vencido (venció el 30/06/2026)»: lo que lleva la columna Motivo del formato. */
export function motivoParaFormato(l: Pick<LineaContenidoBaja, 'motivo' | 'motivoTexto' | 'detalle' | 'vence'>): string {
  const base = l.motivo === 'VENCIDO' && l.vence ? `${l.motivoTexto} (venció el ${fechaCorta(l.vence)})` : l.motivoTexto
  return l.detalle ? `${base}: ${l.detalle}` : base
}

/** Fecha del documento partida en día, mes y año (el formato trae tres casillas). */
export function partesDeFecha(iso: string): { dia: string; mes: string; anio: string } {
  const [anio, mes, dia] = iso.split('-')
  return { dia, mes, anio }
}
