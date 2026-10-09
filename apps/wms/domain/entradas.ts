// Entradas y calidad: reglas puras (sin Next ni Supabase). La base de datos repite estas
// reglas (migración 0005); aquí se usan para dar mensajes claros antes de llegar a ella
// y para el modo demostración.
//
// Flujo (addendum del 2026-10-08): la SOLICITUD DE INGRESO es la entidad primaria (SI-AAAA-NNNNN, sin inventario);
// la recepción física la VERIFICA (coincide / hay una diferencia → se ajusta la solicitud, con historial); el Acta de
// Recepción sale prellenada de la solicitud final; al confirmarla recién nace el inventario.

import type { Estado, Propietario, Rol } from './tipos'

// ── Tipos de ingreso ────────────────────────────────────────────────────────

export type TipoIngreso = 'COMPRA_LOCAL' | 'DEVOLUCION' | 'INGRESO_CLIENTE'
export const TIPOS_INGRESO: readonly TipoIngreso[] = ['COMPRA_LOCAL', 'DEVOLUCION', 'INGRESO_CLIENTE']

export const ETIQUETA_TIPO_INGRESO: Record<TipoIngreso, string> = {
  COMPRA_LOCAL: 'Compra local',
  DEVOLUCION: 'Devolución',
  INGRESO_CLIENTE: 'Ingreso de cliente',
}

export const AYUDA_TIPO_INGRESO: Record<TipoIngreso, string> = {
  COMPRA_LOCAL: 'Una orden de compra que va a llegar. Los productos y las cantidades salen de ella; tú indicas el lote y el vencimiento.',
  DEVOLUCION: 'Mercadería que vuelve de un cliente. Necesita la factura o boleta original y se deja en el Área de Devoluciones.',
  INGRESO_CLIENTE: 'Mercadería que un cliente nos entrega para guardar. Se cuenta contra su guía.',
}

/** Dónde nace el inventario de cada tipo (D-31): la devolución, en su propia área y estado; lo demás, en Cuarentena. */
export const ESTADO_INICIAL: Record<TipoIngreso, Estado> = {
  COMPRA_LOCAL: 'CUARENTENA',
  INGRESO_CLIENTE: 'CUARENTENA',
  DEVOLUCION: 'DEVOLUCIONES',
}
export const AREA_DESTINO: Record<TipoIngreso, 'CUARENTENA' | 'DEVOLUCIONES'> = {
  COMPRA_LOCAL: 'CUARENTENA',
  INGRESO_CLIENTE: 'CUARENTENA',
  DEVOLUCION: 'DEVOLUCIONES',
}

// ── Quién prepara solicitudes (D-32) ────────────────────────────────────────

/** Sandra (asistente de DT) y Katia (Dirección Técnica). Con el portal de clientes, el cliente crea y ellas autorizan. */
export const puedePrepararSolicitud = (roles: readonly Rol[]) => roles.includes('asistente_dt') || roles.includes('direccion_tecnica')

// ── Estados de la solicitud ─────────────────────────────────────────────────

export type EstadoSolicitud = 'BORRADOR' | 'ENVIADA' | 'PROGRAMADA' | 'EN_RECEPCION' | 'CERRADA' | 'ANULADA'

export const ETIQUETA_ESTADO_SOLICITUD: Record<EstadoSolicitud, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Por autorizar',
  PROGRAMADA: 'Por llegar',
  EN_RECEPCION: 'En recepción',
  CERRADA: 'Cerrada',
  ANULADA: 'Anulada',
}

export type EstadoLineaSolicitud = 'ESPERADA' | 'AJUSTADA' | 'RETIRADA'
export type VerificacionLinea = 'PENDIENTE' | 'COINCIDE' | 'AJUSTADA'

// ── Líneas de la solicitud ──────────────────────────────────────────────────

export interface EntradaLineaSolicitud {
  /** Compra local: la línea de la OC de la que sale (varias líneas de solicitud pueden salir de una misma de OC). */
  ocItemId?: string
  productoId?: string
  lote: string
  /** Texto tal como lo escribe la persona (ver parsearVencimiento). */
  vence: string
  cantidad: number | string
}

export type ErroresLineaSolicitud = Partial<Record<'producto' | 'lote' | 'cantidad' | 'vence', string>>

