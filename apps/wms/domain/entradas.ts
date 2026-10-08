// Entradas y calidad: reglas puras (sin Next ni Supabase). La base de datos repite estas
// reglas (migración 0004); aquí se usan para dar mensajes claros antes de llegar a ella
// y para el modo demostración.

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
  COMPRA_LOCAL: 'Una recepción que ya registró Compras. La cantidad de referencia viene de ahí.',
  DEVOLUCION: 'Mercadería que vuelve de un cliente. Necesita la factura o boleta original.',
  INGRESO_CLIENTE: 'Mercadería que un cliente nos entrega para guardar. Se cuenta contra su guía.',
}

// ── Lotes y cuadre ──────────────────────────────────────────────────────────

export interface LineaCuadre {
  id: string
  descripcion: string
  cantidadReferencia: number
}
export interface LoteCuadre {
  lineaId: string
  codigo: string
  cantidad: number
}

export interface ProgresoLinea {
  referencia: number
  registrado: number
  /** Negativo cuando sobran. */
  faltan: number
  estado: 'VACIA' | 'FALTAN' | 'CUADRA' | 'SOBRAN'
}

/** "4 de 6": cuánto del total de la referencia ya está repartido en lotes. */
export function progresoLinea(referencia: number, lotes: readonly { cantidad: number }[]): ProgresoLinea {
  const registrado = lotes.reduce((n, l) => n + l.cantidad, 0)
  const faltan = referencia - registrado
  return {
    referencia,
    registrado,
    faltan,
    estado: registrado === 0 ? 'VACIA' : faltan === 0 ? 'CUADRA' : faltan > 0 ? 'FALTAN' : 'SOBRAN',
  }
}

export const textoProgreso = (p: ProgresoLinea) => `${p.registrado.toLocaleString('es-PE')} de ${p.referencia.toLocaleString('es-PE')}`

/** Mensaje humano de cada línea que no cuadra (invariante: SUM(lotes) = referencia). */
export function mensajesDeCuadre(lineas: readonly LineaCuadre[], lotes: readonly LoteCuadre[]): string[] {
  const out: string[] = []
  for (const l of lineas) {
    const p = progresoLinea(l.cantidadReferencia, lotes.filter((x) => x.lineaId === l.id))
    if (p.estado === 'CUADRA') continue
    out.push(
      `Los lotes de ${l.descripcion} suman ${p.registrado} y la referencia es ${p.referencia}: ` +
        (p.faltan > 0 ? `faltan ${p.faltan} por repartir.` : `sobran ${-p.faltan}; ajusta los lotes para que coincidan.`),
    )
  }
  return out
}

export interface EntradaLote {
  codigo: string
  cantidad: number | string
  /** Texto tal como lo escribe la persona (ver parsearVencimiento). */
  vence: string
  posicionId: string
}

export type ErroresLote = Partial<Record<'codigo' | 'cantidad' | 'vence' | 'posicionId', string>>

export function validarEntradaLote(
  e: EntradaLote,
  parsear: (t: string) => { fecha: string; textoOriginal: string } | null,
): { ok: true; cantidad: number; vence: string; venceTexto: string } | { ok: false; errores: ErroresLote } {
  const errores: ErroresLote = {}
  if (!e.codigo?.trim()) errores.codigo = 'Escribe el lote tal como está impreso.'
  const n = typeof e.cantidad === 'number' ? e.cantidad : Number(String(e.cantidad).replace(/\s/g, ''))
  if (!Number.isInteger(n) || n <= 0) errores.cantidad = 'La cantidad es un número entero mayor que cero.'
  const f = e.vence?.trim() ? parsear(e.vence) : null
  if (!e.vence?.trim()) errores.vence = 'Falta el vencimiento.'
  else if (!f) errores.vence = 'No entiendo esa fecha. Usa 30/06/2028 o, si el producto solo dice mes y año, 06/2028.'
  if (!e.posicionId) errores.posicionId = 'Elige dónde se deja.'
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

// ── Validación al crear un ingreso ──────────────────────────────────────────

export interface EntradaIngreso {
  tipo: TipoIngreso
  propietarioId: string
  /** Compra local: la recepción de Compras. */
  compraRecepcionId?: string
  contraparteNombre?: string
  contraparteRuc?: string
  guiaNumero?: string
  docOriginalTipo?: 'FACTURA' | 'BOLETA'
  docOriginalNumero?: string
  motivo?: string
  lineas?: { productoId: string; cantidadReferencia: number | string }[]
}

export type ErroresIngreso = Partial<Record<
  'tipo' | 'propietarioId' | 'compraRecepcionId' | 'contraparteRuc' | 'guiaNumero' | 'docOriginal' | 'lineas', string>>

export function validarEntradaIngreso(
  e: EntradaIngreso,
  propietario: Pick<Propietario, 'esDuenoAlmacen'> | undefined,
): { ok: true } | { ok: false; errores: ErroresIngreso } {
  const errores: ErroresIngreso = {}
  if (!TIPOS_INGRESO.includes(e.tipo)) errores.tipo = 'Elige el tipo de ingreso.'
  if (!propietario) errores.propietarioId = 'Elige el propietario.'
  if (e.contraparteRuc?.trim() && !rucValido(e.contraparteRuc)) errores.contraparteRuc = 'El RUC tiene 11 dígitos.'
  if (e.tipo === 'COMPRA_LOCAL') {
    if (!e.compraRecepcionId) errores.compraRecepcionId = 'Elige la recepción de Compras.'
    if (propietario && !propietario.esDuenoAlmacen) errores.propietarioId = 'Una compra local es stock propio: el propietario es Logissa.'
  } else {
    if (e.tipo === 'DEVOLUCION' && (!e.docOriginalTipo || !e.docOriginalNumero?.trim())) {
      errores.docOriginal = 'Sin la factura o boleta original no se puede registrar la devolución.'
    }
    if (e.tipo === 'INGRESO_CLIENTE') {
      if (!e.guiaNumero?.trim()) errores.guiaNumero = 'Escribe el número de la guía del cliente.'
      if (propietario?.esDuenoAlmacen) errores.propietarioId = 'Un ingreso de cliente queda a nombre del cliente, no de Logissa.'
    }
    const lineas = e.lineas ?? []
    if (lineas.length === 0) errores.lineas = 'Agrega al menos un producto con su cantidad de la guía.'
    else if (lineas.some((l) => !l.productoId || !Number.isInteger(Number(l.cantidadReferencia)) || Number(l.cantidadReferencia) <= 0)) {
      errores.lineas = 'Cada producto necesita una cantidad entera mayor que cero.'
    }
    if (new Set(lineas.map((l) => l.productoId)).size !== lineas.length) errores.lineas = 'Un producto aparece dos veces: junta sus cantidades.'
  }
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true }
}