export function validarLineaSolicitud(
  e: EntradaLineaSolicitud,
  tipo: TipoIngreso,
  parsear: (t: string) => { fecha: string; textoOriginal: string } | null,
): { ok: true; cantidad: number; vence: string; venceTexto: string } | { ok: false; errores: ErroresLineaSolicitud } {
  const errores: ErroresLineaSolicitud = {}
  if (tipo === 'COMPRA_LOCAL' ? !e.ocItemId : !e.productoId) errores.producto = 'Elige el producto.'
  if (!e.lote?.trim()) errores.lote = 'Escribe el lote tal como está impreso.'
  const n = typeof e.cantidad === 'number' ? e.cantidad : Number(String(e.cantidad).replace(/\s/g, ''))
  if (!Number.isInteger(n) || n <= 0) errores.cantidad = 'La cantidad es un número entero mayor que cero.'
  const f = e.vence?.trim() ? parsear(e.vence) : null
  if (!e.vence?.trim()) errores.vence = 'Falta el vencimiento.'
  else if (!f) errores.vence = 'No entiendo esa fecha. Usa 30/06/2028 o, si el producto solo dice mes y año, 06/2028.'
  if (Object.keys(errores).length || !f) return { ok: false, errores }
  return { ok: true, cantidad: n, vence: f.fecha, venceTexto: f.textoOriginal }
}

// ── Temperatura ─────────────────────────────────────────────────────────────

export const TEMPERATURA_MIN_C = 15
export const TEMPERATURA_MAX_C = 25

export function temperaturaFueraDeRango(t: number | null | undefined, min = TEMPERATURA_MIN_C, max = TEMPERATURA_MAX_C): boolean {
  return t != null && (t < min || t > max)
}

export function mensajeTemperatura(t: number, min = TEMPERATURA_MIN_C, max = TEMPERATURA_MAX_C): string {
  return `La mercadería llegó a ${t} °C, fuera del rango de ${min} a ${max} °C. Se recibió; revísala antes de aprobar.`
}

// ── Validación al crear una solicitud ───────────────────────────────────────

export interface EntradaSolicitud {
  tipo: TipoIngreso
  propietarioId: string
  /** Compra local: la orden de compra. */
  ocId?: string
  contraparteNombre?: string
  contraparteRuc?: string
  guiaNumero?: string
  docOriginalTipo?: 'FACTURA' | 'BOLETA'
  docOriginalNumero?: string
  motivo?: string
  observaciones?: string
  fechaPrevista?: string
  lineas: EntradaLineaSolicitud[]
}

export type ErroresSolicitud = Partial<Record<
  'tipo' | 'propietarioId' | 'ocId' | 'contraparteRuc' | 'guiaNumero' | 'docOriginal' | 'lineas', string>>

export function validarEntradaSolicitud(
  e: EntradaSolicitud,
  propietario: Pick<Propietario, 'esDuenoAlmacen'> | undefined,
): { ok: true } | { ok: false; errores: ErroresSolicitud } {
  const errores: ErroresSolicitud = {}
  if (!TIPOS_INGRESO.includes(e.tipo)) errores.tipo = 'Elige el tipo de ingreso.'
  if (!propietario) errores.propietarioId = 'Elige el propietario.'
  if (e.contraparteRuc?.trim() && !rucValido(e.contraparteRuc)) errores.contraparteRuc = 'El RUC tiene 11 dígitos.'
  if (e.tipo === 'COMPRA_LOCAL') {
    if (!e.ocId) errores.ocId = 'Elige la orden de compra.'
    if (propietario && !propietario.esDuenoAlmacen) errores.propietarioId = 'Una compra local es stock propio: el propietario es Logissa.'
  } else if (e.tipo === 'DEVOLUCION') {
    if (!e.docOriginalTipo || !e.docOriginalNumero?.trim()) errores.docOriginal = 'Sin la factura o boleta original no se puede registrar la devolución.'
  } else if (e.tipo === 'INGRESO_CLIENTE') {
    if (!e.guiaNumero?.trim()) errores.guiaNumero = 'Escribe el número de la guía del cliente.'
    if (propietario?.esDuenoAlmacen) errores.propietarioId = 'Un ingreso de cliente queda a nombre del cliente, no de Logissa.'
  }
  if (e.lineas.length === 0) errores.lineas = 'Agrega al menos un producto con su lote, su vencimiento y su cantidad.'
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true }
}

/** RUC peruano: siempre texto de 11 dígitos (nunca número: perdería ceros y se vería como 2.05E+10). */
export const rucValido = (r: string) => /^\d{11}$/.test(r.trim())

// ── Cambios a la solicitud (historial campo a campo) ────────────────────────

export type CambioEntrada =
  | { op: 'LINEA'; lineaId: string; campo: 'cantidad' | 'lote' | 'vence'; valor: string; venceTexto?: string }
  | { op: 'AGREGAR_LINEA'; ocItemId?: string; productoId?: string; lote: string; vence: string; venceTexto?: string; cantidad: number }
  | { op: 'ENCABEZADO'; campo: 'guia_numero' | 'contraparte_nombre' | 'contraparte_ruc' | 'motivo' | 'observaciones' | 'fecha_prevista' | 'doc_original_tipo' | 'doc_original_numero'; valor: string }

export const ETIQUETA_CAMPO_CAMBIO: Record<string, string> = {
  cantidad: 'cantidad', lote: 'lote', vence: 'vencimiento', guia_numero: 'guía', contraparte_nombre: 'proveedor o cliente',
  contraparte_ruc: 'RUC', motivo: 'motivo', observaciones: 'observaciones', fecha_prevista: 'fecha prevista',
  doc_original_tipo: 'tipo de documento original', doc_original_numero: 'documento original', 'línea agregada': 'línea agregada',
}

/** "Esperábamos 50 y encontramos 45": el texto que ve quien verifica antes de confirmar el ajuste. */
export const textoDiferencia = (esperado: number, encontrado: number) =>
  `Actualizaremos la Solicitud de ${esperado} → ${encontrado}. El cambio quedará registrado.`

/** Varias personas leen la misma cifra de maneras distintas: la solicitud final es lo que el WMS espera y confirma. */
export interface CantidadesLinea {
  /** Lo que pedía la orden de compra (solo compras). */
  ocPedida?: number
  /** Lo anunciado al autorizar. Inmutable. */
  inicial?: number
  /** Solicitud final (la vigente). */
  final: number
  /** Lo confirmado físicamente al firmar el acta. */
  fisica?: number
  /** Lo que Compras muestra como recibido (se copia a mano). */
  registradoEnCompras?: number
}

export type EstadoRegistroCompras = 'OK' | 'FALTA' | 'NO_COINCIDE'

/**
 * Lo que Compras debería mostrar como recibido = lo que mostraba antes + lo físico confirmado.
 * FALTA = aún no lo registraron; NO_COINCIDE = lo registraron distinto; OK = coincide.
 */
export function estadoRegistroCompras(base: number, fisicaAcumulada: number, registrado: number): EstadoRegistroCompras {
  const esperado = base + fisicaAcumulada
  if (registrado === esperado) return 'OK'
  return registrado <= base ? 'FALTA' : 'NO_COINCIDE'
}

export const ETIQUETA_REGISTRO_COMPRAS: Record<EstadoRegistroCompras, string> = {
  OK: 'Compras ya lo tiene registrado',
  FALTA: 'Falta registrarlo en Compras',
  NO_COINCIDE: 'Compras tiene otra cantidad',
}

// ── Firmas del Acta de Recepción ────────────────────────────────────────────

export type RolFirma = 'JEFE_ALMACEN' | 'DIRECCION_TECNICA' | 'RESPONSABLE_CONTEO' | 'TRANSPORTISTA'
export const ROLES_FIRMA: readonly RolFirma[] = ['JEFE_ALMACEN', 'DIRECCION_TECNICA', 'RESPONSABLE_CONTEO', 'TRANSPORTISTA']

export const ETIQUETA_ROL_FIRMA: Record<RolFirma, string> = {
  JEFE_ALMACEN: 'Jefe de Almacén',
  DIRECCION_TECNICA: 'Dirección Técnica',
  RESPONSABLE_CONTEO: 'Responsable de conteo',
  TRANSPORTISTA: 'Transportista',
}