/** RUC peruano: siempre texto de 11 dígitos (nunca número: perdería ceros y se vería como 2.05E+10). */
export const rucValido = (r: string) => /^\d{11}$/.test(r.trim())

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

// ── Estado de un ingreso (para la lista y el paso a paso) ───────────────────

export type EstadoActa = 'BORRADOR' | 'FIRMADA' | 'ANULADA'

export type PasoIngreso = 'DATOS_Y_LOTES' | 'ACTA' | 'FIRMAS' | 'CONFIRMAR' | 'CONFIRMADO'

export const ETIQUETA_PASO: Record<PasoIngreso, string> = {
  DATOS_Y_LOTES: 'Registrando lotes',
  ACTA: 'Falta generar el acta',
  FIRMAS: 'Acta en firma',
  CONFIRMAR: 'Listo para confirmar',
  CONFIRMADO: 'En Cuarentena',
}

export function pasoDeIngreso(i: {
  confirmado: boolean
  cuadra: boolean
  tieneTemperatura: boolean
  acta?: { estado: EstadoActa; firmas: number }
}): PasoIngreso {
  if (i.confirmado) return 'CONFIRMADO'
  if (!i.acta || i.acta.estado === 'ANULADA') return 'DATOS_Y_LOTES'
  return i.acta.estado === 'FIRMADA' ? 'CONFIRMAR' : 'FIRMAS'
}

export function puedeGenerarActa(i: { cuadra: boolean; tieneTemperatura: boolean; tipo: TipoIngreso; tieneDocOriginal: boolean }): string | null {
  if (i.tipo === 'DEVOLUCION' && !i.tieneDocOriginal) return 'La devolución necesita la factura o boleta original.'
  if (!i.cuadra) return 'Los lotes tienen que sumar exactamente la cantidad de referencia.'
  if (!i.tieneTemperatura) return 'Falta la temperatura de recepción.'
  return null
}

// ── Alertas ─────────────────────────────────────────────────────────────────

export type TipoAlerta = 'TEMPERATURA' | 'RS_VENCIDO' | 'DIVERGENCIA_COMPRAS' | 'POR_TRASLADAR_VENCIDO'

export const ETIQUETA_ALERTA: Record<TipoAlerta, string> = {
  TEMPERATURA: 'Temperatura fuera de rango',
  RS_VENCIDO: 'Registro sanitario vencido',
  DIVERGENCIA_COMPRAS: 'Compras cambió la cantidad',
  POR_TRASLADAR_VENCIDO: 'Aprobado sin trasladar',
}

export const DESTINATARIO_ALERTA: Record<TipoAlerta, 'direccion_tecnica' | 'jefe_almacen'> = {
  TEMPERATURA: 'direccion_tecnica',
  RS_VENCIDO: 'direccion_tecnica',
  DIVERGENCIA_COMPRAS: 'jefe_almacen',
  POR_TRASLADAR_VENCIDO: 'jefe_almacen',
}

export function puedeAtenderAlerta(roles: readonly Rol[], tipo: TipoAlerta): boolean {
  return roles.includes('direccion_tecnica') || roles.includes(DESTINATARIO_ALERTA[tipo])
}

export const PLAZO_POR_TRASLADAR_HORAS_DEFECTO = 24

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

export const ESTADO_PARA_LISTA: Record<Estado, string> = { CUARENTENA: 'Cuarentena', APROBADO: 'Aprobado', BAJAS_RECHAZADOS: 'Bajas/Rechazados' }