/** Qué rol WMS puede firmar cada parte (la base de datos es la que manda). */
export function puedeFirmarComo(roles: readonly Rol[], firma: RolFirma): boolean {
  switch (firma) {
    case 'JEFE_ALMACEN': return roles.includes('jefe_almacen') || roles.includes('reemplazo_jefe')
    case 'DIRECCION_TECNICA': return roles.includes('direccion_tecnica')
    case 'RESPONSABLE_CONTEO':
    case 'TRANSPORTISTA':
      return roles.some((r) => r === 'jefe_almacen' || r === 'reemplazo_jefe' || r === 'auxiliar' || r === 'asistente_dt')
  }
}

export interface EntradaTransportista { nombre: string; dni: string; placa: string; imagen: string }

export function validarTransportista(e: EntradaTransportista): { ok: true } | { ok: false; errores: Partial<Record<keyof EntradaTransportista, string>> } {
  const errores: Partial<Record<keyof EntradaTransportista, string>> = {}
  if (!e.nombre?.trim()) errores.nombre = 'Escribe el nombre del transportista.'
  if (!/^\d{8}$/.test(e.dni?.trim() ?? '')) errores.dni = 'El DNI tiene 8 dígitos.'
  if (!e.placa?.trim()) errores.placa = 'Escribe la placa del vehículo.'
  if (!e.imagen || e.imagen.length < 100) errores.imagen = 'Falta la firma del transportista en pantalla.'
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true }
}

// ── Numeración ──────────────────────────────────────────────────────────────

/** I-AAAAMM-NNNN (Acta de Recepción) · O-AAAAMM-NNNN (Acta Organoléptica, D-13). */
export function numeroDeActa(prefijo: 'I' | 'O', fecha: Date | string, correlativo: number): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  const aaaamm = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return `${prefijo}-${aaaamm}-${String(correlativo).padStart(4, '0')}`
}

// ── Muestra organoléptica ───────────────────────────────────────────────────

/** techo(√unidades) + constante (1). La muestra vuelve completa a su caja: no descuenta stock. */
export function muestraOrganoleptica(unidades: number, constante = 1): number {
  return Math.ceil(Math.sqrt(Math.max(unidades, 0))) + constante
}

// ── Checklist del Acta de Evaluación Organoléptica (LS-FR.55.02) ────────────

export type Respuesta = 'C' | 'NC' | 'NA'
export const ETIQUETA_RESPUESTA: Record<Respuesta, string> = { C: 'Conforme', NC: 'No conforme', NA: 'No aplica' }

export interface GrupoChecklist {
  id: string
  titulo: string
  /** Los grupos de material del envase se usan solo si el producto lo tiene. */
  opcional?: boolean
  items: { id: string; texto: string }[]
}

const generales = (p: string): GrupoChecklist['items'] => [
  { id: `${p}_identificacion`, texto: 'La identificación corresponde al producto' },
  { id: `${p}_rs`, texto: 'Registro sanitario y datos del fabricante y del importador' },
  { id: `${p}_cerrado`, texto: 'Cerrado' },
  { id: `${p}_limpio`, texto: 'Limpio' },
  { id: `${p}_sin_arrugas`, texto: 'Sin arrugas' },
  { id: `${p}_sin_quiebres`, texto: 'Sin quiebres ni humedad' },
  { id: `${p}_sin_deterioro`, texto: 'Sin deterioro ni deformación' },
  { id: `${p}_sin_manchas`, texto: 'Sin manchas' },
  { id: `${p}_sin_cuerpos`, texto: 'Sin cuerpos extraños' },
  { id: `${p}_sin_grietas`, texto: 'Sin grietas, rajaduras ni perforaciones' },
  { id: `${p}_sello`, texto: 'Sello de banda de seguridad intacto' },
  { id: `${p}_condiciones`, texto: 'Condiciones especiales de almacenamiento' },
]

const rotulado = (p: string): GrupoChecklist['items'] => [
  { id: `${p}_legible`, texto: 'Bien adherido o impreso y legible' },
  { id: `${p}_nombre`, texto: 'Nombre del producto y forma de presentación' },
  { id: `${p}_fabricante`, texto: 'Datos del fabricante y del importador' },
  { id: `${p}_contenido`, texto: 'Contenido de la información según el registro sanitario' },
  { id: `${p}_lote`, texto: 'N.º de lote' },
  { id: `${p}_vence`, texto: 'Fecha de vencimiento' },
  { id: `${p}_almacenamiento`, texto: 'Condiciones de almacenamiento' },
]

export const CHECKLIST_ORGANOLEPTICO: readonly GrupoChecklist[] = [
  {
    id: 'embalaje', titulo: 'II. Embalaje',
    items: [
      { id: 'emb_cerrado', texto: 'Cerrado' },
      { id: 'emb_limpio', texto: 'Limpio' },
      { id: 'emb_sin_arrugas', texto: 'Sin arrugas' },
      { id: 'emb_sin_quiebres', texto: 'Sin quiebres' },
      { id: 'emb_sin_humedad', texto: 'Sin humedad' },
      { id: 'emb_sin_deterioro', texto: 'Sin deterioro' },
    ],
  },
  { id: 'envase_mediato', titulo: 'Envase mediato', items: generales('mediato') },
  { id: 'envase_inmediato', titulo: 'Envase inmediato', items: generales('inmediato') },
  { id: 'rotulado_mediato', titulo: 'Rotulado mediato', items: rotulado('rotmed') },
  { id: 'rotulado_inmediato', titulo: 'Rotulado inmediato', items: rotulado('rotinm') },
  {
    id: 'vidrio', titulo: 'III. Envase de vidrio', opcional: true,
    items: [
      { id: 'vid_lleno', texto: 'Lleno o completo' },
      { id: 'vid_sin_manchas', texto: 'Sin manchas ni cuerpos extraños en el interior' },
      { id: 'vid_sin_grietas', texto: 'Sin grietas en ninguna parte del recipiente' },
      { id: 'vid_cierre', texto: 'Cierre hermético' },
    ],
  },
  {
    id: 'plastico', titulo: 'III. Envase de plástico', opcional: true,
    items: [
      { id: 'pla_sin_perforaciones', texto: 'Libre de perforaciones, grietas o roturas' },
      { id: 'pla_sin_deformaciones', texto: 'Libre de deformaciones o hendiduras que afecten el producto' },
      { id: 'pla_banda', texto: 'Con banda de seguridad intacta (cuando corresponda)' },
      { id: 'pla_cierre', texto: 'Cierre hermético' },
    ],
  },
  {
    id: 'tubo', titulo: 'III. Envase de tubo', opcional: true,
    items: [
      { id: 'tub_entero', texto: 'No está roto' },
      { id: 'tub_forma', texto: 'No está deforme' },
      { id: 'tub_lleno', texto: 'Lleno' },
      { id: 'tub_cierre', texto: 'Cierre hermético' },
    ],
  },
  {
    id: 'blister', titulo: 'III. Blíster termosellado', opcional: true,
    items: [
      { id: 'bli_entero', texto: 'No está roto' },
      { id: 'bli_lleno', texto: 'Lleno' },
      { id: 'bli_sellado', texto: 'Sellado' },
    ],
  },
  { id: 'otro', titulo: 'III. Otro material', opcional: true, items: [{ id: 'otro_ok', texto: 'Se ve en buen estado' }] },
]

export type Checklist = Record<string, Respuesta>

const todosLosItems = () => CHECKLIST_ORGANOLEPTICO.flatMap((g) => g.items.map((i) => ({ ...i, grupo: g })))

/** Items sin responder en los grupos obligatorios, y en un grupo opcional si ya se empezó a usar. */
export function itemsPendientes(c: Checklist): string[] {
  const pendientes: string[] = []
  for (const g of CHECKLIST_ORGANOLEPTICO) {
    const respondidos = g.items.filter((i) => c[i.id]).length
    if (g.opcional && respondidos === 0) continue
    for (const i of g.items) if (!c[i.id]) pendientes.push(i.id)
  }
  const algunMaterial = CHECKLIST_ORGANOLEPTICO.some((g) => g.opcional && g.items.some((i) => c[i.id]))
  if (!algunMaterial) pendientes.push('material')
  return pendientes
}

export const checklistCompleto = (c: Checklist) => itemsPendientes(c).length === 0

/** Con un solo "no conforme", la conclusión sugerida es NO CONFORME. */
export function sugerirConclusion(c: Checklist): 'CONFORME' | 'NO_CONFORME' {
  return Object.values(c).includes('NC') ? 'NO_CONFORME' : 'CONFORME'
}

export const itemsNoConformes = (c: Checklist): string[] =>
  todosLosItems().filter((i) => c[i.id] === 'NC').map((i) => `${i.grupo.titulo}: ${i.texto}`)

export type DestinoSugerido = 'APROBADO' | 'DEVOLUCION' | 'BAJA'
export type Decision = 'APROBADO' | 'BAJAS_RECHAZADOS'

export interface DatosOrganoleptica {
  certAnalisis: boolean | null
  checklist: Checklist
  observacion?: string
  destinoSugerido: DestinoSugerido | null
  conclusion: 'CONFORME' | 'NO_CONFORME' | null
}

/** ¿Está el acta lista para ir a Dirección Técnica? Devuelve lo que falta, en lenguaje claro. */
export function faltantesParaEnviar(d: DatosOrganoleptica): string[] {
  const f: string[] = []
  if (d.certAnalisis == null) f.push('Indica si trae certificado de análisis.')
  const pend = itemsPendientes(d.checklist)
  if (pend.includes('material')) f.push('Marca el material del envase (vidrio, plástico, tubo, blíster u otro).')
  const sinResponder = pend.filter((p) => p !== 'material').length
  if (sinResponder > 0) f.push(`Faltan ${sinResponder} puntos del checklist por responder.`)
  if (!d.destinoSugerido) f.push('Elige el destino que sugieres.')
  if (!d.conclusion) f.push('Elige la conclusión (conforme o no conforme).')
  return f
}

/** Lo que Dirección Técnica puede decidir según la conclusión del acta. */
export function validarDecision(
  decision: Decision, conclusion: 'CONFORME' | 'NO_CONFORME' | null, rsVence: string | undefined, hoy: string,
): { ok: true } | { ok: false; mensaje: string } {
  if (decision === 'APROBADO') {
    if (conclusion !== 'CONFORME') return { ok: false, mensaje: 'El acta concluye NO CONFORME: no se puede aprobar. Decide Bajas/Rechazados o pide que la corrijan.' }
    if (rsVence && rsVence < hoy) {
      return { ok: false, mensaje: 'El registro sanitario está vencido: el lote no se puede aprobar hasta que Dirección Técnica lo resuelva.' }
    }
  }
  return { ok: true }
}

export const ETIQUETA_DECISION: Record<Decision, string> = { APROBADO: 'Aprobado', BAJAS_RECHAZADOS: 'Bajas/Rechazados' }

// ── Estado de una solicitud (para la lista y el paso a paso) ────────────────

export type EstadoActa = 'BORRADOR' | 'FIRMADA' | 'ANULADA'

export type PasoSolicitud = 'POR_AUTORIZAR' | 'POR_LLEGAR' | 'VERIFICANDO' | 'ACTA' | 'FIRMAS' | 'CONFIRMAR' | 'CERRADA' | 'ANULADA'

export const ETIQUETA_PASO: Record<PasoSolicitud, string> = {
  POR_AUTORIZAR: 'Por autorizar',
  POR_LLEGAR: 'Por llegar',
  VERIFICANDO: 'Verificando lo que llegó',
  ACTA: 'Falta generar el acta',
  FIRMAS: 'Acta en firma',
  CONFIRMAR: 'Listo para confirmar',
  CERRADA: 'Cerrada',
  ANULADA: 'Anulada',
}

export function pasoDeSolicitud(s: {
  estado: EstadoSolicitud
  lineasPendientes: number
  acta?: { estado: EstadoActa; firmas: number }
}): PasoSolicitud {
  switch (s.estado) {
    case 'BORRADOR': case 'ENVIADA': return 'POR_AUTORIZAR'
    case 'PROGRAMADA': return 'POR_LLEGAR'
    case 'CERRADA': return 'CERRADA'
    case 'ANULADA': return 'ANULADA'
    case 'EN_RECEPCION':
      if (!s.acta || s.acta.estado === 'ANULADA') return s.lineasPendientes > 0 ? 'VERIFICANDO' : 'ACTA'
      return s.acta.estado === 'FIRMADA' ? 'CONFIRMAR' : 'FIRMAS'
  }
}

/** Lo que falta para generar el acta, en el mismo orden y con los mismos mensajes de la base de datos. */
export function puedeGenerarActa(i: {
  tipo: TipoIngreso
  tieneDocOriginal: boolean
  lineas: { descripcion: string; lote: string; verificacion: VerificacionLinea | null; tienePosicion: boolean }[]
  tieneTemperatura: boolean
}): string | null {
  if (i.tipo === 'DEVOLUCION' && !i.tieneDocOriginal) return 'La devolución necesita la factura o boleta original.'
  if (i.lineas.length === 0) return 'No hay nada que recibir: la solicitud no tiene líneas con cantidad.'
  for (const l of i.lineas) {
    if (!l.verificacion || l.verificacion === 'PENDIENTE') return `Falta verificar ${l.descripcion} (lote ${l.lote}).`
    if (!l.tienePosicion) return `Elige dónde se deja ${l.descripcion} (lote ${l.lote}).`
  }
  if (!i.tieneTemperatura) return 'Falta la temperatura de recepción.'
  return null
}


// ── Alertas ─────────────────────────────────────────────────────────────────

export type TipoAlerta =
  | 'TEMPERATURA' | 'RS_VENCIDO' | 'DIVERGENCIA_COMPRAS' | 'POR_TRASLADAR_VENCIDO' | 'LOTE_POR_VENCER' | 'LOTE_VENCIDO'
  | 'SOLICITUD_AJUSTADA' | 'EXCEDE_OC' | 'POR_REGISTRAR_EN_COMPRAS' | 'NO_COINCIDE_CON_COMPRAS'
  | 'MOVIMIENTO_CON_DIFERENCIA' | 'MOVIMIENTO_SIN_VERIFICAR' | 'CONTEO_CON_DIFERENCIA' | 'AJUSTE_POR_AUTORIZAR' | 'PENDIENTE_AFECTA_PRODUCTO'

export type DestinatarioAlerta = 'direccion_tecnica' | 'jefe_almacen' | 'asistente_dt'

export const ETIQUETA_ALERTA: Record<TipoAlerta, string> = {
  TEMPERATURA: 'Temperatura fuera de rango',
  RS_VENCIDO: 'Registro sanitario vencido',
  DIVERGENCIA_COMPRAS: 'Compras cambió la cantidad',
  POR_TRASLADAR_VENCIDO: 'Aprobado sin trasladar',
  LOTE_POR_VENCER: 'Lote por vencer',
  LOTE_VENCIDO: 'Lote vencido en el inventario',
  SOLICITUD_AJUSTADA: 'La solicitud cambió',
  EXCEDE_OC: 'Llega más de lo que pedía la OC',
  POR_REGISTRAR_EN_COMPRAS: 'Falta registrarlo en Compras',
  NO_COINCIDE_CON_COMPRAS: 'Compras tiene otra cantidad',
  MOVIMIENTO_CON_DIFERENCIA: 'Movimiento con diferencia',
  MOVIMIENTO_SIN_VERIFICAR: 'Movimiento sin verificar',
  PENDIENTE_AFECTA_PRODUCTO: 'Pendiente que puede afectar producto',
  CONTEO_CON_DIFERENCIA: 'Conteo con diferencia',
  AJUSTE_POR_AUTORIZAR: 'Ajuste por autorizar',
}

/** Quién recibe cada tipo. Los avisos de la solicitud y de Compras se envían a más de una persona (una alerta por destinatario). */
export const DESTINATARIO_ALERTA: Record<TipoAlerta, DestinatarioAlerta> = {
  TEMPERATURA: 'direccion_tecnica',
  RS_VENCIDO: 'direccion_tecnica',
  DIVERGENCIA_COMPRAS: 'jefe_almacen',
  POR_TRASLADAR_VENCIDO: 'jefe_almacen',
  // Por vencer: el Jefe de Almacén lo rota o lo saca primero. Vencido: Dirección Técnica decide su baja.
  LOTE_POR_VENCER: 'jefe_almacen',
  LOTE_VENCIDO: 'direccion_tecnica',
  // D-34: toda diferencia entre lo anunciado y lo final avisa a Sandra y a Katia.
  SOLICITUD_AJUSTADA: 'asistente_dt',
  // D-33: EXCEDE_OC escala a Katia (y a Compras, fuera del WMS); el WMS registra lo físico y no lo resuelve.
  EXCEDE_OC: 'direccion_tecnica',
  POR_REGISTRAR_EN_COMPRAS: 'jefe_almacen',
  NO_COINCIDE_CON_COMPRAS: 'jefe_almacen',
  // INV-02 / INV-05: una diferencia abierta la resuelve el Jefe; un ajuste lo autoriza Dirección Técnica.
  MOVIMIENTO_CON_DIFERENCIA: 'jefe_almacen',
  // Un movimiento ejecutado que pasa más de N horas (24 por defecto) sin verificar: sus unidades siguen en tránsito.
  MOVIMIENTO_SIN_VERIFICAR: 'jefe_almacen',
  // INV-04: un pendiente de la revisión diaria que puede afectar producto avisa a Dirección Técnica.
  PENDIENTE_AFECTA_PRODUCTO: 'direccion_tecnica',
  CONTEO_CON_DIFERENCIA: 'jefe_almacen',
  AJUSTE_POR_AUTORIZAR: 'direccion_tecnica',
}

export function puedeAtenderAlerta(roles: readonly Rol[], destinatario: DestinatarioAlerta): boolean {
  return roles.includes('direccion_tecnica') || roles.includes(destinatario)
}

export const PLAZO_POR_TRASLADAR_HORAS_DEFECTO = 24
export const PLAZO_REGISTRO_COMPRAS_HORAS_DEFECTO = 24
/** Horas sin verificar un movimiento ejecutado antes de avisar al Jefe (parámetro `movimiento_sin_verificar_horas`). */
export const PLAZO_MOVIMIENTO_SIN_VERIFICAR_HORAS_DEFECTO = 24

/** Días antes del vencimiento de un lote en que se avisa (parámetro `lote_dias_alerta_vencimiento`; D-30 por confirmar con Katia). */
export const DIAS_ALERTA_VENCIMIENTO_LOTE_DEFECTO = 90

export type SituacionLote = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' | 'SIN_FECHA'

/** Vencido = su fecha ya pasó (el último día aún sirve). Por vencer = vence dentro del umbral. */
export function situacionLote(vence: string | undefined | null, hoy: string, umbralDias = DIAS_ALERTA_VENCIMIENTO_LOTE_DEFECTO): SituacionLote {
  if (!vence) return 'SIN_FECHA'
  const d = Math.round((Date.parse(`${vence}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000)
  return d < 0 ? 'VENCIDO' : d <= umbralDias ? 'POR_VENCER' : 'VIGENTE'
}

export const diasParaVencer = (vence: string, hoy: string) =>
  Math.round((Date.parse(`${vence}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000)

/** D-28: ¿lleva "Aprobado · por trasladar" más tiempo del permitido? */
export function porTrasladarVencido(desdeIso: string, ahoraIso: string, plazoHoras = PLAZO_POR_TRASLADAR_HORAS_DEFECTO): boolean {
  return Date.parse(ahoraIso) - Date.parse(desdeIso) > plazoHoras * 3_600_000
}

// ── Expediente ──────────────────────────────────────────────────────────────

export type TipoDocumentoExpediente =
  | 'ACTA_RECEPCION' | 'SOLICITUD_INGRESO' | 'GUIA_REMISION' | 'FACTURA' | 'FACTURA_BOLETA_ORIGINAL'
  | 'FORMULARIO_DEVOLUCION' | 'ACTA_ORGANOLEPTICA' | 'OTRO'

export const ETIQUETA_DOCUMENTO: Record<TipoDocumentoExpediente, string> = {
  ACTA_RECEPCION: 'Acta de Recepción',
  SOLICITUD_INGRESO: 'Solicitud de Ingreso',
  GUIA_REMISION: 'Guía de remisión',
  FACTURA: 'Factura',
  FACTURA_BOLETA_ORIGINAL: 'Factura o boleta original',
  FORMULARIO_DEVOLUCION: 'Formulario de devolución',
  ACTA_ORGANOLEPTICA: 'Acta organoléptica',
  OTRO: 'Otro documento',
}

export const ESTADO_PARA_LISTA: Record<Estado, string> = { CUARENTENA: 'Cuarentena', DEVOLUCIONES: 'Devoluciones', APROBADO: 'Aprobado', BAJAS_RECHAZADOS: 'Bajas/Rechazados' }

